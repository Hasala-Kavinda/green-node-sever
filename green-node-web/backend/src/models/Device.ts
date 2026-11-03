import mongoose, { Schema, Document } from 'mongoose';

export interface IDevice extends Document {
  deviceId: string;                // Unique UUID of the node (provisioned to ESP)
  name: string;                    // Friendly name, e.g. "Canopy Sensor - Zone 1"
  companyLocation: string;          // Company site/location, e.g. "Colombo Agri Facility"
  greenhouseId: string;            // ID of assigned greenhouse, e.g. "gh-01"
  greenhouseName: string;          // Cached greenhouse name, e.g. "Greenhouse 01"
  sensorType: string;              // 'fc28' | 'md0869' | 'combo' | 'generic'
  isRegistered: boolean;           // True only when explicitly registered by admin
  location: string;                // Specific sub-zone/bed location
  ipAddress?: string;              // Local/LAN IP address of the ESP
  port?: number;                   // Port for ESP's onboard HTTP health server (default: 80)
  heartbeatTimeoutSeconds: number; // Seconds before marking device as offline (default: 60)
  rssi?: number;                   // WiFi Signal Strength in dBm
  wifiSsid?: string;               // Current connected Wi-Fi Network SSID
  lastSeen: Date;
  status: 'online' | 'warning' | 'offline';
  latestReading?: {
    temperature: number;
    humidity: number;
    soilMoisture: number;
    light: number;
    espTemperature?: number;
    wifiSsid?: string;
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
    companyLocation: {
      type: String,
      required: false,
      default: 'Main Facility',
      trim: true,
      index: true
    },
    greenhouseId: {
      type: String,
      required: false,
      default: 'unassigned-greenhouse',
      trim: true,
      lowercase: true,
      index: true
    },
    greenhouseName: {
      type: String,
      required: false,
      default: 'Unassigned Greenhouse',
      trim: true
    },
    sensorType: {
      type: String,
      required: false,
      default: 'generic',
      trim: true
    },
    isRegistered: {
      type: Boolean,
      default: true,
      index: true
    },
    location: {
      type: String,
      required: false,
      default: 'Zone 1',
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
    wifiSsid: {
      type: String,
      required: false,
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
      espTemperature: Number,
      wifiSsid: String,
      timestamp: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound index for querying devices by greenhouse
DeviceSchema.index({ greenhouseId: 1, isRegistered: 1 });
DeviceSchema.index({ companyLocation: 1, greenhouseId: 1 });

export const Device = mongoose.model<IDevice>('Device', DeviceSchema);
