import { Router } from 'express';
import { registerAuthRoutes } from './auth.js';
import { registerReportRoutes } from './reports.js';
import { registerSightingRoutes } from './sightings.js';
import { registerMatchRoutes } from './matches.js';
import { registerChatRoutes } from './chat.js';
import { registerWebhookRoutes } from './webhooks.js';
import { registerAdminRoutes } from './admin.js';
import { registerAgentRoutes } from './agent.js';
import { registerPromotionRoutes } from './promotions.js';
import { registerPushRoutes } from './push.js';
import { registerSponsorRoutes } from './sponsors.js';

export function createRouter(): Router {
  const router = Router();

  registerAuthRoutes(router);
  registerReportRoutes(router);
  registerSightingRoutes(router);
  registerMatchRoutes(router);
  registerChatRoutes(router);
  registerWebhookRoutes(router);
  registerAdminRoutes(router);
  registerAgentRoutes(router);
  registerPromotionRoutes(router);
  registerPushRoutes(router);
  registerSponsorRoutes(router);

  return router;
}
