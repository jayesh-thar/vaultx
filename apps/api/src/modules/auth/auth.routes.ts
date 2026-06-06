import { Router } from 'express';
import {
  register,
  login,
  refresh,
  logout,
  changePassword,
  prelogin,
  deleteAccount,
  listSessions,
  terminateSession,
  terminateAllOtherSessions,
  forgotPasswordSendOTP,
  forgotPasswordReset,
  cardPinExists,
  setCardPin,
  verifyCardPin,
  resetCardPin,
} from './auth.controller';
import { authenticate } from '../../middleware/authenticate';
import { validateEmailDomain } from '../../middleware/emailValidator';
import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
} from '../../middleware/rateLimiter';
import { hibpCheck } from '../../middleware/hibp';
import { googleAuth, googleCallback, googleSetupComplete } from './auth.google';
import { sendOTP, verifyOTP } from './auth.otp';

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
router.post('/prelogin', prelogin);
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.post('/google/complete', googleSetupComplete);
router.delete('/account', authenticate, deleteAccount);
router.post('/otp/send', authenticate, sendOTP);
router.post('/otp/verify', authenticate, verifyOTP);
router.get('/sessions', authenticate, listSessions);
router.delete('/sessions/:sessionId', authenticate, terminateSession);
router.delete('/sessions', authenticate, terminateAllOtherSessions);
router.post('/forgot-password/send-otp', forgotPasswordSendOTP);
router.post('/forgot-password/reset', forgotPasswordReset);
router.get('/card-pin/exists', authenticate, cardPinExists);
router.post('/card-pin/set', authenticate, setCardPin);
router.post('/card-pin/verify', authenticate, verifyCardPin);
router.delete('/card-pin', authenticate, resetCardPin);

export default router;
