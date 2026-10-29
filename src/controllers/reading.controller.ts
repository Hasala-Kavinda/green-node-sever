import type { Request, Response } from 'express';
import { ReadingService } from '../services/reading.service.js';
import {
  createReadingSchema,
  batchReadingsSchema,
  queryReadingsSchema,
  registerDeviceSchema,
  updateDeviceSchema
} from '../schemas/reading.schema.js';

export class ReadingController {
  /**
   * POST /api/readings
   */
  static async createReading(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createReadingSchema.parse(req.body);
      const reading = await ReadingService.saveReading(validatedData);

      res.status(201).json({
        success: true,
        message: 'Sensor reading recorded successfully',
        data: reading
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/readings/batch
   */
  static async createBatchReadings(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = batchReadingsSchema.parse(req.body);
      const result = await ReadingService.saveBatchReadings(validatedData.readings);

      res.status(201).json({
        success: true,
        message: `Successfully ingested ${result.count} sensor readings`,
        count: result.count
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Batch validation failed',
          details: error.errors
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/readings
   */
  static async getReadings(req: Request, res: Response): Promise<void> {
    try {
      const queryParams = queryReadingsSchema.parse(req.query);
      const result = await ReadingService.getReadings(queryParams);

      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/readings/latest
   */
  static async getLatestReading(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = req.query.deviceId as string | undefined;
      const reading = await ReadingService.getLatestReading(deviceId);

      if (!reading) {
        res.status(404).json({
          success: false,
          message: 'No sensor readings found'
        });
        return;
      }

      res.json({
        success: true,
        data: reading
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/readings/stats
   */
  static async getStats(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = req.query.deviceId as string | undefined;
      const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;

      const stats = await ReadingService.getStats(deviceId, isNaN(hours) ? 24 : hours);

      res.json({
        success: true,
        data: stats
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/devices (Register a device with UUID and location)
   */
  static async registerDevice(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = registerDeviceSchema.parse(req.body);
      const device = await ReadingService.registerDevice(validatedData);

      res.status(201).json({
        success: true,
        message: 'Device registered successfully',
        data: device
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Device registration validation failed',
          details: error.errors
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * PUT /api/devices/:deviceId (Update location, name, or status)
   */
  static async updateDevice(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
      const validatedData = updateDeviceSchema.parse(req.body);
      const device = await ReadingService.updateDevice(deviceId, validatedData);

      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found'
        });
        return;
      }

      res.json({
        success: true,
        message: 'Device updated successfully',
        data: device
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Device update validation failed',
          details: error.errors
        });
        return;
      }
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/devices
   */
  static async getDevices(_req: Request, res: Response): Promise<void> {
    try {
      const devices = await ReadingService.getDevices();
      res.json({
        success: true,
        count: devices.length,
        data: devices
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/devices/:deviceId
   */
  static async getDeviceById(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
      const device = await ReadingService.getDeviceById(deviceId);
      if (!device) {
        res.status(404).json({
          success: false,
          error: 'Device not found'
        });
        return;
      }

      res.json({
        success: true,
        data: device
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }
}
