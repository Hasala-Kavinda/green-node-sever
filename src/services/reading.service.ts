import { Reading, IReading } from '../models/Reading.js';
import { Device, IDevice } from '../models/Device.js';
import { broadcast } from './websocket.service.js';
import type {
  CreateReadingInput,
  QueryReadingsInput,
  RegisterDeviceInput,
  UpdateDeviceInput
} from '../schemas/reading.schema.js';

export class ReadingService {
  /**
   * Save a single sensor reading and broadcast it in real time
   * Location is tracked on the Device record in MongoDB, not inside the reading.
   */
  static async saveReading(input: CreateReadingInput): Promise<IReading> {
    const reading = new Reading(input);
    const savedReading = await reading.save();

    // Update Device status & latestReading without overwriting its registered location
    const device = await Device.findOneAndUpdate(
      { deviceId: input.deviceId },
      {
        $set: {
          lastSeen: savedReading.timestamp,
          status: 'online',
          latestReading: {
            temperature: savedReading.temperature,
            humidity: savedReading.humidity,
            soilMoisture: savedReading.soilMoisture,
            light: savedReading.light,
            timestamp: savedReading.timestamp
          }
        },
        $setOnInsert: {
          name: `Sensor Node ${input.deviceId.substring(0, 8)}`,
          location: 'Unassigned Zone'
        }
      },
      { upsert: true, new: true }
    );

    // Broadcast reading along with registered device location for live dashboards
    broadcast('new_reading', {
      ...savedReading.toObject(),
      deviceLocation: device.location,
      deviceName: device.name
    });

    return savedReading;
  }

  /**
   * Bulk insert multiple readings
   */
  static async saveBatchReadings(readingsData: CreateReadingInput[]): Promise<{ count: number }> {
    const inserted = await Reading.insertMany(readingsData);

    if (inserted.length > 0) {
      // Find latest reading in batch to update device registry
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
            location: 'Unassigned Zone'
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
   * Get the single latest reading (optionally per device)
   */
  static async getLatestReading(deviceId?: string) {
    const filter = deviceId ? { deviceId: deviceId.toLowerCase() } : {};
    const reading = await Reading.findOne(filter).sort({ timestamp: -1 }).lean();

    if (!reading) return null;

    // Attach registered device location from Device database record
    const device = await Device.findOne({ deviceId: reading.deviceId }).lean();
    return {
      ...reading,
      deviceLocation: device?.location || 'Unassigned Zone',
      deviceName: device?.name || `Sensor Node ${reading.deviceId.substring(0, 8)}`
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
    const device = await Device.findOneAndUpdate(
      { deviceId: input.deviceId.toLowerCase() },
      {
        $set: {
          deviceId: input.deviceId.toLowerCase(),
          location: input.location,
          name: input.name || `Sensor Node ${input.deviceId.substring(0, 8)}`
        }
      },
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
   * Device Management: Get list of all registered sensor nodes
   */
  static async getDevices() {
    return Device.find().sort({ lastSeen: -1 }).lean();
  }

  /**
   * Device Management: Get single device by UUID
   */
  static async getDeviceById(deviceId: string) {
    return Device.findOne({ deviceId: deviceId.toLowerCase() }).lean();
  }
}
