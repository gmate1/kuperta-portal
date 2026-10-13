import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { pool } from './db.js';
import { requireAuth, notFound, errorHandler } from './middleware/index.js';
import authRoutes from './routes/auth.js';
import clientRoutes from './routes/clients.js';
import serviceRoutes from './routes/services.js';
import quoteRoutes from './routes/quotes.js';
import expenseRoutes from './routes/expenses.js';
import dashboardRoutes from './routes/dashboard.js';

export function createApp() {
  const app = express();

  // Reverse proxy (nginx) mögött a valódi kliens IP-hez (rate limit, audit)
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet()); // biztonsági fejlécek: CSP, HSTS, X-Frame-Options stb.
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '200kb' })); // nagy payload alapú DoS ellen
  app.use(cookieParser());

  // Általános API rate limit
  app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

  app.get('/api/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'db_unavailable' });
    }
  });

  app.use('/api/auth', authRoutes);
  // Minden más végpont bejelentkezéshez kötött
  app.use('/api/clients', requireAuth, clientRoutes);
  app.use('/api/services', requireAuth, serviceRoutes);
  app.use('/api/quotes', requireAuth, quoteRoutes);
  app.use('/api/expenses', requireAuth, expenseRoutes);
  app.use('/api/dashboard', requireAuth, dashboardRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
