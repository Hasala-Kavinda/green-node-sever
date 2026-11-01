import mongoose, { Schema, Document } from 'mongoose';

export interface IReading extends Document {
  deviceId: string;         // UUID of the sensor node
  temperature: number;      // in Celsius (°C)
  humidity: number;         // in % (0-100)
  soilMoisture: number;     // in % (0-100)
  light: number;            // in Lux (>= 0)
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

// Compound index for device and time-series lookups
ReadingSchema.index({ deviceId: 1, timestamp: -1 });

export const Reading = mongoose.model<IReading>('Reading', ReadingSchema);
