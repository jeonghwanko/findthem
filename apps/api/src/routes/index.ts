import { Router } from 'express';
import { registerAuthRoutes } from './auth.js';
import { registerReportRoutes } from './reports.js';
import { registerSightingRoutes } from './sightings.js';
import { registerMatchRoutes } from './matches.js';
import { registerChatRoutes } from './chat.js';
import { registerWebhookRoutes } from './webhooks.js';

export function createRouter(): Router {
  const router = Router();

  registerAuthRoutes(router);
  registerReportRoutes(router);
  registerSightingRoutes(router);
  registerMatchRoutes(router);
  registerChatRoutes(router);
  registerWebhookRoutes(router);

  return router;
}
