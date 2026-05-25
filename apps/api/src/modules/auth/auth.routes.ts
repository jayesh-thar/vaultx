import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  changePassword,
} from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validateEmailDomain } from '../../middleware/emailValidator';
import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
} from '../../middleware/rateLimiter';
import { hibpCheck } from '../../middleware/hibp';

const router = Router();

router.post(
  '/register',
  registerLimiter,
  validateEmailDomain,
  hibpCheck,
  register
);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshLimiter, refresh);
router.put('/change-password', authenticate, changePassword);
router.post('/logout', authenticate, logout);

export default router;
