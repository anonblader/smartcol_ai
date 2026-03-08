"""
Hybrid Classifier

Strategy:
  1. Try ML zero-shot classifier (facebook/bart-large-mnli)
  2. If ML confidence >= 0.50 → use ML result  (method: 'ml_model')
  3. If ML confidence < 0.50  → use rule-based  (method: 'rule_based')
  4. If ML not yet loaded     → use rule-based  (method: 'rule_based')

Both paths return the same ClassificationResponse shape so the backend
integration is unchanged.
"""

from .models import ClassificationRequest, ClassificationResponse
from .config import TASK_TYPES, KEYWORDS, MODEL_VERSION
from .utils import normalize, count_keyword_hits, attendee_count
from .ml_classifier import classify_ml, is_ready, ML_MODEL_VERSION


# ── Rule-based engine (unchanged) ─────────────────────────────────────────────

def _rule_based(request: ClassificationRequest) -> ClassificationResponse:
    subject = normalize(request.subject)
    body    = normalize(request.body_preview)
    text    = f"{subject} {body}"

    num_attendees = attendee_count(request.attendees)
    duration  = request.duration_minutes or 0
    is_all_day = request.is_all_day or False

    scores: dict[int, float] = {tid: 0.0 for tid in TASK_TYPES}

    # Keyword scoring
    for task_type_id, keywords in KEYWORDS.items():
        hits = count_keyword_hits(text, keywords)
        scores[task_type_id] += hits * 10.0

    # Structural heuristics
    if is_all_day and num_attendees == 0:
        scores[10] += 15.0
        scores[1]  += 10.0
    if is_all_day and num_attendees == 0:
        scores[1]  += 8.0
    if num_attendees == 1:
        scores[5]  += 15.0
    if num_attendees >= 3:
        scores[4]  += 10.0
    if num_attendees == 0 and not is_all_day and duration >= 60:
        scores[8]  += 8.0
    if num_attendees == 0 and 0 < duration <= 30:
        scores[9]  += 8.0
    if 0 < duration <= 30 and num_attendees >= 1:
        scores[2]  += 5.0
    if duration >= 120 and num_attendees >= 1:
        scores[7]  += 6.0

    best_id    = max(scores, key=lambda k: scores[k])
    best_score = scores[best_id]

    if best_score == 0:
        best_id    = 4
        best_score = 1.0

    total_score  = sum(scores.values()) or 1.0
    raw_conf     = best_score / total_score
    confidence   = round(min(0.98, max(0.40, raw_conf)), 2)

    # Project suggestion
    project_suggestion = None
    if "smartcol" in text:
        project_suggestion = "SmartCol AI"
    elif "phase" in text or "sprint" in text or "milestone" in text:
        project_suggestion = "Current Sprint"

    features = {
        "subject_length": len(subject),
        "has_body":        bool(body),
        "num_attendees":   num_attendees,
        "duration_minutes": duration,
        "is_all_day":      is_all_day,
        "keyword_hits": {
            TASK_TYPES[tid]: count_keyword_hits(text, KEYWORDS[tid])
            for tid in TASK_TYPES
        },
        "top_scores": {
            TASK_TYPES[tid]: round(scores[tid], 2)
            for tid in sorted(scores, key=lambda k: scores[k], reverse=True)[:3]
        },
    }

    return ClassificationResponse(
        task_type_id=best_id,
        task_type_name=TASK_TYPES[best_id],
        confidence_score=confidence,
        method="rule_based",
        model_version=MODEL_VERSION,
        features=features,
        project_suggestion=project_suggestion,
    )


# ── Hybrid entry point ─────────────────────────────────────────────────────────

def classify_event(request: ClassificationRequest) -> ClassificationResponse:
    """
    Hybrid classifier: ML first, rule-based fallback.
    """
    subject = normalize(request.subject)
    body    = normalize(request.body_preview)
    text    = f"{subject} {body}".strip()

    # ── Step 1: Try ML zero-shot classifier ──────────────────────────────────
    if is_ready() and text:
        ml = classify_ml(text)

        if ml is not None:
            # ML is confident enough — use its result
            task_id = ml["task_type_id"]

            features = {
                "subject_length":   len(subject),
                "has_body":         bool(body),
                "num_attendees":    attendee_count(request.attendees),
                "duration_minutes": request.duration_minutes or 0,
                "is_all_day":       request.is_all_day or False,
                "ml_scores":        ml["all_scores"],
                "ml_top_label":     list(ml["all_scores"].keys())[0] if ml["all_scores"] else "",
            }

            return ClassificationResponse(
                task_type_id=task_id,
                task_type_name=TASK_TYPES[task_id],
                confidence_score=round(min(0.99, ml["confidence"]), 2),
                method="ml_model",
                model_version=ML_MODEL_VERSION,
                features=features,
                project_suggestion=None,
            )

    # ── Step 2: Fall back to rule-based ──────────────────────────────────────
    return _rule_based(request)
