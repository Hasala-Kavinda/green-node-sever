import { Reading, IReading } from '../models/Reading.js';
import { Device } from '../models/Device.js';
import { broadcast } from './websocket.service.js';
import type { CreateReadingInput, QueryReadingsInput } from '../schemas/reading.schema.js';

export class ReadingService {
  /**
   * Save a single sensor reading and broadcast it in real time
   */
  static async saveReading(input: CreateReadingInput): Promise<IReading> {
    const reading = new Reading(input);
    const savedReading = await reading.save();

    // Update or register Device status
    await Device.findOneAndUpdate(
      { deviceId: input.deviceId },
      {
        $set: {
          lastSeen: savedReading.timestamp,
          location: input.location || 'Greenhouse',
          status: 'online',
          latestReading: {
            temperature: savedReading.temperature,
            humidity: savedReading.humidity,
            soilMoisture: savedReading.soilMoisture,
            light: savedReading.light,
            battery: savedReading.battery,
            timestamp: savedReading.timestamp
          }
        },
        $setOnInsert: {
          name: `Sensor Node ${input.deviceId}`
        }
      },
      { upsert: true, new: true }
    );

    // Broadcast in real-time to all connected WebSocket clients
    broadcast('new_reading', savedReading);

    return savedReading;
  }

  /**
   * Bulk insert multiple readings (e.g. from an offline edge node syncing back)
   */
  static async saveBatchReadings(readingsData: CreateReadingInput[]): Promise<{ count: number }> {
    const inserted = await Reading.insertMany(readingsData);

    if (inserted.length > 0) {
      // Find latest reading in this batch to update device registry and broadcast
      const latest = inserted.reduce((prev, curr) =>
        new Date(curr.timestamp) > new Date(prev.timestamp) ? curr : prev
      );

      await Device.findOneAndUpdate(
        { deviceId: latest.deviceId },
        {
          $set: {
            lastSeen: latest.timestamp,
            location: latest.location || 'Greenhouse',
            status: 'online',
            latestReading: {
              temperature: latest.temperature,
              humidity: latest.humidity,
              soilMoisture: latest.soilMoisture,
              light: latest.light,
              battery: latest.battery,
              timestamp: latest.timestamp
            }
          },
          $setOnInsert: {
            name: `Sensor Node ${latest.deviceId}`
          }
        },
        { upsert: true }
      );

      broadcast('batch_readings', { count: inserted.length, latest });
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
      filter.deviceId = deviceId;
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
  static async getLatestReading(deviceId?: string): Promise<IReading | null> {
    const filter = deviceId ? { deviceId } : {};
    return Reading.findOne(filter).sort({ timestamp: -1 }).lean();
  }

  /**
   * Calculate aggregated metrics (min, max, avg) for all sensors
   */
  static async getStats(deviceId?: string, hours: number = 24) {
    const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const matchFilter: any = { timestamp: { $gte: sinceDate } };

    if (deviceId) {
      matchFilter.deviceId = deviceId;
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

    // Round averages to 2 decimal places
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
   * Get list of all registered sensor nodes
   */
  static async getDevices() {
    return Device.find().sort({ lastSeen: -1 }).lean();
  }
}
