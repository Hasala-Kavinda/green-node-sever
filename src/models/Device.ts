import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;       // Unique UUID of the node
  name: string;           // Friendly name, e.g. "Node Alpha"
  location: string;       // Assigned location/zone registered in database
  lastSeen: Date;
  status: 'online' | 'warning' | 'offline';
  latestReading?: {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    light: number;
    timestamp: Date;
  };
}

const DeviceSchema: Schema = new Schema<IDevice>(
  {
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      required: false,
      default: 'Sensor Node'
    },
    location: {
      type: String,
      required: false,
      default: 'Unassigned Zone',
      trim: true
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
      timestamp: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
