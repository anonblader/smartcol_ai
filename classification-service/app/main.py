from fastapi import FastAPI
from .classifier import classify_event
from .models import ClassificationRequest, ClassificationResponse

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/classify", response_model=ClassificationResponse)
def classify(request: ClassificationRequest):
    return classify_event(request)