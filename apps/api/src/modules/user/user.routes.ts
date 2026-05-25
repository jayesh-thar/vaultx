import { Router } from 'express';
import { getProfile, updateProfile } from './user.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
export default router;
