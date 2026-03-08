from .models import ClassificationRequest, ClassificationResponse
from .config import TASK_TYPES, KEYWORDS, MODEL_VERSION
from .utils import normalize, count_keyword_hits, attendee_count


def classify_event(request: ClassificationRequest) -> ClassificationResponse:
    """
    Rule-based classifier for calendar events.

    Scoring strategy:
    - Keyword hits in subject/body contribute the most weight
    - Structural signals (attendee count, duration, is_all_day) add bonus points
    - The task type with the highest score wins
    - Confidence is derived from how dominant the winning score is
    """

    subject = normalize(request.subject)
    body = normalize(request.body_preview)
    text = f"{subject} {body}"

    num_attendees = attendee_count(request.attendees)
    duration = request.duration_minutes or 0
    is_all_day = request.is_all_day or False

    # -------------------------------------------------------------------------
    # Step 1: Keyword scoring
    # -------------------------------------------------------------------------
    scores: dict[int, float] = {tid: 0.0 for tid in TASK_TYPES}

    for task_type_id, keywords in KEYWORDS.items():
        hits = count_keyword_hits(text, keywords)
        scores[task_type_id] += hits * 10.0

    # -------------------------------------------------------------------------
    # Step 2: Structural heuristics
    # -------------------------------------------------------------------------

    # Out of Office: all-day events with no attendees strongly suggest OOO
    if is_all_day and num_attendees == 0:
        scores[10] += 15.0  # Out of Office
        scores[1] += 10.0   # Also could be a Deadline (all-day)

    # Deadline: all-day events with no attendees are often deadlines
    if is_all_day and num_attendees == 0:
        scores[1] += 8.0

    # 1:1: exactly 2 people (organizer + 1 attendee)
    if num_attendees == 1:
        scores[5] += 15.0  # 1:1 Check-in

    # Routine Meeting: 3+ attendees suggests a group meeting
    if num_attendees >= 3:
        scores[4] += 10.0  # Routine Meeting

    # Focus Time: no attendees, not all-day, not short
    if num_attendees == 0 and not is_all_day and duration >= 60:
        scores[8] += 8.0  # Focus Time

    # Break/Personal: short duration (<= 30 min), no attendees
    if num_attendees == 0 and 0 < duration <= 30:
        scores[9] += 8.0   # Break/Personal

    # Ad-hoc Troubleshooting: short & unplanned feel — boost if short duration
    if 0 < duration <= 30 and num_attendees >= 1:
        scores[2] += 5.0

    # Training/Learning: long events (>= 2 hours) with attendees
    if duration >= 120 and num_attendees >= 1:
        scores[7] += 6.0

    # -------------------------------------------------------------------------
    # Step 3: Pick winner
    # -------------------------------------------------------------------------
    best_id = max(scores, key=lambda k: scores[k])
    best_score = scores[best_id]

    # If everything scored 0, fall back to Routine Meeting as safest default
    if best_score == 0:
        best_id = 4
        best_score = 1.0

    # -------------------------------------------------------------------------
    # Step 4: Confidence calculation
    # -------------------------------------------------------------------------
    total_score = sum(scores.values()) or 1.0
    raw_confidence = best_score / total_score

    # Clamp to a reasonable range [0.4, 0.98] — rule-based is never 100% certain
    confidence = round(min(0.98, max(0.40, raw_confidence)), 2)

    # -------------------------------------------------------------------------
    # Step 5: Project suggestion (simple heuristic)
    # -------------------------------------------------------------------------
    project_suggestion = None
    if "smartcol" in text:
        project_suggestion = "SmartCol AI"
    elif "phase" in text or "sprint" in text or "milestone" in text:
        project_suggestion = "Current Sprint"

    features = {
        "subject_length": len(subject),
        "has_body": bool(body),
        "num_attendees": num_attendees,
        "duration_minutes": duration,
        "is_all_day": is_all_day,
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
