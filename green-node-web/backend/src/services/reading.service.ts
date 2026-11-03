import { Reading, IReading } from '../models/Reading.js';
import { Device, IDevice } from '../models/Device.js';
import { Greenhouse, IGreenhouse } from '../models/Greenhouse.js';
import { Company, ICompany } from '../models/Company.js';
import { Log } from '../models/Log.js';
import { broadcast } from './websocket.service.js';
import { LoggerService } from './logger.service.js';
import type {
  CreateReadingInput,
  QueryReadingsInput,
  RegisterDeviceInput,
  UpdateDeviceInput,
  HeartbeatInput,
  CreateCompanyInput,
  CreateGreenhouseInput
} from '../schemas/reading.schema.js';

export class ReadingService {
  /**
   * Save a single sensor reading and broadcast it in real time.
   * STRICT REGISTRATION ENFORCED: Rejects any ESP UUID that has not been pre-registered.
   */
  static async saveReading(input: CreateReadingInput, callerIp?: string): Promise<IReading> {
    const normalizedDeviceId = input.deviceId.toLowerCase();

    // 1. Mandatory Pre-Registration Verification
    const registeredDevice = await Device.findOne({
      deviceId: normalizedDeviceId,
      isRegistered: true
    });

    if (!registeredDevice) {
      await LoggerService.recordLog({
        level: 'warn',
        category: 'telemetry',
        deviceId: normalizedDeviceId,
        message: `Blocked incoming packet from UNREGISTERED ESP node "${normalizedDeviceId}". Register this device in the dashboard first.`,
        details: { deviceId: normalizedDeviceId, callerIp }
      });

      const err: any = new Error(
        `ESP device "${normalizedDeviceId}" is not registered. Please register the device with a Company and Greenhouse in the dashboard first.`
      );
      err.statusCode = 403;
      throw err;
    }

    // 2. Persist Reading tagged with Company, Greenhouse, and Plant
    const reading = new Reading({
      ...input,
      deviceId: normalizedDeviceId,
      companyId: registeredDevice.companyId,
      companyName: registeredDevice.companyName,
      companyLocation: registeredDevice.companyLocation,
      greenhouseId: registeredDevice.greenhouseId,
      plant: registeredDevice.plant
    });
    const savedReading = await reading.save();

    // 3. Update Device state
    const updateFields: any = {
      lastSeen: savedReading.timestamp,
      status: 'online',
      latestReading: {
        temperature: savedReading.temperature,
        humidity: savedReading.humidity,
        soilMoisture: savedReading.soilMoisture,
        light: savedReading.light,
        espTemperature: savedReading.espTemperature,
        wifiSsid: savedReading.wifiSsid,
        timestamp: savedReading.timestamp
      }
    };

    if (savedReading.wifiSsid) {
      updateFields.wifiSsid = savedReading.wifiSsid;
    }

    if (callerIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(callerIp)) {
      updateFields.ipAddress = callerIp.replace('::ffff:', '');
    }

    await Device.updateOne({ _id: registeredDevice._id }, { $set: updateFields });

    // 4. Real-time broadcast with Greenhouse & Plant metadata
    broadcast('new_reading', {
      ...savedReading.toObject(),
      companyId: registeredDevice.companyId,
      companyName: registeredDevice.companyName,
      companyLocation: registeredDevice.companyLocation,
      greenhouseId: registeredDevice.greenhouseId,
      greenhouseName: registeredDevice.greenhouseName,
      plant: registeredDevice.plant,
      deviceLocation: registeredDevice.location,
      deviceName: registeredDevice.name,
      deviceStatus: 'online'
    });

    // 5. Auto-save log to database
    await LoggerService.recordLog({
      level: 'success',
      category: 'telemetry',
      deviceId: savedReading.deviceId,
      message: `[${registeredDevice.greenhouseName} (${registeredDevice.plant})] Packet from "${registeredDevice.name}": Temp=${savedReading.temperature}°C, Hum=${savedReading.humidity}%, Soil=${savedReading.soilMoisture}%, Light=${savedReading.light} Lux`,
      details: {
        companyId: registeredDevice.companyId,
        greenhouseId: registeredDevice.greenhouseId,
        plant: registeredDevice.plant,
        temperature: savedReading.temperature,
        humidity: savedReading.humidity,
        soilMoisture: savedReading.soilMoisture,
        light: savedReading.light,
        espTemperature: savedReading.espTemperature
      }
    });

    return savedReading;
  }

  /**
   * Bulk insert multiple readings with strict registration check
   */
  static async saveBatchReadings(readingsData: CreateReadingInput[]): Promise<{ count: number }> {
    if (readingsData.length === 0) return { count: 0 };

    const distinctIds = Array.from(new Set(readingsData.map((r) => r.deviceId.toLowerCase())));
    const registeredDevices = await Device.find({
      deviceId: { $in: distinctIds },
      isRegistered: true
    }).lean();

    const registeredMap = new Map<string, any>(
      registeredDevices.map((d) => [d.deviceId.toLowerCase(), d])
    );

    const validReadings: any[] = [];
    for (const r of readingsData) {
      const dev = registeredMap.get(r.deviceId.toLowerCase());
      if (dev) {
        validReadings.push({
          ...r,
          deviceId: r.deviceId.toLowerCase(),
          companyId: dev.companyId,
          companyName: dev.companyName,
          companyLocation: dev.companyLocation,
          greenhouseId: dev.greenhouseId,
          plant: dev.plant
        });
      }
    }

    if (validReadings.length === 0) {
      const err: any = new Error('None of the device IDs in this batch are registered.');
      err.statusCode = 403;
      throw err;
    }

    const inserted = await Reading.insertMany(validReadings);

    if (inserted.length > 0) {
      const latest = inserted.reduce((prev, curr) =>
        new Date(curr.timestamp) > new Date(prev.timestamp) ? curr : prev
      );
      const dev = registeredMap.get(latest.deviceId.toLowerCase());

      if (dev) {
        await Device.updateOne(
          { _id: dev._id },
          {
            $set: {
              lastSeen: latest.timestamp,
              status: 'online',
              latestReading: {
                temperature: latest.temperature,
                humidity: latest.humidity,
                soilMoisture: latest.soilMoisture,
                light: latest.light,
                espTemperature: latest.espTemperature,
                wifiSsid: latest.wifiSsid,
                timestamp: latest.timestamp
              }
            }
          }
        );
      }

      broadcast('batch_readings', {
        count: inserted.length,
        latest: {
          ...latest.toObject(),
          companyId: dev?.companyId,
          companyName: dev?.companyName,
          greenhouseId: dev?.greenhouseId,
          plant: dev?.plant,
          deviceName: dev?.name
        }
      });
    }

    return { count: inserted.length };
  }

  /**
   * Query readings with filtering, pagination, and sorting
   */
  static async getReadings(query: QueryReadingsInput) {
    const { deviceId, greenhouseId, companyId, companyLocation, startDate, endDate, page, limit, sortBy, sortOrder } = query;

    const filter: any = {};

    if (deviceId) filter.deviceId = deviceId.toLowerCase();
    if (greenhouseId) filter.greenhouseId = greenhouseId.toLowerCase();
    if (companyId) filter.companyId = companyId.toLowerCase();
    if (companyLocation) filter.companyLocation = companyLocation;

    if (startDate || endDate) {
      filter.timestamp = {};
      if (startDate) filter.timestamp.$gte = new Date(startDate);
      if (endDate) filter.timestamp.$lte = new Date(endDate);
    }

    const skip = (page - 1) * limit;
    const sort: Record<string, 1 | -1> = {
      [sortBy]: sortOrder === 'asc' ? 1 : -1
    };

    const [items, total] = await Promise.all([
      Reading.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Reading.countDocuments(filter)
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get latest reading and attach device status
   */
  static async getLatestReading(deviceId?: string, greenhouseId?: string) {
    const filter: any = {};
    if (deviceId) filter.deviceId = deviceId.toLowerCase();
    if (greenhouseId) filter.greenhouseId = greenhouseId.toLowerCase();

    const reading = await Reading.findOne(filter).sort({ timestamp: -1 }).lean();
    if (!reading) return null;

    const device = await Device.findOne({ deviceId: reading.deviceId }).lean();
    const health = device ? this.computeHealth(device) : null;

    return {
      ...reading,
      deviceLocation: device?.location || 'Zone 1',
      deviceName: device?.name || `Sensor Module ${reading.deviceId.substring(0, 8)}`,
      greenhouseId: device?.greenhouseId || reading.greenhouseId || 'greenhouse-01',
      greenhouseName: device?.greenhouseName || 'Greenhouse 01',
      companyId: device?.companyId || reading.companyId || 'default-company',
      companyName: device?.companyName || reading.companyName || 'Main Facility',
      companyLocation: device?.companyLocation || reading.companyLocation || 'Main Location',
      plant: device?.plant || reading.plant || 'Crops',
      deviceStatus: health?.status || 'unknown',
      isDeviceOnline: health?.isOnline ?? false
    };
  }

  /**
   * Calculate aggregated metrics (min, max, avg) for all sensors
   */
  static async getStats(deviceId?: string, hours: number = 24, greenhouseId?: string) {
    const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const matchFilter: any = { timestamp: { $gte: sinceDate } };

    if (deviceId) {
      matchFilter.deviceId = deviceId.toLowerCase();
    }
    if (greenhouseId) {
      matchFilter.greenhouseId = greenhouseId.toLowerCase();
    }

    const aggregation = await Reading.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalReadings: { $sum: 1 },
          avgTemperature: { $avg: '$temperature' },
          minTemperature: { $min: '$temperature' },
          maxTemperature: { $max: '$temperature' },
          avgHumidity: { $avg: '$humidity' },
          minHumidity: { $min: '$humidity' },
          maxHumidity: { $max: '$humidity' },
          avgSoilMoisture: { $avg: '$soilMoisture' },
          minSoilMoisture: { $min: '$soilMoisture' },
          maxSoilMoisture: { $max: '$soilMoisture' },
          avgLight: { $avg: '$light' },
          avgEspTemperature: { $avg: '$espTemperature' },
          minLight: { $min: '$light' },
          maxLight: { $max: '$light' }
        }
      }
    ]);

    if (!aggregation || aggregation.length === 0) {
      return {
        timeframeHours: hours,
        totalReadings: 0,
        message: 'No sensor data found for the selected time window'
      };
    }

    const stats = aggregation[0];
    delete stats._id;

    const round = (val: number | null) => (val !== null ? Math.round(val * 100) / 100 : null);

    return {
      timeframeHours: hours,
      totalReadings: stats.totalReadings,
      temperature: {
        avg: round(stats.avgTemperature),
        min: stats.minTemperature,
        max: stats.maxTemperature,
        unit: '°C'
      },
      humidity: {
        avg: round(stats.avgHumidity),
        min: stats.minHumidity,
        max: stats.maxHumidity,
        unit: '%'
      },
      soilMoisture: {
        avg: round(stats.avgSoilMoisture),
        min: stats.minSoilMoisture,
        max: stats.maxSoilMoisture,
        unit: '%'
      },
      light: {
        avg: round(stats.avgLight),
        min: stats.minLight,
        max: stats.maxLight,
        unit: 'Lux'
      },
      espTemperature: {
        avg: round(stats.avgEspTemperature),
        unit: '°C'
      }
    };
  }

  // ==========================================================================
  // COMPANY MANAGEMENT METHODS
  // ==========================================================================

  /**
   * Register a new Company (Name & Location)
   */
  static async createCompany(input: CreateCompanyInput): Promise<ICompany> {
    const companyId = input.companyId.toLowerCase();
    const existing = await Company.findOne({ companyId });
    if (existing) {
      const err: any = new Error(`Company with ID "${companyId}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const company = await Company.create({
      companyId,
      name: input.name.trim(),
      location: input.location.trim(),
      description: input.description?.trim()
    });

    await LoggerService.recordLog({
      level: 'success',
      category: 'system',
      message: `Registered Company "${company.name}" at location "${company.location}" (${company.companyId})`,
      details: { companyId: company.companyId, name: company.name, location: company.location }
    });

    broadcast('company_registered', company);

    return company;
  }

  /**
   * List all registered Companies with counts of their greenhouses
   */
  static async getCompanies() {
    const companies = await Company.find().sort({ name: 1 }).lean();

    const results = await Promise.all(
      companies.map(async (comp) => {
        const greenhouses = await Greenhouse.find({ companyId: comp.companyId }).lean();
        return {
          ...comp,
          totalGreenhouses: greenhouses.length,
          greenhouses: greenhouses.map((gh) => ({
            greenhouseId: gh.greenhouseId,
            name: gh.name,
            plant: gh.plant,
            assignedDevicesCount: gh.assignedDeviceIds.length
          }))
        };
      })
    );

    return results;
  }

  /**
   * Get single company by ID
   */
  static async getCompanyById(companyId: string) {
    const company = await Company.findOne({ companyId: companyId.toLowerCase() }).lean();
    if (!company) return null;

    const greenhouses = await Greenhouse.find({ companyId: company.companyId }).lean();
    return {
      ...company,
      totalGreenhouses: greenhouses.length,
      greenhouses
    };
  }

  // ==========================================================================
  // GREENHOUSE MANAGEMENT METHODS (Under Registered Company)
  // ==========================================================================

  /**
   * Register a new Greenhouse under an existing Registered Company.
   * Asks for Greenhouse Name and Plant/Crop.
   */
  static async createGreenhouse(input: CreateGreenhouseInput): Promise<IGreenhouse> {
    const greenhouseId = input.greenhouseId.toLowerCase();
    const companyId = input.companyId.toLowerCase();

    // Verify parent company exists
    const company = await Company.findOne({ companyId });
    if (!company) {
      const err: any = new Error(`Cannot register greenhouse: Company "${companyId}" is not registered. Please register the company first.`);
      err.statusCode = 404;
      throw err;
    }

    const existing = await Greenhouse.findOne({ greenhouseId });
    if (existing) {
      const err: any = new Error(`Greenhouse with ID "${greenhouseId}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const greenhouse = await Greenhouse.create({
      greenhouseId,
      name: input.name.trim(),
      companyId: company.companyId,
      companyName: company.name,
      companyLocation: company.location,
      plant: input.plant.trim(),
      description: input.description?.trim(),
      assignedDeviceIds: input.assignedDeviceIds || []
    });

    await LoggerService.recordLog({
      level: 'success',
      category: 'system',
      message: `Created Greenhouse "${greenhouse.name}" (Crop: ${greenhouse.plant}) under Company "${company.name}" (${company.location})`,
      details: { greenhouseId: greenhouse.greenhouseId, companyId: company.companyId, plant: greenhouse.plant }
    });

    broadcast('greenhouse_created', greenhouse);

    return greenhouse;
  }

  /**
   * List all Greenhouses (optionally filtered by companyId)
   */
  static async getGreenhouses(companyId?: string) {
    const filter: any = {};
    if (companyId) filter.companyId = companyId.toLowerCase();

    const greenhouses = await Greenhouse.find(filter).sort({ name: 1 }).lean();

    const results = await Promise.all(
      greenhouses.map(async (gh) => {
        const devices = await Device.find({
          deviceId: { $in: gh.assignedDeviceIds },
          isRegistered: true
        }).lean();

        let onlineCount = 0;
        const deviceSummaries = devices.map((d) => {
          const health = this.computeHealth(d);
          if (health.isOnline) onlineCount++;
          return {
            deviceId: d.deviceId,
            name: d.name,
            sensorType: d.sensorType,
            status: health.status,
            isOnline: health.isOnline,
            latestReading: d.latestReading
          };
        });

        return {
          ...gh,
          totalDevices: devices.length,
          onlineDevices: onlineCount,
          devices: deviceSummaries
        };
      })
    );

    return results;
  }

  /**
   * Get single greenhouse by ID with detailed status of all assigned ESPs and plant info
   */
  static async getGreenhouseOverview(greenhouseId: string) {
    const greenhouse = await Greenhouse.findOne({ greenhouseId: greenhouseId.toLowerCase() }).lean();
    if (!greenhouse) return null;

    const devices = await Device.find({
      $or: [
        { deviceId: { $in: greenhouse.assignedDeviceIds } },
        { greenhouseId: greenhouseId.toLowerCase() }
      ],
      isRegistered: true
    }).lean();

    let onlineCount = 0;
    const deviceDetails = devices.map((d) => {
      const health = this.computeHealth(d);
      if (health.isOnline) onlineCount++;
      return {
        ...d,
        status: health.status,
        isOnline: health.isOnline,
        secondsSinceLastSeen: health.secondsSinceLastSeen
      };
    });

    let totalTemp = 0, countTemp = 0;
    let totalHum = 0, countHum = 0;
    let totalSoil = 0, countSoil = 0;
    let totalLight = 0, countLight = 0;

    for (const d of deviceDetails) {
      if (d.latestReading) {
        if (typeof d.latestReading.temperature === 'number') {
          totalTemp += d.latestReading.temperature;
          countTemp++;
        }
        if (typeof d.latestReading.humidity === 'number') {
          totalHum += d.latestReading.humidity;
          countHum++;
        }
        if (typeof d.latestReading.soilMoisture === 'number') {
          totalSoil += d.latestReading.soilMoisture;
          countSoil++;
        }
        if (typeof d.latestReading.light === 'number') {
          totalLight += d.latestReading.light;
          countLight++;
        }
      }
    }

    const round = (val: number) => Math.round(val * 10) / 10;

    return {
      greenhouseId: greenhouse.greenhouseId,
      name: greenhouse.name,
      companyId: greenhouse.companyId,
      companyName: greenhouse.companyName,
      companyLocation: greenhouse.companyLocation,
      plant: greenhouse.plant,
      description: greenhouse.description,
      totalDevices: devices.length,
      onlineDevices: onlineCount,
      summary: {
        avgTemperature: countTemp > 0 ? round(totalTemp / countTemp) : null,
        avgHumidity: countHum > 0 ? round(totalHum / countHum) : null,
        avgSoilMoisture: countSoil > 0 ? round(totalSoil / countSoil) : null,
        avgLight: countLight > 0 ? round(totalLight / countLight) : null
      },
      devices: deviceDetails
    };
  }

  /**
   * Assign an existing ESP UUID to a Greenhouse
   */
  static async assignDeviceToGreenhouse(greenhouseId: string, deviceId: string) {
    const normalizedDeviceId = deviceId.toLowerCase();
    const normalizedGhId = greenhouseId.toLowerCase();

    const greenhouse = await Greenhouse.findOne({ greenhouseId: normalizedGhId });
    if (!greenhouse) {
      const err: any = new Error(`Greenhouse "${greenhouseId}" not found`);
      err.statusCode = 404;
      throw err;
    }

    const device = await Device.findOne({ deviceId: normalizedDeviceId });
    if (!device) {
      const err: any = new Error(`Device "${deviceId}" not found. Register it first.`);
      err.statusCode = 404;
      throw err;
    }

    device.greenhouseId = normalizedGhId;
    device.greenhouseName = greenhouse.name;
    device.companyId = greenhouse.companyId;
    device.companyName = greenhouse.companyName;
    device.companyLocation = greenhouse.companyLocation;
    device.plant = greenhouse.plant;
    await device.save();

    if (!greenhouse.assignedDeviceIds.includes(normalizedDeviceId)) {
      greenhouse.assignedDeviceIds.push(normalizedDeviceId);
      await greenhouse.save();
    }

    await LoggerService.recordLog({
      level: 'info',
      category: 'device',
      deviceId: normalizedDeviceId,
      message: `Assigned Sensor Module "${device.name}" (${normalizedDeviceId}) to Greenhouse "${greenhouse.name}" (${greenhouse.plant})`,
      details: { greenhouseId: normalizedGhId, deviceId: normalizedDeviceId }
    });

    return { greenhouse, device };
  }

  // ==========================================================================
  // DEVICE MANAGEMENT METHODS (Sensor Module Registration)
  // ==========================================================================

  /**
   * Register a Sensor Module under a Greenhouse
   */
  static async registerDevice(input: RegisterDeviceInput): Promise<IDevice> {
    const deviceId = input.deviceId.toLowerCase();
    const greenhouseId = input.greenhouseId?.toLowerCase().trim() || 'greenhouse-01';

    // Look up greenhouse
    let greenhouse = await Greenhouse.findOne({ greenhouseId });
    if (!greenhouse) {
      // Find any existing greenhouse or seed
      greenhouse = await Greenhouse.findOne();
      if (!greenhouse) {
        // Create default company and greenhouse
        const company = await Company.findOneAndUpdate(
          { companyId: 'comp-ceylon-agro' },
          { $setOnInsert: { name: 'Ceylon Agri Corp', location: 'Colombo Agri Facility' } },
          { upsert: true, new: true }
        );
        greenhouse = await Greenhouse.create({
          greenhouseId,
          companyId: company.companyId,
          companyName: company.name,
          companyLocation: company.location,
          name: 'Greenhouse 01',
          plant: 'Heirloom Tomatoes',
          assignedDeviceIds: [deviceId]
        });
      }
    }

    if (!greenhouse.assignedDeviceIds.includes(deviceId)) {
      greenhouse.assignedDeviceIds.push(deviceId);
      await greenhouse.save();
    }

    const updateData: any = {
      deviceId,
      name: input.name?.trim() || `Sensor Module ${deviceId.substring(0, 8)}`,
      companyId: greenhouse.companyId,
      companyName: greenhouse.companyName,
      companyLocation: greenhouse.companyLocation,
      greenhouseId: greenhouse.greenhouseId,
      greenhouseName: greenhouse.name,
      plant: greenhouse.plant,
      sensorType: input.sensorType || 'fc28',
      location: input.location?.trim() || 'Zone 1',
      isRegistered: true,
      port: input.port || 80,
      heartbeatTimeoutSeconds: input.heartbeatTimeoutSeconds || 60
    };

    if (input.ipAddress) {
      updateData.ipAddress = input.ipAddress;
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await LoggerService.recordLog({
      level: 'success',
      category: 'device',
      deviceId: device.deviceId,
      message: `Sensor Module "${device.name}" registered to [${device.greenhouseName} - ${device.plant}] at "${device.companyLocation}"`,
      details: {
        deviceId: device.deviceId,
        name: device.name,
        greenhouseId: device.greenhouseId,
        companyName: device.companyName,
        plant: device.plant
      }
    });

    broadcast('device_registered', {
      deviceId: device.deviceId,
      name: device.name,
      companyId: device.companyId,
      companyName: device.companyName,
      companyLocation: device.companyLocation,
      greenhouseId: device.greenhouseId,
      greenhouseName: device.greenhouseName,
      plant: device.plant
    });

    return device;
  }

  /**
   * Device Management: Update existing device metadata
   */
  static async updateDevice(deviceId: string, input: UpdateDeviceInput): Promise<IDevice | null> {
    const updated = await Device.findOneAndUpdate(
      { deviceId: deviceId.toLowerCase() },
      { $set: input },
      { new: true }
    );

    if (updated && input.greenhouseId) {
      await Greenhouse.updateOne(
        { greenhouseId: input.greenhouseId.toLowerCase() },
        { $addToSet: { assignedDeviceIds: deviceId.toLowerCase() } }
      );
    }

    return updated;
  }

  /**
   * Device Management: List registered devices
   */
  static async getDevices(greenhouseId?: string, companyId?: string) {
    const filter: any = { isRegistered: true };
    if (greenhouseId) filter.greenhouseId = greenhouseId.toLowerCase();
    if (companyId) filter.companyId = companyId.toLowerCase();

    const devices = await Device.find(filter).sort({ lastSeen: -1 }).lean();
    return devices.map((device) => {
      const health = this.computeHealth(device);
      return {
        ...device,
        status: health.status,
        isOnline: health.isOnline,
        secondsSinceLastSeen: health.secondsSinceLastSeen
      };
    });
  }

  /**
   * Device Management: Get single device by UUID with health
   */
  static async getDeviceById(deviceId: string) {
    const device = await Device.findOne({ deviceId: deviceId.toLowerCase() }).lean();
    if (!device) return null;

    const health = this.computeHealth(device);
    return {
      ...device,
      status: health.status,
      isOnline: health.isOnline,
      secondsSinceLastSeen: health.secondsSinceLastSeen
    };
  }

  /**
   * Heartbeat Ingestion: Record a ping/heartbeat sent from the ESP node
   */
  static async recordHeartbeat(
    deviceId: string,
    input: HeartbeatInput,
    callerIp?: string
  ): Promise<IDevice> {
    const normalizedDeviceId = deviceId.toLowerCase();

    const registeredDevice = await Device.findOne({
      deviceId: normalizedDeviceId,
      isRegistered: true
    });

    if (!registeredDevice) {
      const err: any = new Error(`Heartbeat rejected: Device "${normalizedDeviceId}" is not registered.`);
      err.statusCode = 403;
      throw err;
    }

    const now = new Date();
    const updateFields: any = {
      lastSeen: now,
      status: 'online'
    };

    if (input.ipAddress) {
      updateFields.ipAddress = input.ipAddress;
    } else if (callerIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(callerIp)) {
      updateFields.ipAddress = callerIp.replace('::ffff:', '');
    }

    if (input.port) updateFields.port = input.port;
    if (input.rssi !== undefined) updateFields.rssi = input.rssi;

    await Device.updateOne({ _id: registeredDevice._id }, { $set: updateFields });

    broadcast('device_heartbeat', {
      deviceId: registeredDevice.deviceId,
      name: registeredDevice.name,
      companyId: registeredDevice.companyId,
      companyName: registeredDevice.companyName,
      companyLocation: registeredDevice.companyLocation,
      greenhouseId: registeredDevice.greenhouseId,
      greenhouseName: registeredDevice.greenhouseName,
      plant: registeredDevice.plant,
      status: 'online',
      lastSeen: now.toISOString(),
      ipAddress: updateFields.ipAddress || registeredDevice.ipAddress,
      rssi: input.rssi
    });

    return registeredDevice;
  }

  /**
   * Check whether an ESP node is currently ON (alive) or OFF
   */
  static async getDeviceHealth(deviceId: string) {
    const device = await Device.findOne({ deviceId: deviceId.toLowerCase() }).lean();
    if (!device) {
      return null;
    }

    const health = this.computeHealth(device);

    return {
      deviceId: device.deviceId,
      name: device.name,
      companyId: device.companyId,
      companyName: device.companyName,
      companyLocation: device.companyLocation,
      greenhouseId: device.greenhouseId,
      greenhouseName: device.greenhouseName,
      plant: device.plant,
      location: device.location,
      isOnline: health.isOnline,
      status: health.status,
      lastSeen: device.lastSeen,
      secondsSinceLastSeen: health.secondsSinceLastSeen,
      timeoutThresholdSeconds: device.heartbeatTimeoutSeconds || 60,
      ipAddress: device.ipAddress || null,
      port: device.port || 80,
      rssi: device.rssi || null,
      latestReading: device.latestReading || null
    };
  }

  /**
   * Active Probe / Ping: Backend actively sends an HTTP GET to the ESP node's /health route
   */
  static async pingEspNode(deviceId: string, timeoutMs: number = 2500) {
    const device = await Device.findOne({ deviceId: deviceId.toLowerCase() }).lean();
    if (!device) {
      return { found: false, error: 'Device not found in database' };
    }

    if (!device.ipAddress) {
      return {
        found: true,
        isReachable: false,
        deviceId: device.deviceId,
        error:
          'Device IP address is not registered. Have the ESP send a heartbeat or update its ipAddress via PUT /api/devices/:deviceId.'
      };
    }

    const host = device.ipAddress.includes(':') && !device.ipAddress.startsWith('[')
      ? `[${device.ipAddress}]`
      : device.ipAddress;
    const targetUrl = `http://${host}:${device.port || 80}/health`;
    const startTime = Date.now();

    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        headers: { Accept: 'application/json, text/plain, */*' },
        signal: AbortSignal.timeout(timeoutMs)
      });

      const latencyMs = Date.now() - startTime;
      let espResponseData: any = null;
      try {
        espResponseData = await response.json();
      } catch {
        espResponseData = await response.text();
      }

      const isOk = response.status >= 200 && response.status < 300;

      if (isOk) {
        await Device.updateOne(
          { deviceId: device.deviceId },
          { $set: { lastSeen: new Date(), status: 'online' } }
        );

        broadcast('device_ping_success', {
          deviceId: device.deviceId,
          latencyMs,
          timestamp: new Date().toISOString()
        });
      }

      await LoggerService.recordLog({
        level: isOk ? 'success' : 'warn',
        category: 'health',
        deviceId: device.deviceId,
        message: isOk
          ? `ESP health probe SUCCESS at ${targetUrl} (Latency: ${latencyMs}ms)`
          : `ESP health probe returned HTTP ${response.status} at ${targetUrl}`,
        details: { targetUrl, latencyMs, statusCode: response.status }
      });

      return {
        found: true,
        isReachable: isOk,
        status: isOk ? 'online' : 'error',
        statusCode: response.status,
        targetUrl,
        latencyMs,
        espResponse: espResponseData
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isTimeout = err.name === 'TimeoutError' || err.message.includes('timeout');

      await Device.updateOne(
        { deviceId: device.deviceId },
        { $set: { status: 'offline' } }
      );

      return {
        found: true,
        isReachable: false,
        status: 'offline',
        targetUrl,
        latencyMs,
        error: isTimeout
          ? `Connection timed out after ${timeoutMs}ms. ESP is powered OFF or disconnected from WiFi.`
          : `Connection failed: ${err.message}`
      };
    }
  }

  /**
   * Helper to calculate whether a device is online/warning/offline based on lastSeen
   */
  private static computeHealth(device: any): {
    isOnline: boolean;
    status: 'online' | 'warning' | 'offline';
    secondsSinceLastSeen: number;
  } {
    const lastSeenTime = device.lastSeen ? new Date(device.lastSeen).getTime() : 0;
    const now = Date.now();
    const secondsSinceLastSeen = Math.max(0, Math.floor((now - lastSeenTime) / 1000));
    const timeout = device.heartbeatTimeoutSeconds || 60;

    let status: 'online' | 'warning' | 'offline' = 'online';
    let isOnline = false;

    if (secondsSinceLastSeen <= timeout) {
      status = 'online';
      isOnline = true;
    } else if (secondsSinceLastSeen <= timeout * 3) {
      status = 'warning';
      isOnline = false;
    } else {
      status = 'offline';
      isOnline = false;
    }

    return { isOnline, status, secondsSinceLastSeen };
  }

  /**
   * Reset the entire database and install Company, Greenhouse (with plant), and first registered node
   */
  static async resetDatabase(firstNode?: {
    deviceId?: string;
    name?: string;
    companyName?: string;
    companyLocation?: string;
    greenhouseName?: string;
    plant?: string;
    location?: string;
    ipAddress?: string;
  }) {
    await Reading.deleteMany({});
    await Device.deleteMany({});
    await Greenhouse.deleteMany({});
    await Company.deleteMany({});
    await Log.deleteMany({});

    const companyId = 'comp-ceylon-agro';
    const companyName = firstNode?.companyName || 'Ceylon Agri Corp';
    const companyLocation = firstNode?.companyLocation || 'Colombo Agri Facility';

    const greenhouseId = 'greenhouse-01';
    const greenhouseName = firstNode?.greenhouseName || 'Greenhouse 01 - Hydroponics';
    const plant = firstNode?.plant || 'Heirloom Tomatoes';

    const initialId = firstNode?.deviceId?.toLowerCase() || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const initialName = firstNode?.name || 'Canopy & Soil Module 01';
    const initialLocation = firstNode?.location || 'Zone 1 - Main Bed';

    // 1. Seed Company
    const company = await Company.create({
      companyId,
      name: companyName,
      location: companyLocation,
      description: 'Primary corporate agriculture production facility'
    });

    // 2. Seed Greenhouse under Company with Plant
    const greenhouse = await Greenhouse.create({
      greenhouseId,
      name: greenhouseName,
      companyId,
      companyName,
      companyLocation,
      plant,
      description: `Commercial greenhouse dedicated to ${plant}`,
      assignedDeviceIds: [initialId]
    });

    // 3. Seed registered device
    const firstDevice = await Device.create({
      deviceId: initialId,
      name: initialName,
      companyId,
      companyName,
      companyLocation,
      greenhouseId,
      greenhouseName,
      plant,
      location: initialLocation,
      sensorType: 'fc28',
      isRegistered: true,
      ipAddress: firstNode?.ipAddress,
      port: 80,
      heartbeatTimeoutSeconds: 60,
      status: 'online',
      lastSeen: new Date()
    });

    await LoggerService.recordLog({
      level: 'warn',
      category: 'system',
      deviceId: initialId,
      message: `Database reset performed. Installed Company "${companyName}", Greenhouse "${greenhouseName}" (Crop: ${plant}), and registered Sensor Module "${initialName}" (${initialId})`,
      details: { companyId, greenhouseId, plant, firstDeviceId: initialId }
    });

    broadcast('database_reset', {
      message: 'Database reset successfully',
      company,
      greenhouse,
      firstDevice
    });

    return {
      message: 'Database reset successfully. Registered Company, Greenhouse, and Sensor Module installed.',
      company,
      greenhouse,
      firstDevice
    };
  }
}
