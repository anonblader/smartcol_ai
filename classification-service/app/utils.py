from typing import Optional


def normalize(text: Optional[str]) -> str:
    """Lowercase and strip text, return empty string if None."""
    return (text or "").lower().strip()


def count_keyword_hits(text: str, keywords: list[str]) -> int:
    """Count how many keywords appear in the text."""
    return sum(1 for kw in keywords if kw in text)


def attendee_count(attendees: Optional[list]) -> int:
    """Return number of attendees, excluding None."""
    if not attendees:
        return 0
    return len(attendees)
