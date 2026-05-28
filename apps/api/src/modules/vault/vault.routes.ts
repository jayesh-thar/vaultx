import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import {
  getVault,
  getItems,
  createItem,
  updateItem,
  deleteItem,
} from './vault.controller';
import { sendEmail } from '../../utils/mailer';
import { breachAlertEmail } from '../../utils/emailTemplates';
import { pool } from '../../db/pool';

const router = Router();

// All vault routes are protected — must be logged in
router.use(authenticate);

router.get('/', getVault);
router.get('/items', getItems);
router.post('/items', createItem);
router.put('/items/:id', updateItem);
router.delete('/items/:id', deleteItem);
router.post('/breach-alert', authenticate, async (req, res) => {
  try {
    const userRow = await pool.query(
      'SELECT email, display_name FROM users WHERE id = $1',
      [req.user!.userId]
    );
    if (userRow.rows.length === 0) {
      res.json({ ok: true });
      return;
    }
    const { email, display_name } = userRow.rows[0];
    await sendEmail({
      to: email,
      subject: '⚠ Password breach detected — VaultX',
      html: breachAlertEmail(
        display_name ?? email.split('@')[0],
        email,
        req.body.sites ?? []
      ),
    });
    res.json({ ok: true });
  } catch {
    res.json({ ok: true }); // never fail on email
  }
});

export default router;
