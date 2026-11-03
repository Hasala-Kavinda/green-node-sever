import mongoose, { Schema, Document } from 'mongoose';

export interface IReading extends Document {
  deviceId: string;         // UUID of the sensor node
  companyId?: string;       // Company ID
  companyName?: string;     // Company Name
  companyLocation?: string; // Company site/location
  greenhouseId?: string;    // ID of the greenhouse
  plant?: string;           // Plant/crop type in greenhouse
  temperature: number;      // in Celsius (°C)
  humidity: number;         // in % (0-100)
  soilMoisture: number;     // in % (0-100)
  light: number;            // in Lux (>= 0)
  espTemperature?: number;  // ESP32 internal silicon die temp in Celsius (°C)
  wifiSsid?: string;        // Connected Wi-Fi SSID
  metadata?: Record<string, any>;
  timestamp: Date;
}

const ReadingSchema: Schema = new Schema<IReading>(
  {
    deviceId: {
      type: String,
      required: [true, 'deviceId is required'],
      trim: true,
      lowercase: true,
      index: true
    },
    companyId: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      index: true
    },
    companyName: {
      type: String,
      required: false,
      trim: true
    },
    companyLocation: {
      type: String,
      required: false,
      trim: true,
      index: true
    },
    greenhouseId: {
      type: String,
      required: false,
      trim: true,
      lowercase: true,
      index: true
    },
    plant: {
      type: String,
      required: false,
      trim: true
    },
    temperature: {
      type: Number,
      required: [true, 'temperature is required']
    },
    humidity: {
      type: Number,
      required: [true, 'humidity is required'],
      min: [0, 'humidity cannot be less than 0'],
      max: [100, 'humidity cannot exceed 100']
    },
    soilMoisture: {
      type: Number,
      required: [true, 'soilMoisture is required'],
      min: [0, 'soilMoisture cannot be less than 0'],
      max: [100, 'soilMoisture cannot exceed 100']
    },
    light: {
      type: Number,
      required: [true, 'light reading is required'],
      min: [0, 'light reading cannot be negative']
    },
    espTemperature: {
      type: Number,
      required: false,
      min: [-40, 'ESP temperature cannot be less than -40'],
      max: [125, 'ESP temperature cannot exceed 125']
    },
    wifiSsid: {
      type: String,
      required: false,
      trim: true
    },
    metadata: {
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

ReadingSchema.index({ deviceId: 1, timestamp: -1 });
ReadingSchema.index({ greenhouseId: 1, timestamp: -1 });

export const Reading = mongoose.model<IReading>('Reading', ReadingSchema);
