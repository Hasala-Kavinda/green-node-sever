import { z } from 'zod';
import crypto from 'crypto';

export const createReadingSchema = z.preprocess(
  (raw: any) => {
    if (typeof raw === 'object' && raw !== null) {
      const copy = { ...raw };
      if (!copy.deviceId && copy.device_id) {
        copy.deviceId = copy.device_id;
      }
      if (copy.temperature === undefined) {
        if (copy.temp !== undefined) copy.temperature = copy.temp;
        else if (copy.ambient_temp !== undefined) copy.temperature = copy.ambient_temp;
        else if (copy.ambientTemperature !== undefined) copy.temperature = copy.ambientTemperature;
      }
      if (copy.humidity === undefined) {
        if (copy.hum !== undefined) copy.humidity = copy.hum;
      }
      if (copy.soilMoisture === undefined) {
        if (copy.soil_percent !== undefined) copy.soilMoisture = copy.soil_percent;
        else if (copy.soil_moisture !== undefined) copy.soilMoisture = copy.soil_moisture;
        else if (copy.soilMoisturePercent !== undefined) copy.soilMoisture = copy.soilMoisturePercent;
      }
      if (copy.light === undefined) {
        if (copy.lux !== undefined) copy.light = copy.lux;
        else if (copy.light_level !== undefined) copy.light = copy.light_level;
        else if (copy.lightLevel !== undefined) copy.light = copy.lightLevel;
        else copy.light = 0;
      }
      if (copy.espTemperature === undefined) {
        if (copy.esp_temperature !== undefined) copy.espTemperature = copy.esp_temperature;
        else if (copy.chip_temp !== undefined) copy.espTemperature = copy.chip_temp;
        else if (copy.internal_temp !== undefined) copy.espTemperature = copy.internal_temp;
        else if (copy.internalTemperature !== undefined) copy.espTemperature = copy.internalTemperature;
        else if (copy.espTemp !== undefined) copy.espTemperature = copy.espTemp;
      }
      if (!copy.wifiSsid) {
        if (copy.wifi_ssid) copy.wifiSsid = copy.wifi_ssid;
        else if (copy.ssid) copy.wifiSsid = copy.ssid;
        else if (copy.wifiNetwork) copy.wifiSsid = copy.wifiNetwork;
        else if (copy.wifi_network) copy.wifiSsid = copy.wifi_network;
      }
      if (copy.timestamp === undefined) {
        if (copy.esp_timestamp !== undefined) copy.timestamp = copy.esp_timestamp;
        else if (copy.espTimestamp !== undefined) copy.timestamp = copy.espTimestamp;
        else if (copy.device_timestamp !== undefined) copy.timestamp = copy.device_timestamp;
        else if (copy.deviceTimestamp !== undefined) copy.timestamp = copy.deviceTimestamp;
        else if (copy.time !== undefined) copy.timestamp = copy.time;
        else if (copy.epoch !== undefined) copy.timestamp = copy.epoch;
      }
      if (typeof copy.timestamp === 'number') {
        if (copy.timestamp < 10000000000) {
          copy.timestamp = copy.timestamp * 1000;
        }
        copy.timestamp = new Date(copy.timestamp);
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
    espTemperature: z
      .number()
      .min(-40, 'ESP temperature cannot be less than -40°C')
      .max(125, 'ESP temperature cannot exceed 125°C')
      .optional(),
    wifiSsid: z.string().trim().max(100).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
    timestamp: z
      .union([z.string(), z.number(), z.date()])
      .optional()
      .transform((val) => {
        if (!val) return new Date();
        const d = new Date(val);
        return isNaN(d.getTime()) ? new Date() : d;
      })
  })
);

export const batchReadingsSchema = z.object({
  readings: z
    .array(createReadingSchema)
    .min(1, 'Must provide at least 1 reading')
    .max(500, 'Max 500 readings per batch')
});

export const queryReadingsSchema = z.object({
  deviceId: z.string().optional(),
  greenhouseId: z.string().optional(),
  companyId: z.string().optional(),
  companyLocation: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(1000).default(50),
  sortBy: z.enum(['timestamp', 'temperature', 'humidity', 'soilMoisture', 'light', 'espTemperature']).default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).default('desc')
});

export const createCompanySchema = z.object({
  companyId: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .transform((val) => (val ? val.toLowerCase().trim().replace(/\s+/g, '-') : `comp-${crypto.randomUUID().substring(0, 8)}`)),
  name: z.string().min(1, 'Company name is required').max(150),
  location: z.string().min(1, 'Company location is required').max(150),
  description: z.string().max(500).optional()
});

export const createGreenhouseSchema = z.object({
  greenhouseId: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .transform((val) => (val ? val.toLowerCase().trim().replace(/\s+/g, '-') : `gh-${crypto.randomUUID().substring(0, 8)}`)),
  companyId: z.string().min(1, 'Registered company ID is required').max(100),
  name: z.string().min(1, 'Greenhouse name is required').max(100),
  plant: z.string().min(1, 'Plant / crop type is required').max(100),
  description: z.string().max(500).optional(),
  assignedDeviceIds: z.array(z.string().uuid()).optional().default([])
});

export const registerDeviceSchema = z.object({
  deviceId: z
    .string()
    .uuid({ message: 'deviceId must be a valid UUID (e.g. 123e4567-e89b-12d3-a456-426614174000)' })
    .optional()
    .transform((val) => (val ? val.toLowerCase() : crypto.randomUUID())),
  name: z.string().min(1).max(100).optional(),
  greenhouseId: z.string().min(1).max(100).optional().default('greenhouse-01'),
  sensorType: z.enum(['fc28', 'md0869', 'combo', 'generic']).optional().default('fc28'),
  location: z.string().min(1, 'location cannot be empty').max(150, 'location too long').optional().default('Zone 1'),
  ipAddress: z.string().optional(),
  port: z.number().int().min(1).max(65535).optional().default(80),
  heartbeatTimeoutSeconds: z.number().int().min(5).max(86400).optional().default(60)
});

export const updateDeviceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  greenhouseId: z.string().min(1).max(100).optional(),
  sensorType: z.string().optional(),
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

export const assignDeviceToGreenhouseSchema = z.object({
  deviceId: z.string().uuid({ message: 'deviceId must be a valid UUID' }).transform((val) => val.toLowerCase())
});

export type CreateReadingInput = z.infer<typeof createReadingSchema>;
export type BatchReadingsInput = z.infer<typeof batchReadingsSchema>;
export type QueryReadingsInput = z.infer<typeof queryReadingsSchema>;
export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateGreenhouseInput = z.infer<typeof createGreenhouseSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UpdateDeviceInput = z.infer<typeof updateDeviceSchema>;
export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
