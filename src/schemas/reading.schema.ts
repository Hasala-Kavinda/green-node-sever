import { z } from 'zod';
import crypto from 'crypto';

export const createReadingSchema = z.preprocess(
  (raw: any) => {
    if (typeof raw === 'object' && raw !== null) {
      const copy = { ...raw };
      // Map aliases for device_id
      if (!copy.deviceId && copy.device_id) {
        copy.deviceId = copy.device_id;
      }
      // Map aliases for soil moisture
      if (copy.soilMoisture === undefined) {
        if (copy.soil_percent !== undefined) copy.soilMoisture = copy.soil_percent;
        else if (copy.soil_moisture !== undefined) copy.soilMoisture = copy.soil_moisture;
      }
      // If light is omitted, default to 0
      if (copy.light === undefined) {
        copy.light = 0;
      }
      return copy;
    }
    return raw;
  },
  z.object({
    deviceId: z
      .string()
      .uuid({ message: 'deviceId must be a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)' })
      .transform((val) => val.toLowerCase()),
    temperature: z
      .number()
      .min(-50, 'temperature too low')
      .max(100, 'temperature too high'),
    humidity: z
      .number()
      .min(0, 'humidity must be between 0 and 100%')
      .max(100, 'humidity must be between 0 and 100%'),
    soilMoisture: z
      .number()
      .min(0, 'soilMoisture must be between 0 and 100%')
      .max(100, 'soilMoisture must be between 0 and 100%'),
    light: z
      .number()
      .min(0, 'light must be greater than or equal to 0')
      .default(0),
    metadata: z.record(z.string(), z.any()).optional(),
    timestamp: z
      .union([z.string().datetime(), z.date()])
      .optional()
      .transform((val) => (val ? new Date(val) : new Date()))
  })
);

export const batchReadingsSchema = z.object({
  readings: z
    .array(createReadingSchema)
    .min(1, 'Must provide at least 1 reading')
    .max(500, 'Max 500 readings per batch')
});

export const queryReadingsSchema = z.object({
  deviceId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  sortBy: z.enum(['timestamp', 'temperature', 'humidity', 'soilMoisture', 'light']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export const registerDeviceSchema = z.object({
  deviceId: z
    .string()
    .uuid({ message: 'deviceId must be a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)' })
    .optional()
    .transform((val) => (val ? val.toLowerCase() : crypto.randomUUID())),
  name: z.string().min(1).max(100).optional(),
  location: z.string().min(1, 'location cannot be empty').max(150, 'location too long'),
  ipAddress: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional().default(80),
  heartbeatTimeoutSeconds: z.number().int().min(5).max(86400).optional().default(60)
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  location: z.string().min(1).max(150).optional(),
  ipAddress: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  heartbeatTimeoutSeconds: z.number().int().min(5).max(86400).optional(),
  status: z.enum(['online', 'warning', 'offline']).optional()
});

export const heartbeatSchema = z.object({
  ipAddress: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional(),
  rssi: z.number().optional(),
  uptimeSeconds: z.number().optional()
});

export type CreateReadingInput = z.infer<typeof createReadingSchema>;
export type BatchReadingsInput = z.infer<typeof batchReadingsSchema>;
export type QueryReadingsInput = z.infer<typeof queryReadingsSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
