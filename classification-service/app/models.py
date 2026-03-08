from pydantic import BaseModel
from typing import Optional


class Attendee(BaseModel):
    email: str
    name: Optional[str] = None
    type: Optional[str] = None
    status: Optional[str] = None


class ClassificationRequest(BaseModel):
    event_id: str
    subject: Optional[str] = None
    body_preview: Optional[str] = None
    location: Optional[str] = None
    attendees: Optional[list[Attendee]] = None
    organizer_email: Optional[str] = None
    duration_minutes: Optional[int] = None
    is_all_day: Optional[bool] = False


class ClassificationResponse(BaseModel):
    task_type_id: int
    task_type_name: str
    confidence_score: float
    method: str
    model_version: str
    features: dict
    project_suggestion: Optional[str] = None
