import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { api } from './routes/api';
import { authRoutes } from './routes/auth';
import { rates } from './routes/rates';
import { household } from './routes/household';
import { connections } from './routes/connections';
import { db } from './db';
import { migrateStorageCurrency } from './migrateStorageCurrency';

const app = express();
const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Deployed behind a reverse proxy (Render/Railway/Fly/nginx) — needed so req.secure
// and the "secure" cookie flag reflect the real client protocol, not the proxy hop.
app.set('trust proxy', 1);

app.use(
  helmet({
    // The client is a same-origin SPA served by this same process in production, and it
    // loads Google Fonts — a strict default CSP would block that without extra tuning that's
    // out of scope here, so CSP is left to be configured at the CDN/reverse-proxy layer.
    contentSecurityPolicy: false,
  })
);
app.use(cors({ origin: CLIENT_ORIGIN, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// General ceiling on API traffic per IP, on top of the tighter limiter on auth routes.
// Generous enough not to bother a real user; enough to blunt a scraping/abuse burst.
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 600,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'amana-api' }));
app.use('/api/auth', authRoutes);
app.use('/api/rates', rates);
app.use('/api/household', household);
app.use('/api/connections', connections);
app.use('/api', api);

// Anything else under /api that didn't match is a real 404, not the SPA fallback below.
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

const clientDist = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/(.*)/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log('Serving built frontend from', clientDist);
}

// Centralized error handler — keeps a thrown/rejected error in one route from ever
// leaking a stack trace to the client or crashing the process.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  if (res.headersSent) return;
  res.status(err?.status || 500).json({ error: IS_PROD ? 'Something went wrong' : String(err?.message || err) });
});

const server = app.listen(PORT, () => {
  console.log(`Amana listening on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`);
});

// Best-effort, one-time per user (see migrateStorageCurrency.ts) — runs after the server
// is already accepting traffic so it never delays startup or blocks a deploy.
migrateStorageCurrency().catch((err) => console.error('[migrateStorageCurrency] failed:', err));

// Close the SQLite handle and stop accepting connections cleanly on deploy/restart,
// instead of letting the platform SIGKILL mid-write.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
