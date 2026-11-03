import { Reading, IReading } from '../models/Reading.js';
import { Device, IDevice } from '../models/Device.js';
import { Greenhouse, IGreenhouse } from '../models/Greenhouse.js';
import { Log } from '../models/Log.js';
import { broadcast } from './websocket.service.js';
import { LoggerService } from './logger.service.js';
import type {
  CreateReadingInput,
  QueryReadingsInput,
  RegisterDeviceInput,
  UpdateDeviceInput,
  HeartbeatInput,
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
        `ESP device "${normalizedDeviceId}" is not registered. Please register the device with a Company Location and Greenhouse in the dashboard first.`
      );
      err.statusCode = 403;
      throw err;
    }

    // 2. Persist Reading tagged with Company Location and Greenhouse
    const reading = new Reading({
      ...input,
      deviceId: normalizedDeviceId,
      companyLocation: registeredDevice.companyLocation,
      greenhouseId: registeredDevice.greenhouseId
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

    // 4. Real-time broadcast with Greenhouse metadata
    broadcast('new_reading', {
      ...savedReading.toObject(),
      companyLocation: registeredDevice.companyLocation,
      greenhouseId: registeredDevice.greenhouseId,
      greenhouseName: registeredDevice.greenhouseName,
      deviceLocation: registeredDevice.location,
      deviceName: registeredDevice.name,
      deviceStatus: 'online'
    });

    // 5. Auto-save log to database
    await LoggerService.recordLog({
      level: 'success',
      category: 'telemetry',
      deviceId: savedReading.deviceId,
      message: `[${registeredDevice.greenhouseName}] Packet from "${registeredDevice.name}": Temp=${savedReading.temperature}°C, Hum=${savedReading.humidity}%, Soil=${savedReading.soilMoisture}%, Light=${savedReading.light} Lux`,
      details: {
        greenhouseId: registeredDevice.greenhouseId,
        companyLocation: registeredDevice.companyLocation,
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

    // Get list of distinct deviceIds
    const distinctIds = Array.from(new Set(readingsData.map((r) => r.deviceId.toLowerCase())));
    const registeredDevices = await Device.find({
      deviceId: { $in: distinctIds },
      isRegistered: true
    }).lean();

    const registeredMap = new Map<string, any>(
      registeredDevices.map((d) => [d.deviceId.toLowerCase(), d])
    );

    // Filter readings to only registered devices
    const validReadings: any[] = [];
    for (const r of readingsData) {
      const dev = registeredMap.get(r.deviceId.toLowerCase());
      if (dev) {
        validReadings.push({
          ...r,
          deviceId: r.deviceId.toLowerCase(),
          companyLocation: dev.companyLocation,
          greenhouseId: dev.greenhouseId
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
          greenhouseId: dev?.greenhouseId,
          companyLocation: dev?.companyLocation,
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
    const { deviceId, greenhouseId, companyLocation, startDate, endDate, page, limit, sortBy, sortOrder } = query;

    const filter: any = {};

    if (deviceId) {
      filter.deviceId = deviceId.toLowerCase();
    }
    if (greenhouseId) {
      filter.greenhouseId = greenhouseId.toLowerCase();
    }
    if (companyLocation) {
      filter.companyLocation = companyLocation;
    }

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
      deviceLocation: device?.location || 'Unassigned Zone',
      deviceName: device?.name || `Sensor Node ${reading.deviceId.substring(0, 8)}`,
      greenhouseId: device?.greenhouseId || reading.greenhouseId || 'unassigned',
      greenhouseName: device?.greenhouseName || 'Unassigned Greenhouse',
      companyLocation: device?.companyLocation || reading.companyLocation || 'Main Facility',
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

  /**
   * Device Management: Register an ESP node with its assigned Company Location & Greenhouse
   */
  static async registerDevice(input: RegisterDeviceInput): Promise<IDevice> {
    const deviceId = input.deviceId.toLowerCase();
    const greenhouseId = input.greenhouseId?.toLowerCase().trim() || 'greenhouse-01';
    const companyLocation = input.companyLocation?.trim() || 'Colombo Agri Facility';

    // Verify or find Greenhouse name
    let greenhouseName = input.greenhouseName?.trim();
    let greenhouse = await Greenhouse.findOne({ greenhouseId });

    if (!greenhouse) {
      // Auto-create greenhouse if it doesn't exist
      greenhouse = await Greenhouse.create({
        greenhouseId,
        name: greenhouseName || `Greenhouse ${greenhouseId.replace(/^gh-?/, '').toUpperCase()}`,
        companyLocation,
        assignedDeviceIds: [deviceId]
      });
      greenhouseName = greenhouse.name;
    } else {
      if (!greenhouseName) greenhouseName = greenhouse.name;
      if (!greenhouse.assignedDeviceIds.includes(deviceId)) {
        greenhouse.assignedDeviceIds.push(deviceId);
        await greenhouse.save();
      }
    }

    const updateData: any = {
      deviceId,
      name: input.name?.trim() || `Sensor Node ${deviceId.substring(0, 8)}`,
      companyLocation,
      greenhouseId,
      greenhouseName,
      sensorType: input.sensorType || 'generic',
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
      message: `ESP Node "${device.name}" registered to [${device.greenhouseName}] at "${device.companyLocation}"`,
      details: {
        deviceId: device.deviceId,
        name: device.name,
        greenhouseId: device.greenhouseId,
        companyLocation: device.companyLocation
      }
    });

    broadcast('device_registered', {
      deviceId: device.deviceId,
      name: device.name,
      greenhouseId: device.greenhouseId,
      greenhouseName: device.greenhouseName,
      companyLocation: device.companyLocation
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

    // If greenhouse changed, sync greenhouse lists
    if (updated && input.greenhouseId) {
      await Greenhouse.updateOne(
        { greenhouseId: input.greenhouseId.toLowerCase() },
        { $addToSet: { assignedDeviceIds: deviceId.toLowerCase() } }
      );
    }

    return updated;
  }

  /**
   * Device Management: List registered devices, optionally filtered by greenhouse or company
   */
  static async getDevices(greenhouseId?: string, companyLocation?: string) {
    const filter: any = { isRegistered: true };
    if (greenhouseId) filter.greenhouseId = greenhouseId.toLowerCase();
    if (companyLocation) filter.companyLocation = companyLocation;

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

  // ==========================================================================
  // GREENHOUSE MANAGEMENT METHODS
  // ==========================================================================

  /**
   * Create a new Greenhouse under a Company Location
   */
  static async createGreenhouse(input: CreateGreenhouseInput): Promise<IGreenhouse> {
    const greenhouseId = input.greenhouseId.toLowerCase();
    const existing = await Greenhouse.findOne({ greenhouseId });
    if (existing) {
      const err: any = new Error(`Greenhouse with ID "${greenhouseId}" already exists.`);
      err.statusCode = 409;
      throw err;
    }

    const greenhouse = await Greenhouse.create({
      greenhouseId,
      name: input.name,
      companyLocation: input.companyLocation,
      description: input.description,
      assignedDeviceIds: input.assignedDeviceIds || []
    });

    await LoggerService.recordLog({
      level: 'success',
      category: 'system',
      message: `Created Greenhouse "${greenhouse.name}" (${greenhouse.greenhouseId}) at "${greenhouse.companyLocation}"`,
      details: { greenhouseId: greenhouse.greenhouseId, companyLocation: greenhouse.companyLocation }
    });

    return greenhouse;
  }

  /**
   * List all Greenhouses with counts of assigned devices
   */
  static async getGreenhouses(companyLocation?: string) {
    const filter: any = {};
    if (companyLocation) filter.companyLocation = companyLocation;

    const greenhouses = await Greenhouse.find(filter).sort({ name: 1 }).lean();
    
    // Attach live device health count for each greenhouse
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
   * Get single greenhouse by ID with detailed status of all assigned ESPs
   */
  static async getGreenhouseOverview(greenhouseId: string) {
    const greenhouse = await Greenhouse.findOne({ greenhouseId: greenhouseId.toLowerCase() }).lean();
    if (!greenhouse) return null;

    // Fetch all registered devices assigned to this greenhouse
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

    // Compute Greenhouse-wide aggregated climate metrics across online nodes
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
      companyLocation: greenhouse.companyLocation,
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

    // Update Device
    device.greenhouseId = normalizedGhId;
    device.greenhouseName = greenhouse.name;
    device.companyLocation = greenhouse.companyLocation;
    await device.save();

    // Add to Greenhouse
    if (!greenhouse.assignedDeviceIds.includes(normalizedDeviceId)) {
      greenhouse.assignedDeviceIds.push(normalizedDeviceId);
      await greenhouse.save();
    }

    await LoggerService.recordLog({
      level: 'info',
      category: 'device',
      deviceId: normalizedDeviceId,
      message: `Assigned ESP "${device.name}" (${normalizedDeviceId}) to Greenhouse "${greenhouse.name}"`,
      details: { greenhouseId: normalizedGhId, deviceId: normalizedDeviceId }
    });

    return { greenhouse, device };
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

    // Verify registration
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
      greenhouseId: registeredDevice.greenhouseId,
      greenhouseName: registeredDevice.greenhouseName,
      companyLocation: registeredDevice.companyLocation,
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
      companyLocation: device.companyLocation,
      greenhouseId: device.greenhouseId,
      greenhouseName: device.greenhouseName,
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
   * Reset the entire database and install initial Greenhouse + registered node
   */
  static async resetDatabase(firstNode?: {
    deviceId?: string;
    name?: string;
    companyLocation?: string;
    greenhouseId?: string;
    greenhouseName?: string;
    location?: string;
    ipAddress?: string;
  }) {
    await Reading.deleteMany({});
    await Device.deleteMany({});
    await Greenhouse.deleteMany({});
    await Log.deleteMany({});

    const initialId = firstNode?.deviceId?.toLowerCase() || 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const initialName = firstNode?.name || 'ESP32 Node 01 (Canopy & Ambient)';
    const companyLocation = firstNode?.companyLocation || 'Colombo Agri Facility';
    const greenhouseId = firstNode?.greenhouseId || 'greenhouse-01';
    const greenhouseName = firstNode?.greenhouseName || 'Greenhouse 01 - Hydroponics';
    const initialLocation = firstNode?.location || 'Zone 1 - Hydroponic Bed';

    // Seed default Greenhouse
    const greenhouse = await Greenhouse.create({
      greenhouseId,
      name: greenhouseName,
      companyLocation,
      description: 'Main commercial production hydroponics bay with automated climate control',
      assignedDeviceIds: [initialId]
    });

    // Seed primary registered device
    const firstDevice = await Device.create({
      deviceId: initialId,
      name: initialName,
      companyLocation,
      greenhouseId,
      greenhouseName,
      location: initialLocation,
      sensorType: 'combo',
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
      message: `Database reset performed. Installed Greenhouse "${greenhouseName}" and registered ESP "${initialName}" (${initialId})`,
      details: { greenhouseId, companyLocation, firstDeviceId: initialId }
    });

    broadcast('database_reset', {
      message: 'Database reset successfully',
      greenhouse,
      firstDevice
    });

    return {
      message: 'Database reset successfully. Greenhouse and initial registered ESP installed.',
      greenhouse,
      firstDevice
    };
  }
}
