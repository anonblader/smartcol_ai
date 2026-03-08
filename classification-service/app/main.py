from contextlib import asynccontextmanager
from fastapi import FastAPI
from .classifier import classify_event
from .models import ClassificationRequest, ClassificationResponse
from .ml_classifier import start_model_loading, model_status


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off ML model loading in background on startup
    start_model_loading()
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
