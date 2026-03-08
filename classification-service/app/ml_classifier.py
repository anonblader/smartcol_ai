"""
ML Classifier — Zero-Shot Classification using HuggingFace Transformers

Uses facebook/bart-large-mnli (NLI-based) to classify calendar events into
10 task types without any task-specific training data.

Zero-shot NLI works by checking whether the event text "entails" each candidate
label. The more descriptive the label phrase, the better the accuracy.
"""

import threading
from typing import Optional
from transformers import pipeline

# ── Configuration ─────────────────────────────────────────────────────────────

MODEL_NAME       = "facebook/bart-large-mnli"
ML_MODEL_VERSION = "bart-large-mnli-v1.0"
CONFIDENCE_THRESHOLD = 0.50   # minimum ML confidence; below this → fall back to rule-based

# ── Label mapping ─────────────────────────────────────────────────────────────
# Descriptive NLI-friendly phrases → task type ID
# NLI checks "does the event text entail this description?"
# More natural language = better zero-shot performance.

CANDIDATE_LABELS: list[str] = [
    "a deadline, submission, or deliverable due date",         # 1
    "an urgent incident, bug fix, or troubleshooting session", # 2
    "a project milestone, product launch, or demo presentation",# 3
    "a routine team meeting, standup, or sync call",           # 4
    "a one-on-one check-in or mentoring session",              # 5
    "an administrative, operational, or onboarding task",      # 6
    "a training session, workshop, or learning event",         # 7
    "a focus block, deep work session, or no-meeting period",  # 8
    "a lunch break, coffee break, or personal appointment",    # 9
    "an out-of-office period, vacation, or sick leave",        # 10
]

LABEL_TO_TASK_TYPE: dict[str, int] = {
    label: task_id
    for task_id, label in enumerate(CANDIDATE_LABELS, start=1)
}

# ── Model state ───────────────────────────────────────────────────────────────

_classifier = None
_model_ready = False
_model_error: Optional[str] = None
_lock = threading.Lock()


def _load_model_background() -> None:
    """Load the model in a background thread so the API starts immediately."""
    global _classifier, _model_ready, _model_error
    try:
        print(f"[ML] Loading {MODEL_NAME} — this may take a moment on first run...")
        clf = pipeline(
            "zero-shot-classification",
            model=MODEL_NAME,
            device=-1,          # CPU; change to 0 for GPU
        )
        with _lock:
            _classifier = clf
            _model_ready = True
        print(f"[ML] {MODEL_NAME} ready ✓")
    except Exception as e:
        _model_error = str(e)
        print(f"[ML] Failed to load model: {e} — falling back to rule-based classifier")


def start_model_loading() -> None:
    """Kick off model loading in the background (call once at startup)."""
    t = threading.Thread(target=_load_model_background, daemon=True)
    t.start()


def is_ready() -> bool:
    return _model_ready


def model_status() -> dict:
    return {
        "ready":   _model_ready,
        "model":   MODEL_NAME,
        "error":   _model_error,
        "version": ML_MODEL_VERSION,
    }


# ── Inference ──────────────────────────────────────────────────────────────────

def classify_ml(text: str) -> Optional[dict]:
    """
    Run zero-shot classification on the event text.

    Returns a dict with:
        task_type_id   (int)
        confidence     (float 0–1)
        all_scores     (dict label → score)
        model_version  (str)

    Returns None if the model isn't loaded yet or confidence is below threshold.
    """
    if not _model_ready or _classifier is None:
        return None

    text = text.strip()
    if not text:
        return None

    try:
        result = _classifier(
            text,
            CANDIDATE_LABELS,
            multi_label=False,
        )

        top_label: str  = result["labels"][0]
        top_score: float = result["scores"][0]

        if top_score < CONFIDENCE_THRESHOLD:
            return None  # too uncertain — let rule-based handle it

        task_type_id = LABEL_TO_TASK_TYPE.get(top_label)
        if task_type_id is None:
            return None

        # Map label → score (result labels are sorted by score, not original order)
        score_map = dict(zip(result["labels"], result["scores"]))

        return {
            "task_type_id":  task_type_id,
            "confidence":    round(top_score, 4),
            "all_scores":    {
                lbl: round(score_map.get(lbl, 0.0), 4)
                for lbl in CANDIDATE_LABELS
            },
            "model_version": ML_MODEL_VERSION,
        }
    except Exception as e:
        print(f"[ML] Inference error: {e}")
        return None
