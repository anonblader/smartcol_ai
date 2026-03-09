import { Router } from 'express';
import {
  getSettings,
  updateSetting,
  testEmail,
} from '../controllers/notification-settings.controller';

const router = Router();

router.get('/settings',  getSettings);
router.post('/settings', updateSetting);
router.post('/test',     testEmail);

export default router;
