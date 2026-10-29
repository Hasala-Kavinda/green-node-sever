import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;       // Unique UUID of the node
  name: string;           // Friendly name, e.g. "North Greenhouse Node"
  location: string;       // Assigned location/zone registered in database
  ipAddress?: string;     // Local/LAN IP address of the ESP (e.g. 192.168.1.150)
  port?: number;          // Port for ESP's onboard HTTP health server (default: 80)
  heartbeatTimeoutSeconds: number; // Seconds before marking device as offline (default: 60)
  rssi?: number;          // WiFi Signal Strength in dBm
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
    ipAddress: {
      type: String,
      required: false,
      trim: true
    },
    port: {
      type: Number,
      required: false,
      default: 80
    },
    heartbeatTimeoutSeconds: {
      type: Number,
      required: false,
      default: 60
    },
    rssi: {
      type: Number,
      required: false
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
