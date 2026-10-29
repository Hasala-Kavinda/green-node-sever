import mongoose, { Schema, Document } from 'mongoose';

export interface IReading extends Document {
  deviceId: string;
  temperature: number;      // in Celsius (°C)
  humidity: number;         // in % (0-100)
  soilMoisture: number;     // in % (0-100) or calibrated sensor percentage
  light: number;            // in Lux or sensor reading
  battery?: number;         // in volts (e.g. 3.7) or % (0-100)
  location?: string;        // e.g. "Greenhouse-North-Bed-1"
  metadata?: Record<string, any>;
  timestamp: Date;
}

const ReadingSchema: Schema = new Schema<IReading>(
  {
    deviceId: {
      type: String,
      required: [true, 'deviceId is required'],
      trim: true,
      index: true
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
    battery: {
      type: Number,
      required: false
    },
    location: {
      type: String,
      required: false,
      trim: true,
      default: 'Default Zone'
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

// Compound index for fast queries by device and time range
ReadingSchema.index({ deviceId: 1, timestamp: -1 });

export const Reading = mongoose.model<IReading>('Reading', ReadingSchema);
