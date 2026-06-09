import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redis = new Redis(process.env.REDIS_URL as string, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy(times) {
    // Wait up to 3 seconds between retries, max 10 retries
    if (times > 10) {
      console.error('[Redis] Max retries reached — giving up');
      return null; // stop retrying
    }
    const delay = Math.min(times * 200, 3000);
    console.log(`[Redis] Retrying connection in ${delay}ms (attempt ${times})`);
    return delay;
  },
  keepAlive: 10000, // send TCP keepalive every 10 seconds to prevent ECONNRESET
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('ready', () => console.log('Redis ready'));
redis.on('error', (err) => {
  // Log but DON'T crash — ECONNRESET is recoverable with retry
  console.error('Redis connection error:', err.message);
});
redis.on('reconnecting', (delay: number) => {
  console.log(`Redis reconnecting in ${delay}ms...`);
});
