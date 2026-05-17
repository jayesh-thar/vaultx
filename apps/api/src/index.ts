import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { pool } from './db/pool';
import { redis } from './db/redis';
import authRoutes from './modules/auth/auth.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(helmet());
app.use(cors({ origin: 'http://localhost:5173', credentials: true })); // credentials:true = allow cookies
app.use(express.json());
app.use(cookieParser()); // must be before routes that read cookies

app.use('/api/auth', authRoutes);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    await redis.ping();
    res.json({ status: 'ok', db: 'connected', redis: 'connected' });
  } catch {
    res.status(503).json({ status: 'error', message: 'Service unavailable' });
  }
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connected');
    await redis.ping();
    console.log('Redis connected');
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
}

start();
