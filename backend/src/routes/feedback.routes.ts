import { Router } from 'express';
import { correct, stats, events } from '../controllers/feedback.controller';

const router = Router();

router.post('/correct', correct);   // Submit a correction
router.get('/stats',   stats);      // Feedback statistics
router.get('/events',  events);     // Classified events list

export default router;
