import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './lib/config';
import { metricsRegistry } from './lib/metrics';
import { requestLogger } from './middleware/requestLogger';
import { metricsMiddleware } from './middleware/metricsMiddleware';
import { sanitizeInput } from './middleware/sanitize';
import { authLimiter } from './middleware/rateLimiter';
import { authenticate } from './middleware/authenticate';
import { requirePermission } from './middleware/requirePermission';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { PERMISSIONS } from './lib/permissions';
import { swaggerSpec } from './config/swagger';
import { bullBoardAdapter } from './config/bull-board';
import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import conversationRoutes from './routes/conversation.routes';
import healthRoutes from './routes/health.routes';
import './events'; // register side-effect listeners

const app = express();
app.set('trust proxy', 1); // correct client IPs behind one proxy (needed for IP rate limits)

// Swagger UI needs inline scripts and styles, so it gets its own, looser CSP.
// Mounted before the strict global helmet() so the global CSP doesn't override it.
app.use(
  '/api-docs',
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
      },
    },
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec),
);
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));

// === Security headers + CORS ===
// A JSON API serves no HTML, so the CSP can deny almost everything.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      // No Origin header = curl, mobile apps, server-to-server: allowed.
      if (!origin || origin === config.FRONTEND_URL) return callback(null, true);
      callback(null, false); // browser blocks the response; no 500 for the server
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-Id'],
    exposedHeaders: ['X-Correlation-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 86400,
  }),
);

// === Parsing, observability, sanitisation ===
app.use(express.json({ limit: '2mb' }));
app.use(requestLogger);
app.use(metricsMiddleware);
app.use(sanitizeInput);

// === Operational endpoints ===
app.use(healthRoutes);
app.get('/metrics', async (_req, res) => {
  res.set('Content-Type', metricsRegistry.contentType);
  res.send(await metricsRegistry.metrics());
});
app.use('/admin/queues', authenticate, requirePermission(PERMISSIONS.ADMIN_QUEUES), bullBoardAdapter.getRouter());

// === API v1 ===
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/conversations', conversationRoutes);

// === Errors (always last) ===
app.use(notFoundHandler);
app.use(errorHandler);

export { app };
