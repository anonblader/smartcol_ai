from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI
from .classifier import classify_event
from .models import (
    ClassificationRequest, ClassificationResponse,
    WorkloadPredictionRequest, BurnoutScoringRequest,
)
from .ml_classifier import start_model_loading, model_status
from .workload_predictor import get_workload_predictor
from .burnout_scorer import get_burnout_scorer


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off ML model loading in background on startup
    start_model_loading()
    # Pre-warm workload predictor and burnout scorer (fast, in-process training)
    get_workload_predictor()
    get_burnout_scorer()
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    ml = model_status()
    return {
        "status": "ok",
        "ml_model": {
            "ready":   ml["ready"],
            "model":   ml["model"],
            "version": ml["version"],
            "error":   ml["error"],
        },
        "mode": "hybrid (ml + rule-based)" if ml["ready"] else "rule-based only (ml loading...)",
    }


@app.post("/classify", response_model=ClassificationResponse)
def classify(request: ClassificationRequest):
    return classify_event(request)


# ── Workload Prediction ────────────────────────────────────────────────────────

@app.post("/predict/workload")
def predict_workload(request: WorkloadPredictionRequest):
    """
    Predict daily work minutes for the next 5 working days.
    Accepts historical daily workload data; returns 5-day forecast.
    """
    predictor   = get_workload_predictor()
    predictions = predictor.predict_next_week(
        [d.model_dump() for d in request.historical_daily]
    )
    return {
        "predictions":   predictions,
        "model_version": predictor.MODEL_VERSION,
        "generated_at":  datetime.now(timezone.utc).isoformat(),
    }


# ── Burnout Scoring ────────────────────────────────────────────────────────────

@app.post("/score/burnout")
def score_burnout(request: BurnoutScoringRequest):
    """
    Score user burnout risk (0-100) from weekly workload metrics.
    Accepts 1-4 weeks of data; returns score, level, trend, contributing factors.
    """
    scorer = get_burnout_scorer()
    return scorer.score([w.model_dump() for w in request.weekly_metrics])
