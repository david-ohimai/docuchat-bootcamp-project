import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { cacheRedis } from '../lib/cache';
import { asyncHandler } from '../lib/asyncHandler';

const router = Router();

// Liveness: is the process running? (A failure here means restart it.)
router.get('/health/live', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// Readiness: can it serve traffic? Actually checks the dependencies.
router.get(
  '/health/ready',
  asyncHandler(async (_req, res) => {
    const checks: Record<string, { status: string; message?: string }> = {};

    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch (error) {
      checks.database = { status: 'error', message: (error as Error).message.split('\n')[0] };
    }

    try {
      await cacheRedis.ping();
      checks.redis = { status: 'ok' };
    } catch (error) {
      checks.redis = { status: 'error', message: (error as Error).message };
    }

    const healthy = Object.values(checks).every((c) => c.status === 'ok');
    res.status(healthy ? 200 : 503).json({ status: healthy ? 'ok' : 'degraded', timestamp: new Date().toISOString(), checks });
  }),
);

export default router;
