import { Router } from 'express';
import { HubCommandController } from '../controllers/hubCommand.controller.js';

const router = Router();

router.post('/hub/commands', HubCommandController.createCommand);
router.get('/hub/commands', HubCommandController.listCommands);
router.delete('/hub/commands', HubCommandController.clearCommands);
router.get('/hub/commands/pending', HubCommandController.getPendingCommands);
router.post('/hub/commands/:commandId/ack', HubCommandController.acknowledgeCommand);
router.get('/hub/status', HubCommandController.getHubStatus);

export default router;
