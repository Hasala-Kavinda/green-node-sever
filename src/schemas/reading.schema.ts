import { z } from 'zod';

export const createReadingSchema = z.object({
  deviceId: z.string().min(1, 'deviceId cannot be empty').max(64, 'deviceId too long'),
  temperature: z.number().min(-50, 'temperature too low').max(100, 'temperature too high'),
  humidity: z.number().min(0, 'humidity must be between 0 and 100%').max(100, 'humidity must be between 0 and 100%'),
  soilMoisture: z.number().min(0, 'soilMoisture must be between 0 and 100%').max(100, 'soilMoisture must be between 0 and 100%'),
  light: z.number().min(0, 'light must be greater than or equal to 0'),
  battery: z.number().min(0).max(100).optional(),
  location: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  timestamp: z.union([z.string().datetime(), z.date()]).optional().transform((val) => (val ? new Date(val) : new Date()))
});

export const batchReadingsSchema = z.object({
  readings: z.array(createReadingSchema).min(1, 'Must provide at least 1 reading').max(500, 'Max 500 readings per batch')
});

export const queryReadingsSchema = z.object({
  deviceId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  sortBy: z.enum(['timestamp', 'temperature', 'humidity', 'soilMoisture', 'light']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export type CreateReadingInput = z.infer<typeof createReadingSchema>;
export type BatchReadingsInput = z.infer<typeof batchReadingsSchema>;
export type QueryReadingsInput = z.infer<typeof queryReadingsSchema>;
