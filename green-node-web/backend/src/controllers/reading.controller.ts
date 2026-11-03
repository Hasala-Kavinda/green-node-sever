import type { Request, Response } from 'express';
import { ReadingService } from '../services/reading.service.js';
import {
  createReadingSchema,
  batchReadingsSchema,
  queryReadingsSchema,
  registerDeviceSchema,
  updateDeviceSchema,
  heartbeatSchema,
  createCompanySchema,
  createGreenhouseSchema,
  assignDeviceToGreenhouseSchema
} from '../schemas/reading.schema.js';

export class ReadingController {
  /**
   * POST /api/readings
   * Ingest a single sensor packet from an ESP node (Strict Registration Required)
   */
  static async createReading(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createReadingSchema.parse(req.body);
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip;
      const reading = await ReadingService.saveReading(validatedData, clientIp);

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
      if (error.statusCode === 403) {
        res.status(403).json({
          success: false,
          error: error.message || 'Forbidden: Device not registered'
        });
        return;
      }
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/readings/batch
   * Ingest a batch of sensor packets (Strict Registration Required)
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
      if (error.statusCode === 403) {
        res.status(403).json({
          success: false,
          error: error.message || 'Forbidden: Device not registered'
        });
        return;
      }
      res.status(error.statusCode || 500).json({
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
      const greenhouseId = req.query.greenhouseId as string | undefined;
      const reading = await ReadingService.getLatestReading(deviceId, greenhouseId);

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
      const greenhouseId = req.query.greenhouseId as string | undefined;
      const hours = req.query.hours ? parseInt(req.query.hours as string, 10) : 24;

      const stats = await ReadingService.getStats(deviceId, isNaN(hours) ? 24 : hours, greenhouseId);

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

  // ==========================================================================
  // COMPANY CONTROLLERS
  // ==========================================================================

  /**
   * POST /api/companies
   * Register a new company with Name and Location
   */
  static async createCompany(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createCompanySchema.parse(req.body);
      const company = await ReadingService.createCompany(validatedData);

      res.status(201).json({
        success: true,
        message: 'Company registered successfully',
        data: company
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Company registration validation failed',
          details: error.errors
        });
        return;
      }
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/companies
   * List all registered companies
   */
  static async getCompanies(_req: Request, res: Response): Promise<void> {
    try {
      const companies = await ReadingService.getCompanies();
      res.json({
        success: true,
        count: companies.length,
        data: companies
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/companies/:companyId
   */
  static async getCompanyById(req: Request, res: Response): Promise<void> {
    try {
      const companyId = Array.isArray(req.params.companyId) ? req.params.companyId[0] : req.params.companyId;
      const company = await ReadingService.getCompanyById(companyId);

      if (!company) {
        res.status(404).json({
          success: false,
          error: `Company "${companyId}" not found`
        });
        return;
      }

      res.json({
        success: true,
        data: company
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  // ==========================================================================
  // GREENHOUSE CONTROLLERS
  // ==========================================================================

  /**
   * POST /api/greenhouses
   * Create a new greenhouse under a company location
   */
  static async createGreenhouse(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = createGreenhouseSchema.parse(req.body);
      const greenhouse = await ReadingService.createGreenhouse(validatedData);

      res.status(201).json({
        success: true,
        message: 'Greenhouse created successfully',
        data: greenhouse
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Greenhouse creation validation failed',
          details: error.errors
        });
        return;
      }
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/greenhouses
   * List all greenhouses (optionally filtered by companyLocation)
   */
  static async getGreenhouses(req: Request, res: Response): Promise<void> {
    try {
      const companyId = req.query.companyId as string | undefined;
      const greenhouses = await ReadingService.getGreenhouses(companyId);

      res.json({
        success: true,
        count: greenhouses.length,
        data: greenhouses
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/greenhouses/:greenhouseId/overview
   * Retrieve full greenhouse state with all assigned ESP nodes & aggregated telemetry
   */
  static async getGreenhouseOverview(req: Request, res: Response): Promise<void> {
    try {
      const greenhouseId = Array.isArray(req.params.greenhouseId)
        ? req.params.greenhouseId[0]
        : req.params.greenhouseId;
      const overview = await ReadingService.getGreenhouseOverview(greenhouseId);

      if (!overview) {
        res.status(404).json({
          success: false,
          error: `Greenhouse "${greenhouseId}" not found`
        });
        return;
      }

      res.json({
        success: true,
        data: overview
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/greenhouses/:greenhouseId/assign
   * Connect / assign an existing registered ESP node to a greenhouse
   */
  static async assignDeviceToGreenhouse(req: Request, res: Response): Promise<void> {
    try {
      const greenhouseId = Array.isArray(req.params.greenhouseId)
        ? req.params.greenhouseId[0]
        : req.params.greenhouseId;
      const validated = assignDeviceToGreenhouseSchema.parse(req.body);
      const result = await ReadingService.assignDeviceToGreenhouse(greenhouseId, validated.deviceId);

      res.json({
        success: true,
        message: `Device "${validated.deviceId}" successfully connected to greenhouse`,
        data: result
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
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  // ==========================================================================
  // DEVICE CONTROLLERS
  // ==========================================================================

  /**
   * POST /api/devices (Register an ESP node with UUID, Company Location, and Greenhouse)
   */
  static async registerDevice(req: Request, res: Response): Promise<void> {
    try {
      const validatedData = registerDeviceSchema.parse(req.body);
      const device = await ReadingService.registerDevice(validatedData);

      res.status(201).json({
        success: true,
        message: 'ESP Node registered successfully',
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
   * PUT /api/devices/:deviceId
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
   * List all registered devices (supports filtering by greenhouseId & companyLocation)
   */
  static async getDevices(req: Request, res: Response): Promise<void> {
    try {
      const greenhouseId = req.query.greenhouseId as string | undefined;
      const companyLocation = req.query.companyLocation as string | undefined;
      const devices = await ReadingService.getDevices(greenhouseId, companyLocation);

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

  /**
   * POST /api/devices/:deviceId/heartbeat
   */
  static async recordHeartbeat(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
      const validatedData = heartbeatSchema.parse(req.body);
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip;

      const device = await ReadingService.recordHeartbeat(deviceId, validatedData, clientIp);

      res.json({
        success: true,
        message: 'Heartbeat acknowledged',
        data: {
          deviceId: device.deviceId,
          status: device.status,
          lastSeen: device.lastSeen,
          greenhouseName: device.greenhouseName,
          companyLocation: device.companyLocation
        }
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Heartbeat payload validation failed',
          details: error.errors
        });
        return;
      }
      if (error.statusCode === 403) {
        res.status(403).json({
          success: false,
          error: error.message || 'Heartbeat rejected: Device not registered'
        });
        return;
      }
      res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/devices/:deviceId/health
   */
  static async getDeviceHealth(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
      const health = await ReadingService.getDeviceHealth(deviceId);

      if (!health) {
        res.status(404).json({
          success: false,
          error: 'Device not found'
        });
        return;
      }

      res.json({
        success: true,
        data: health
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/devices/:deviceId/ping
   */
  static async pingDevice(req: Request, res: Response): Promise<void> {
    try {
      const deviceId = Array.isArray(req.params.deviceId) ? req.params.deviceId[0] : req.params.deviceId;
      const timeoutMs = req.query.timeout ? parseInt(req.query.timeout as string, 10) : 2500;

      const result = await ReadingService.pingEspNode(deviceId, timeoutMs);

      if (!result.found) {
        res.status(404).json({
          success: false,
          error: result.error
        });
        return;
      }

      res.json({
        success: result.isReachable,
        data: result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/reset
   */
  static async resetDatabase(req: Request, res: Response): Promise<void> {
    try {
      const result = await ReadingService.resetDatabase(req.body);
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/logs
   */
  static async getLogs(req: Request, res: Response): Promise<void> {
    try {
      const { LoggerService } = await import('../services/logger.service.js');
      const query = {
        deviceId: req.query.deviceId as string | undefined,
        level: req.query.level as string | undefined,
        category: req.query.category as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        page: req.query.page ? parseInt(req.query.page as string, 10) : 1
      };
      const result = await LoggerService.getLogs(query);
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * DELETE /api/logs
   */
  static async clearLogs(_req: Request, res: Response): Promise<void> {
    try {
      const { LoggerService } = await import('../services/logger.service.js');
      const result = await LoggerService.clearLogs();
      res.json({
        success: true,
        message: 'Logs cleared successfully',
        ...result
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }
}
