import crypto from 'crypto';
import { HubCommand, IHubCommand } from '../models/HubCommand.js';
import { Device } from '../models/Device.js';
import { broadcast } from './websocket.service.js';
import { LoggerService } from './logger.service.js';
import type { AckHubCommandInput, CreateHubCommandInput } from '../schemas/hubCommand.schema.js';

interface HubRuntimeState {
  lastPollAt: Date | null;
  lastHubId: string | null;
  lastMapsDetails: Record<string, any> | null;
}

const runtimeState: HubRuntimeState = {
  lastPollAt: null,
  lastHubId: null,
  lastMapsDetails: null
};

function buildCliAndPayload(input: CreateHubCommandInput): {
  cliString: string;
  payload: Record<string, any>;
} {
  switch (input.type) {
    case 'cmd':
      return {
        cliString: `cmd ${input.deviceId} ${input.action}`,
        payload: {
          deviceId: input.deviceId,
          action: input.action,
          durationS: input.durationS ?? 300
        }
      };
    case 'pair':
      return {
        cliString: `pair ${input.kind} ${input.name}`,
        payload: {
          kind: input.kind,
          name: input.name,
          seconds: input.seconds ?? 120
        }
      };
    case 'cancel':
      return {
        cliString: 'cancel',
        payload: {}
      };
    case 'cfg':
      return {
        cliString: `cfg ${input.deviceId} ${input.intervalS}`,
        payload: {
          deviceId: input.deviceId,
          intervalS: input.intervalS
        }
      };
    case 'map':
      return {
        cliString: `map ${input.snId} ${input.uuid}`,
        payload: {
          snId: input.snId,
          uuid: input.uuid
        }
      };
    case 'maps':
      return {
        cliString: 'maps',
        payload: {}
      };
  }
}

function toHubWireFormat(doc: IHubCommand) {
  const p = doc.payload || {};
  return {
    commandId: doc.commandId,
    type: doc.type,
    cliString: doc.cliString,
    deviceId: p.deviceId || '',
    action: p.action || '',
    durationS: typeof p.durationS === 'number' ? p.durationS : 300,
    kind: p.kind || '',
    name: p.name || '',
    seconds: typeof p.seconds === 'number' ? p.seconds : 120,
    intervalS: typeof p.intervalS === 'number' ? p.intervalS : 60,
    snId: p.snId || '',
    uuid: p.uuid || ''
  };
}

export class HubCommandService {
  static async enqueueCommand(input: CreateHubCommandInput): Promise<IHubCommand> {
    const commandId = crypto.randomUUID();
    const hubId = input.hubId?.trim() || 'default';
    const { cliString, payload } = buildCliAndPayload(input);

    const cmd = await HubCommand.create({
      commandId,
      hubId,
      type: input.type,
      cliString,
      payload,
      status: 'pending',
      requestedBy: 'dashboard'
    });

    await LoggerService.recordLog({
      level: 'info',
      category: 'device',
      deviceId: payload.uuid || payload.deviceId || undefined,
      message: `Queued hub CLI command: "${cliString}"`,
      details: {
        commandId: cmd.commandId,
        type: cmd.type,
        hubId: cmd.hubId,
        payload: cmd.payload
      }
    });

    broadcast('hub_command_queued', cmd.toObject());
    return cmd;
  }

  static async listCommands(options: { limit?: number; status?: string; hubId?: string }) {
    const filter: Record<string, any> = {};
    if (options.status) filter.status = options.status;
    if (options.hubId) filter.hubId = options.hubId;

    const limit = Math.min(100, Math.max(1, options.limit || 30));
    return HubCommand.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  }

  static async claimPendingCommands(hubId?: string, limit: number = 4) {
    const cleanHubId = hubId?.trim();
    runtimeState.lastPollAt = new Date();
    if (cleanHubId) {
      runtimeState.lastHubId = cleanHubId;
    }

    // Recover commands stuck in "dispatched" longer than 90s without hub acknowledgment
    const staleCutoff = new Date(Date.now() - 90_000);
    const staleFilter: Record<string, any> = {
      status: 'dispatched',
      dispatchedAt: { $lt: staleCutoff }
    };
    if (cleanHubId) {
      staleFilter.$or = [{ hubId: 'default' }, { hubId: cleanHubId }];
    }
    const staleCommands = await HubCommand.find(staleFilter);
    for (const stale of staleCommands) {
      stale.status = 'failed';
      stale.executedAt = new Date();
      stale.resultMessage = 'Timed out waiting for hub acknowledgment';
      await stale.save();
      broadcast('hub_command_updated', stale.toObject());
    }

    const maxBatch = Math.min(10, Math.max(1, limit));
    const filter: Record<string, any> = { status: 'pending' };
    if (cleanHubId) {
      filter.$or = [{ hubId: 'default' }, { hubId: cleanHubId }];
    }

    const claimed: IHubCommand[] = [];
    for (let i = 0; i < maxBatch; i++) {
      const next = await HubCommand.findOneAndUpdate(
        filter,
        {
          $set: {
            status: 'dispatched',
            dispatchedAt: new Date(),
            ...(cleanHubId ? { hubId: cleanHubId } : {})
          }
        },
        { sort: { createdAt: 1 }, new: true }
      );
      if (!next) break;
      claimed.push(next);
      broadcast('hub_command_updated', next.toObject());
    }

    return claimed.map(toHubWireFormat);
  }

  static async acknowledgeCommand(commandId: string, input: AckHubCommandInput) {
    const cmd = await HubCommand.findOne({ commandId: commandId.toLowerCase() });
    if (!cmd) return null;

    cmd.status = input.status;
    cmd.executedAt = new Date();
    if (input.hubId?.trim()) {
      cmd.hubId = input.hubId.trim();
      runtimeState.lastHubId = cmd.hubId;
    }
    if (input.resultMessage !== undefined) {
      cmd.resultMessage = input.resultMessage;
    }
    if (input.details !== undefined) {
      cmd.details = input.details;
      if (cmd.type === 'maps') {
        runtimeState.lastMapsDetails = input.details;
      }
    }
    runtimeState.lastPollAt = new Date();

    await cmd.save();

    // Sync Device.subNodeId when a `map` command executes successfully on the hub
    if (
      cmd.type === 'map' &&
      input.status === 'executed' &&
      cmd.payload?.uuid &&
      cmd.payload?.snId
    ) {
      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId: String(cmd.payload.uuid).toLowerCase() },
        { $set: { subNodeId: String(cmd.payload.snId).trim() } },
        { new: true }
      ).lean();
      if (updatedDevice) {
        broadcast('device_updated', updatedDevice);
      }
    }

    await LoggerService.recordLog({
      level: input.status === 'executed' ? 'success' : 'error',
      category: 'device',
      deviceId: cmd.payload?.uuid || cmd.payload?.deviceId || undefined,
      message: `Hub command "${cmd.cliString}" ${input.status}${cmd.resultMessage ? `: ${cmd.resultMessage}` : ''}`,
      details: {
        commandId: cmd.commandId,
        status: cmd.status,
        hubId: cmd.hubId,
        resultMessage: cmd.resultMessage,
        details: cmd.details
      }
    });

    broadcast('hub_command_updated', cmd.toObject());
    return cmd;
  }

  static async getHubStatus() {
    if (!runtimeState.lastMapsDetails) {
      const latestMaps = await HubCommand.findOne({
        type: 'maps',
        status: 'executed',
        details: { $exists: true, $ne: null }
      })
        .sort({ executedAt: -1, createdAt: -1 })
        .lean();
      if (latestMaps?.details) {
        runtimeState.lastMapsDetails = latestMaps.details;
      }
    }

    const pendingCount = await HubCommand.countDocuments({ status: 'pending' });
    const now = Date.now();
    const lastPollMs = runtimeState.lastPollAt ? runtimeState.lastPollAt.getTime() : 0;
    const isHubPollingActive = lastPollMs > 0 && now - lastPollMs <= 20000;

    return {
      isHubPollingActive,
      lastPollAt: runtimeState.lastPollAt ? runtimeState.lastPollAt.toISOString() : null,
      lastHubId: runtimeState.lastHubId,
      pendingCount,
      lastMapsDetails: runtimeState.lastMapsDetails
    };
  }

  static async clearCommands() {
    const result = await HubCommand.deleteMany({});
    runtimeState.lastMapsDetails = null;
    broadcast('hub_commands_cleared', { deletedCount: result.deletedCount });
    return { deletedCount: result.deletedCount };
  }
}
