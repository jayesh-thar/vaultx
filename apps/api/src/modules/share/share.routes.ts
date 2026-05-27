import { Router } from 'express';
import { create, retrieve } from './share.controller';
import { authenticate } from '../../middleware/authenticate';

const router = Router();
router.post('/', authenticate, create); // auth required to create
router.get('/:id', retrieve); // public to view
export default router;
