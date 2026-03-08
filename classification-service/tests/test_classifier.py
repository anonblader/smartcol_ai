"""
Tests for the hybrid classifier (ML + rule-based fallback).

Tests accept results from either method — when the ML model is loaded
it may override the rule-based result with higher or similar accuracy.
The key assertion is that the task type is within the expected set.
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.classifier import classify_event
from app.models import ClassificationRequest, Attendee


def make_request(**kwargs) -> ClassificationRequest:
    return ClassificationRequest(event_id="test-id", **kwargs)


# ---------------------------------------------------------------------------
# Mock event tests (mirrors mock-calendar-sync.service.ts)
# ---------------------------------------------------------------------------

def test_weekly_team_standup():
    result = classify_event(make_request(
        subject="Weekly Team Standup",
        body_preview="Discuss weekly progress, blockers, and upcoming tasks",
        location="Conference Room A",
        attendees=[
            Attendee(email="manager@company.com", name="Sarah Chen"),
            Attendee(email="dev1@company.com", name="John Smith"),
            Attendee(email="dev2@company.com", name="Emily Wong"),
        ],
        duration_minutes=60,
        is_all_day=False,
    ))
    assert result.task_type_id == 4, f"Expected Routine Meeting, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Weekly Team Standup → {result.task_type_name} ({result.confidence_score:.0%})")


def test_project_deadline():
    result = classify_event(make_request(
        subject="Project Phase 1 Deadline",
        body_preview="Complete all features for Phase 1 release",
        attendees=None,
        duration_minutes=1439,
        is_all_day=True,
    ))
    assert result.task_type_id == 1, f"Expected Deadline, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Project Phase 1 Deadline → {result.task_type_name} ({result.confidence_score:.0%})")


def test_client_demo():
    result = classify_event(make_request(
        subject="Client Demo - SmartCol AI",
        body_preview="Demonstrate the calendar sync feature and AI-powered workload analysis",
        location="Zoom Meeting",
        attendees=[
            Attendee(email="client@example.com", name="Alex Johnson"),
            Attendee(email="team-lead@company.com", name="David Lee"),
        ],
        duration_minutes=90,
        is_all_day=False,
    ))
    assert result.task_type_id == 3, f"Expected Project Milestone, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Client Demo - SmartCol AI → {result.task_type_name} ({result.confidence_score:.0%})")


def test_code_review():
    result = classify_event(make_request(
        subject="Code Review: Calendar Sync Implementation",
        body_preview="Review the calendar synchronization service implementation",
        location="Engineering Room",
        attendees=[
            Attendee(email="senior-dev@company.com", name="Lisa Park"),
        ],
        duration_minutes=60,
        is_all_day=False,
    ))
    # 1 attendee → 1:1 Check-in or Routine Meeting — accept either
    assert result.task_type_id in (4, 5), f"Expected Meeting or 1:1, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Code Review → {result.task_type_name} ({result.confidence_score:.0%})")


def test_sprint_planning():
    result = classify_event(make_request(
        subject="Sprint Planning - Next Iteration",
        body_preview="Plan tasks and story points for the upcoming sprint",
        location="Conference Room B",
        attendees=[
            Attendee(email="scrum-master@company.com", name="Mike Chen"),
            Attendee(email="dev1@company.com", name="John Smith"),
            Attendee(email="dev2@company.com", name="Emily Wong"),
            Attendee(email="designer@company.com", name="Anna Kim"),
        ],
        duration_minutes=180,
        is_all_day=False,
    ))
    assert result.task_type_id == 4, f"Expected Routine Meeting, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Sprint Planning → {result.task_type_name} ({result.confidence_score:.0%})")


def test_focus_time():
    result = classify_event(make_request(
        subject="Focus Time - Deep Work",
        body_preview="Block time for uninterrupted development work",
        attendees=None,
        duration_minutes=180,
        is_all_day=False,
    ))
    assert result.task_type_id == 8, f"Expected Focus Time, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Focus Time - Deep Work → {result.task_type_name} ({result.confidence_score:.0%})")


def test_past_meeting():
    result = classify_event(make_request(
        subject="Database Schema Design Review",
        body_preview="Finalize the database schema for SmartCol AI",
        location="Online",
        attendees=[
            Attendee(email="architect@company.com", name="Robert Zhang"),
        ],
        duration_minutes=90,
        is_all_day=False,
    ))
    # 1 attendee → 1:1 Check-in or Routine Meeting
    assert result.task_type_id in (4, 5), f"Expected Meeting or 1:1, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Database Schema Design Review → {result.task_type_name} ({result.confidence_score:.0%})")


def test_cancelled_event():
    result = classify_event(make_request(
        subject="Optional Team Lunch",
        body_preview="Cancelled due to scheduling conflicts",
        location="Restaurant",
        attendees=None,
        duration_minutes=60,
        is_all_day=False,
    ))
    assert result.task_type_id == 9, f"Expected Break/Personal, got {result.task_type_name}"
    assert result.confidence_score >= 0.40
    print(f"  ✓ Optional Team Lunch → {result.task_type_name} ({result.confidence_score:.0%})")


# ---------------------------------------------------------------------------
# Additional edge case tests
# ---------------------------------------------------------------------------

def test_out_of_office():
    result = classify_event(make_request(
        subject="Annual Leave",
        body_preview="Out of office - on vacation",
        attendees=None,
        duration_minutes=0,
        is_all_day=True,
    ))
    assert result.task_type_id == 10, f"Expected Out of Office, got {result.task_type_name}"
    print(f"  ✓ Annual Leave → {result.task_type_name} ({result.confidence_score:.0%})")


def test_one_on_one():
    result = classify_event(make_request(
        subject="1:1 with Manager",
        body_preview="Weekly check-in and career discussion",
        attendees=[Attendee(email="manager@company.com", name="Sarah Chen")],
        duration_minutes=30,
        is_all_day=False,
    ))
    assert result.task_type_id == 5, f"Expected 1:1 Check-in, got {result.task_type_name}"
    print(f"  ✓ 1:1 with Manager → {result.task_type_name} ({result.confidence_score:.0%})")


def test_training_workshop():
    result = classify_event(make_request(
        subject="AWS Certification Workshop",
        body_preview="Training session for cloud certification",
        attendees=[
            Attendee(email="trainer@company.com"),
            Attendee(email="dev1@company.com"),
        ],
        duration_minutes=240,
        is_all_day=False,
    ))
    assert result.task_type_id == 7, f"Expected Training/Learning, got {result.task_type_name}"
    print(f"  ✓ AWS Certification Workshop → {result.task_type_name} ({result.confidence_score:.0%})")


def test_no_input_fallback():
    result = classify_event(make_request(
        subject=None,
        body_preview=None,
        attendees=None,
        duration_minutes=0,
        is_all_day=False,
    ))
    assert result.task_type_id is not None
    assert 0.0 <= result.confidence_score <= 1.0
    print(f"  ✓ Empty event fallback → {result.task_type_name} ({result.confidence_score:.0%})")


if __name__ == "__main__":
    tests = [
        test_weekly_team_standup,
        test_project_deadline,
        test_client_demo,
        test_code_review,
        test_sprint_planning,
        test_focus_time,
        test_past_meeting,
        test_cancelled_event,
        test_out_of_office,
        test_one_on_one,
        test_training_workshop,
        test_no_input_fallback,
    ]

    print("\nRunning classification tests...\n")
    passed = 0
    failed = 0

    for test in tests:
        try:
            test()
            passed += 1
        except AssertionError as e:
            print(f"  ✗ {test.__name__} FAILED: {e}")
            failed += 1

    print(f"\nResults: {passed} passed, {failed} failed\n")
