"""
ML classifier tests — ambiguous events where rule-based would fail
but zero-shot ML succeeds.

Run only when ML model is loaded (takes ~30s on first download).
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.classifier import classify_event
from app.models import ClassificationRequest, Attendee
from app.ml_classifier import is_ready

def make_request(**kwargs) -> ClassificationRequest:
    return ClassificationRequest(event_id="ml-test", **kwargs)

# Ambiguous events — no clear rule-based keywords, ML needed
ML_TEST_CASES = [
    # (description, kwargs, expected_task_type_id, acceptable_ids)
    (
        "Visiting family — OOO with no OOO keywords",
        dict(subject="Ariff is away", body_preview="Working from home in Penang visiting family",
             attendees=None, duration_minutes=0, is_all_day=True),
        10, {10, 9}   # Out of Office or Break/Personal
    ),
    (
        "System crashed — troubleshooting without 'urgent/bug' keywords",
        dict(subject="Production system down", body_preview="The platform is not responding, users affected",
             attendees=[Attendee(email="a@b.com")], duration_minutes=60, is_all_day=False),
        2, {2, 4, 5}   # Ad-hoc Troubleshooting, Routine Meeting, or 1:1 (1 attendee ambiguity)
    ),
    (
        "Gym block — personal with no lunch/break keywords",
        dict(subject="Personal time", body_preview="Gym session and errands",
             attendees=None, duration_minutes=90, is_all_day=False),
        9, {9, 8}   # Break/Personal or Focus Time
    ),
    (
        "Shipped to prod — milestone without 'launch/demo' keywords",
        dict(subject="v2.0 goes live today", body_preview="All green, deployment successful",
             attendees=None, duration_minutes=0, is_all_day=True),
        3, {3, 1}   # Project Milestone or Deadline
    ),
    (
        "Career chat — 1:1 without '1:1/check-in' keywords",
        dict(subject="Coffee with manager", body_preview="Discuss growth, promotion, and next quarter goals",
             attendees=[Attendee(email="manager@co.com")], duration_minutes=45, is_all_day=False),
        5, {5, 4}   # 1:1 Check-in or Routine Meeting
    ),
]


def run_ml_tests(load_model: bool = True):
    print("\nRunning ML classifier tests (ambiguous events)...\n")

    if load_model and not is_ready():
        from app.ml_classifier import _load_model_background
        print("  Loading ML model (first run may take a moment)...")
        _load_model_background()   # synchronous for test purposes

    if not is_ready():
        print("  ⚠️  ML model not loaded — running rule-based fallback comparison")
        print("      (failures below show where ML would improve over rule-based)\n")

    passed = failed = 0

    for desc, kwargs, primary_id, acceptable_ids in ML_TEST_CASES:
        result = classify_event(make_request(**kwargs))
        ok = result.task_type_id in acceptable_ids
        symbol = "✓" if ok else "✗"
        ml_tag = f"[{result.method}]"

        if ok:
            passed += 1
            print(f"  {symbol} {desc}")
            print(f"      → {result.task_type_name} ({result.confidence_score:.0%}) {ml_tag}")
        else:
            failed += 1
            print(f"  {symbol} {desc}  FAILED")
            print(f"      Expected task type in {acceptable_ids}, got {result.task_type_id} ({result.task_type_name}) {ml_tag}")

    print(f"\nResults: {passed} passed, {failed} failed")
    print(f"ML model: {'✓ loaded' if is_ready() else '✗ not loaded (rule-based fallback)'}\n")


if __name__ == "__main__":
    run_ml_tests()
