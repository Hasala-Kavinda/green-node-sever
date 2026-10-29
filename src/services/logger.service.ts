import { Log, ILog } from '../models/Log.js';
import { broadcast } from './websocket.service.js';

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'telemetry' | 'health' | 'device' | 'system';
  deviceId?: string;
  message: string;
  details?: Record<string, any>;
}

export class LoggerService {
  /**
   * Persist a log entry directly into MongoDB and broadcast in real-time
   */
  static async recordLog(entry: LogEntry): Promise<ILog | null> {
    try {
      const logDoc = new Log({
        level: entry.level,
        category: entry.category,
        deviceId: entry.deviceId ? entry.deviceId.toLowerCase() : undefined,
        message: entry.message,
        details: entry.details,
        timestamp: new Date()
      });

      const saved = await logDoc.save();

      // Broadcast to WebSocket clients
      broadcast('new_log', saved.toObject());

      return saved;
    } catch (err: any) {
      console.error('Failed to auto-save log to database:', err.message);
      return null;
    }
  }

  /**
   * Query logs from MongoDB with pagination and filtering
   */
  static async getLogs(query: {
    deviceId?: string;
    level?: string;
    category?: string;
    limit?: number;
    page?: number;
  }) {
    const filter: any = {};

    if (query.deviceId) {
      filter.deviceId = query.deviceId.toLowerCase();
    }
    if (query.level) {
      filter.level = query.level;
    }
    if (query.category) {
      filter.category = query.category;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(200, Math.max(1, query.limit || 50));
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      Log.find(filter).sort({ timestamp: -1 }).skip(skip).limit(limit).lean(),
      Log.countDocuments(filter)
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
   * Clear all logs from database
   */
  static async clearLogs() {
    const result = await Log.deleteMany({});
    return { deletedCount: result.deletedCount };
  }
}
