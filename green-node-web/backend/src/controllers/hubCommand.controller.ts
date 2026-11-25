import type { Request, Response } from 'express';
import { HubCommandService } from '../services/hubCommand.service.js';
import { ackHubCommandSchema, createHubCommandSchema } from '../schemas/hubCommand.schema.js';

export class HubCommandController {
  /**
   * POST /api/hub/commands
   * Queue a hub CLI command (cmd, pair, cancel, cfg, map, maps)
   */
  static async createCommand(req: Request, res: Response): Promise<void> {
    try {
      const validated = createHubCommandSchema.parse(req.body);
      const command = await HubCommandService.enqueueCommand(validated);

      res.status(201).json({
        success: true,
        message: `Command "${command.cliString}" queued for hub`,
        data: command
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Invalid hub command payload',
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
   * GET /api/hub/commands
   * List queued and historical hub commands for the web dashboard
   */
  static async listCommands(req: Request, res: Response): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 30;
      const status = req.query.status as string | undefined;
      const hubId = req.query.hubId as string | undefined;

      const commands = await HubCommandService.listCommands({
        limit: isNaN(limit) ? 30 : limit,
        status,
        hubId
      });

      res.json({
        success: true,
        count: commands.length,
        data: commands
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * GET /api/hub/commands/pending
   * Polled by the ESP32-S3 hub to fetch & claim pending commands
   */
  static async getPendingCommands(req: Request, res: Response): Promise<void> {
    try {
      const hubId = req.query.hubId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 4;
      const commands = await HubCommandService.claimPendingCommands(hubId, isNaN(limit) ? 4 : limit);

      res.json({
        success: true,
        count: commands.length,
        commands
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * POST /api/hub/commands/:commandId/ack
   * Called by the ESP32-S3 hub after executing a claimed command
   */
  static async acknowledgeCommand(req: Request, res: Response): Promise<void> {
    try {
      const commandId = Array.isArray(req.params.commandId)
        ? req.params.commandId[0]
        : req.params.commandId;
      const validated = ackHubCommandSchema.parse(req.body);
      const updated = await HubCommandService.acknowledgeCommand(commandId, validated);

      if (!updated) {
        res.status(404).json({
          success: false,
          error: `Command "${commandId}" not found`
        });
        return;
      }

      res.json({
        success: true,
        data: updated
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({
          success: false,
          error: 'Invalid command acknowledgment payload',
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
   * GET /api/hub/status
   * Returns hub polling liveness, pending count, and last reported maps snapshot
   */
  static async getHubStatus(_req: Request, res: Response): Promise<void> {
    try {
      const status = await HubCommandService.getHubStatus();
      res.json({
        success: true,
        data: status
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        error: error.message || 'Internal Server Error'
      });
    }
  }

  /**
   * DELETE /api/hub/commands
   * Clear hub command history
   */
  static async clearCommands(_req: Request, res: Response): Promise<void> {
    try {
      const result = await HubCommandService.clearCommands();
      res.json({
        success: true,
        message: 'Hub command history cleared',
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
