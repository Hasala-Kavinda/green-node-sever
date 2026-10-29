import { Reading, IReading } from '../models/Reading.js';
import { Device, IDevice } from '../models/Device.js';
import { broadcast } from './websocket.service.js';
import type {
  CreateReadingInput,
  QueryReadingsInput,
  RegisterDeviceInput,
  UpdateDeviceInput,
  HeartbeatInput
} from '../schemas/reading.schema.js';

export class ReadingService {
  /**
   * Save a single sensor reading and broadcast it in real time
   */
  static async saveReading(input: CreateReadingInput, callerIp?: string): Promise<IReading> {
    const reading = new Reading(input);
    const savedReading = await reading.save();

    const updateFields: any = {
      lastSeen: savedReading.timestamp,
      status: 'online',
      latestReading: {
        temperature: savedReading.temperature,
        humidity: savedReading.humidity,
        soilMoisture: savedReading.soilMoisture,
        light: savedReading.light,
        timestamp: savedReading.timestamp
      }
    };

    if (callerIp && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(callerIp)) {
      updateFields.ipAddress = callerIp.replace('::ffff:', '');
    }

    const device = await Device.findOneAndUpdate(
      { deviceId: input.deviceId },
      {
        $set: updateFields,
        $setOnInsert: {
          name: `Sensor Node ${input.deviceId.substring(0, 8)}`,
          location: 'Unassigned Zone',
          heartbeatTimeoutSeconds: 60,
          port: 80
        }
      },
      { upsert: true, new: true }
    );

    broadcast('new_reading', {
      ...savedReading.toObject(),
      deviceLocation: device.location,
      deviceName: device.name,
      deviceStatus: 'online'
    });

    return savedReading;
  }

  /**
   * Bulk insert multiple readings
   */
  static async saveBatchReadings(readingsData: CreateReadingInput[]): Promise<{ count: number }> {
    const inserted = await Reading.insertMany(readingsData);

    if (inserted.length > 0) {
      const latest = inserted.reduce((prev, curr) =>
        new Date(curr.timestamp) > new Date(prev.timestamp) ? curr : prev
      );

      const device = await Device.findOneAndUpdate(
        { deviceId: latest.deviceId },
        {
          $set: {
            lastSeen: latest.timestamp,
            status: 'online',
            latestReading: {
              temperature: latest.temperature,
              humidity: latest.humidity,
              soilMoisture: latest.soilMoisture,
              light: latest.light,
              timestamp: latest.timestamp
            }
          },
          $setOnInsert: {
            name: `Sensor Node ${latest.deviceId.substring(0, 8)}`,
            location: 'Unassigned Zone',
            heartbeatTimeoutSeconds: 60,
            port: 80
          }
        },
        { upsert: true, new: true }
      );

      broadcast('batch_readings', {
        count: inserted.length,
        latest: {
          ...latest.toObject(),
          deviceLocation: device?.location,
          deviceName: device?.name
        }
      });
    }

    return { count: inserted.length };
  }

  /**
   * Query readings with filtering, pagination, and sorting
   */
  static async getReadings(query: QueryReadingsInput) {
    const { deviceId, startDate, endDate, page, limit, sortBy, sortOrder } = query;

    const filter: any = {};

    if (deviceId) {
      filter.deviceId = deviceId.toLowerCase();
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
  static async getLatestReading(deviceId?: string) {
    const filter = deviceId ? { deviceId: deviceId.toLowerCase() } : {};
    const reading = await Reading.findOne(filter).sort({ timestamp: -1 }).lean();

    if (!reading) return null;

    const device = await Device.findOne({ deviceId: reading.deviceId }).lean();
    const health = device ? this.computeHealth(device) : null;

    return {
      ...reading,
      deviceLocation: device?.location || 'Unassigned Zone',
      deviceName: device?.name || `Sensor Node ${reading.deviceId.substring(0, 8)}`,
      deviceStatus: health?.status || 'unknown',
      isDeviceOnline: health?.isOnline ?? false
    };
  }

  /**
   * Calculate aggregated metrics (min, max, avg) for all sensors
   */
  static async getStats(deviceId?: string, hours: number = 24) {
    const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const matchFilter: any = { timestamp: { $gte: sinceDate } };

    if (deviceId) {
      matchFilter.deviceId = deviceId.toLowerCase();
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
      }
    };
  }

  /**
   * Device Management: Register a device with its assigned location in database
   */
  static async registerDevice(input: RegisterDeviceInput): Promise<IDevice> {
    const updateData: any = {
      deviceId: input.deviceId.toLowerCase(),
      location: input.location,
      name: input.name || `Sensor Node ${input.deviceId.substring(0, 8)}`,
      port: input.port || 80,
      heartbeatTimeoutSeconds: input.heartbeatTimeoutSeconds || 60
    };

    if (input.ipAddress) {
      updateData.ipAddress = input.ipAddress;
    }

    const device = await Device.findOneAndUpdate(
      { deviceId: input.deviceId.toLowerCase() },
      { $set: updateData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return device;
  }

  /**
   * Device Management: Update existing device metadata
   */
  static async updateDevice(deviceId: string, input: UpdateDeviceInput): Promise<IDevice | null> {
    return Device.findOneAndUpdate(
      { deviceId: deviceId.toLowerCase() },
      { $set: input },
      { new: true }
    );
  }

  /**
   * Device Management: List all registered devices with computed real-time status
   */
  static async getDevices() {
    const devices = await Device.find().sort({ lastSeen: -1 }).lean();
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

    const device = await Device.findOneAndUpdate(
      { deviceId: deviceId.toLowerCase() },
      {
        $set: updateFields,
        $setOnInsert: {
          name: `Sensor Node ${deviceId.substring(0, 8)}`,
          location: 'Unassigned Zone',
          heartbeatTimeoutSeconds: 60
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    broadcast('device_heartbeat', {
      deviceId: device.deviceId,
      name: device.name,
      location: device.location,
      status: 'online',
      lastSeen: now.toISOString(),
      ipAddress: device.ipAddress,
      rssi: device.rssi
    });

    return device;
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
        headers: { 'Accept': 'application/json, text/plain, */*' },
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
        // Mark device as currently seen and online in database
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

      // Update status to offline/warning
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
}
