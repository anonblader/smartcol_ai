/**
 * ML Prediction Routes
 */

import { Router } from 'express';
import {
  runPredictions,
  getWorkloadForecastHandler,
  getBurnoutScoreHandler,
} from '../controllers/ml-prediction.controller';

const router = Router();

// POST /api/ml/predict — run both ML models and persist results
router.post('/predict', runPredictions);

// GET /api/ml/workload-forecast — retrieve stored 5-day forecast
router.get('/workload-forecast', getWorkloadForecastHandler);

// GET /api/ml/burnout-score — retrieve latest burnout score
router.get('/burnout-score', getBurnoutScoreHandler);

export default router;
