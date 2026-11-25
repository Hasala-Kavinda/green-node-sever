import mongoose, { Schema, Document } from 'mongoose';

export type HubCommandType = 'cmd' | 'pair' | 'cancel' | 'cfg' | 'map' | 'maps';
export type HubCommandStatus = 'pending' | 'dispatched' | 'executed' | 'failed';

export interface IHubCommand extends Document {
  commandId: string;
  hubId: string;
  type: HubCommandType;
  cliString: string;
  payload: Record<string, any>;
  status: HubCommandStatus;
  resultMessage?: string;
  details?: Record<string, any>;
  requestedBy: string;
  dispatchedAt?: Date;
  executedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const HubCommandSchema: Schema = new Schema<IHubCommand>(
  {
    commandId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true
    },
    hubId: {
      type: String,
      required: false,
      default: 'default',
      trim: true,
      index: true
    },
    type: {
      type: String,
      enum: ['cmd', 'pair', 'cancel', 'cfg', 'map', 'maps'],
      required: true,
      index: true
    },
    cliString: {
      type: String,
      required: true,
      trim: true
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['pending', 'dispatched', 'executed', 'failed'],
      default: 'pending',
      index: true
    },
    resultMessage: {
      type: String,
      required: false,
      trim: true
    },
    details: {
      type: Schema.Types.Mixed,
      required: false
    },
    requestedBy: {
      type: String,
      default: 'dashboard',
      trim: true
    },
    dispatchedAt: {
      type: Date,
      required: false
    },
    executedAt: {
      type: Date,
      required: false
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

HubCommandSchema.index({ status: 1, createdAt: 1 });
HubCommandSchema.index({ createdAt: -1 });

export const HubCommand = mongoose.model<IHubCommand>('HubCommand', HubCommandSchema);
