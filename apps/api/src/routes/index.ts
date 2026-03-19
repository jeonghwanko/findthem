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
import { registerAgentsRoutes } from './agents.js';
import { registerOgRoutes } from './og.js';
import { registerCommunityRoutes } from './community.js';
import { registerOutreachRoutes } from './outreach.js';
import { registerUserRoutes } from './users.js';
import { registerGameRoutes } from './game.js';
import { registerInquiryRoutes } from './inquiries.js';

export function createRouter(): Router {
  const router = Router();

  registerOgRoutes(router);
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
  registerAgentsRoutes(router);
  registerCommunityRoutes(router);
  registerOutreachRoutes(router);
  registerUserRoutes(router);
  registerGameRoutes(router);
  registerInquiryRoutes(router);

  return router;
}
