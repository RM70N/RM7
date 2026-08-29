import { Router } from 'express';
import authRoutes from './auth.routes.js';
import chatRoutes from './chat.routes.js';
import memoryRoutes from './memory.routes.js';
import knowledgeRoutes from './knowledge.routes.js';
import siteRoutes from './site.routes.js';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    name: 'احسمها AI',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
});

router.use('/auth', authRoutes);
router.use('/chat', chatRoutes);
router.use('/memory', memoryRoutes);
router.use('/knowledge', knowledgeRoutes);
router.use('/sites', siteRoutes);

export default router;
