import mongoose, { Schema, Document } from 'mongoose';

export interface ICompany extends Document {
  companyId: string;    // Unique identifier for the company
  name: string;         // Company name, e.g. "Ceylon Agri Corp"
  location: string;     // Company location, e.g. "Colombo Agri Facility"
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CompanySchema: Schema = new Schema<ICompany>(
  {
    companyId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true
    },
    location: {
      type: String,
      required: [true, 'Company location is required'],
      trim: true,
      index: true
    },
    description: {
      type: String,
      required: false,
      trim: true
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

CompanySchema.index({ name: 1, location: 1 });

export const Company = mongoose.model<ICompany>('Company', CompanySchema);
