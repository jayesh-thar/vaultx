import rateLimit from 'express-rate-limit';

// Applied globally to all routes in index.ts
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500, // 500 requests per 15 min per IP (plenty for dev+prod)
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Never rate-limit health checks
    return req.path === '/health';
  },
}); // If you don't have a separate globalLimiter, find wherever rateLimit is applied globally in index.ts and increase the max from 100 to 500. The loginLimiter and registerLimiter can stay strict — they protect against brute force. The global limiter was hitting on normal page loads.

// Login — strict, small window, brute force target
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});

// Register — slightly more lenient
export const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many accounts created, please try again later' },
});

// Refresh — happens frequently (every 15min per active user)
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many refresh attempts' },
});
