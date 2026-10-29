import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;
  name: string;
  location: string;
  lastSeen: Date;
  status: 'online' | 'warning' | 'offline';
  latestReading?: {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    light: number;
    battery?: number;
    timestamp: Date;
  };
}

const DeviceSchema: Schema = new Schema<IDevice>(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    name: {
      type: String,
      required: false,
      default: 'Sensor Node'
    },
    location: {
      type: String,
      required: false,
      default: 'Greenhouse'
    },
    lastSeen: {
      type: Date,
      default: Date.now
    },
    status: {
      type: String,
      enum: ['online', 'warning', 'offline'],
      default: 'online'
    },
    latestReading: {
      temperature: Number,
      humidity: Number,
      soilMoisture: Number,
      light: Number,
      battery: Number,
      timestamp: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
