TASK_TYPES = {
    1:  "Deadline",
    2:  "Ad-hoc Troubleshooting",
    3:  "Project Milestone",
    4:  "Routine Meeting",
    5:  "1:1 Check-in",
    6:  "Admin/Operational",
    7:  "Training/Learning",
    8:  "Focus Time",
    9:  "Break/Personal",
    10: "Out of Office",
}

# Keywords per task type — checked against subject + body_preview (lowercased)
KEYWORDS = {
    1: [  # Deadline
        "deadline", "due date", "due by", "submit", "submission",
        "deliver", "delivery", "hand in", "hand-in", "final",
    ],
    2: [  # Ad-hoc Troubleshooting
        "urgent", "asap", "issue", "bug", "fix", "incident",
        "outage", "emergency", "troubleshoot", "hotfix", "critical",
        "production down", "p0", "p1",
    ],
    3: [  # Project Milestone
        "milestone", "launch", "release", "go-live", "go live",
        "phase", "checkpoint", "demo", "presentation", "showcase",
        "sign-off", "sign off", "kickoff", "kick-off", "kick off",
    ],
    4: [  # Routine Meeting
        "standup", "stand-up", "stand up", "meeting", "sync",
        "weekly", "daily", "monthly", "scrum", "retrospective",
        "retro", "sprint", "planning", "review", "discussion",
        "catchup", "catch-up", "catch up", "team call", "all hands",
        "all-hands", "townhall", "town hall",
    ],
    5: [  # 1:1 Check-in
        "1:1", "1-1", "one-on-one", "one on one", "check-in",
        "check in", "checkin", "catch up", "catch-up", "career",
        "mentoring", "mentorship", "coaching",
    ],
    6: [  # Admin/Operational
        "admin", "administrative", "operational", "ops",
        "onboarding", "interview", "hiring", "recruitment",
        "performance review", "annual review", "appraisal",
        "expense", "invoice", "budget", "procurement",
        "compliance", "audit",
    ],
    7: [  # Training/Learning
        "training", "learning", "workshop", "course", "seminar",
        "webinar", "class", "tutorial", "certification", "cert",
        "bootcamp", "hackathon", "conference", "summit", "lecture",
        "knowledge sharing", "knowledge transfer", "lunch and learn",
    ],
    8: [  # Focus Time
        "focus", "deep work", "heads down", "no meeting",
        "blocked", "concentration", "focus time", "maker time",
        "do not disturb", "dnd", "uninterrupted",
    ],
    9: [  # Break/Personal
        "lunch", "break", "coffee", "personal", "gym",
        "doctor", "dentist", "appointment", "errands",
        "birthday", "celebration", "happy hour",
    ],
    10: [  # Out of Office
        "vacation", "leave", "holiday", "sick", "ooo",
        "out of office", "pto", "time off", "annual leave",
        "medical leave", "maternity", "paternity", "public holiday",
    ],
}

MODEL_VERSION = "rule-based-v1.0"
