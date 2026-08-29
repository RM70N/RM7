import { Router } from 'express';
import authRoutes from './auth.routes.js';
import chatRoutes from './chat.routes.js';

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

export default router;
