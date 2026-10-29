import mongoose, { Schema, Document } from 'mongoose';

export interface ILog extends Document {
  level: 'info' | 'warn' | 'error' | 'success';
  category: 'telemetry' | 'health' | 'device' | 'system';
  deviceId?: string;
  message: string;
  details?: Record<string, any>;
  timestamp: Date;
}

const LogSchema: Schema = new Schema<ILog>(
  {
    level: {
      type: String,
      enum: ['info', 'warn', 'error', 'success'],
      default: 'info',
      index: true
    },
    category: {
      type: String,
      enum: ['telemetry', 'health', 'device', 'system'],
      default: 'system',
      index: true
    },
    deviceId: {
      type: String,
      trim: true,
      lowercase: true,
      index: true
    },
    message: {
      type: String,
      required: true,
      trim: true
    },
    details: {
      type: Schema.Types.Mixed,
      required: false
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    versionKey: false
  }
);

// Fast reverse-chronological queries
LogSchema.index({ timestamp: -1 });
LogSchema.index({ deviceId: 1, timestamp: -1 });

export const Log = mongoose.model<ILog>('Log', LogSchema);
