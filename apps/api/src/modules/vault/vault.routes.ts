import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  getVault,
  getItems,
  createItem,
  updateItem,
  deleteItem,
} from './vault.controller';

const router = Router();

// All vault routes are protected — must be logged in
router.use(authenticate);

router.get('/', getVault);
router.get('/items', getItems);
router.post('/items', createItem);
router.put('/items/:id', updateItem);
router.delete('/items/:id', deleteItem);

export default router;
