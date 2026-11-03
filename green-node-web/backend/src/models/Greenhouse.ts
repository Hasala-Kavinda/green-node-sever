import mongoose, { Schema, Document } from 'mongoose';

export interface IGreenhouse extends Document {
  greenhouseId: string;        // Unique identifier for the greenhouse
  name: string;                // e.g. "Greenhouse 01"
  companyId: string;           // Reference to registered Company
  companyName: string;         // e.g. "Ceylon Agri Corp"
  companyLocation: string;     // e.g. "Colombo Agri Facility"
  plant: string;               // e.g. "Heirloom Tomatoes", "Strawberries", "Basil"
  description?: string;
  assignedDeviceIds: string[]; // List of registered ESP deviceId UUIDs
  createdAt: Date;
  updatedAt: Date;
}

const GreenhouseSchema: Schema = new Schema<IGreenhouse>(
  {
    greenhouseId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Greenhouse name is required'],
      trim: true
    },
    companyId: {
      type: String,
      required: [true, 'Registered company ID is required'],
      trim: true,
      lowercase: true,
      index: true
    },
    companyName: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true
    },
    companyLocation: {
      type: String,
      required: [true, 'Company location is required'],
      trim: true,
      index: true
    },
    plant: {
      type: String,
      required: [true, 'Plant / crop type is required'],
      default: 'Mixed Crops',
      trim: true,
      index: true
    },
    description: {
      type: String,
      required: false,
      trim: true
    },
    assignedDeviceIds: {
      type: [String],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

// Compound indexes
GreenhouseSchema.index({ companyId: 1, name: 1 });
GreenhouseSchema.index({ companyLocation: 1, plant: 1 });

export const Greenhouse = mongoose.model<IGreenhouse>('Greenhouse', GreenhouseSchema);
