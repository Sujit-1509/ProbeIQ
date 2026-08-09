from __future__ import annotations
from typing import TypedDict, Literal, Optional


class PlanEntry(TypedDict):
    day: int
    title: str
    objectives: list[str]
    tools: list[str]
    reason: str
    priority: Literal["high", "medium", "low"]


class TranscriptTurn(TypedDict):
    role: Literal["interviewer", "candidate"]
    text: str
    day: Optional[int]  # set for interviewer turns that open a new topic


class TopicScore(TypedDict):
    day: int
    title: str
    score: int  # 1 to 5
    depth_rating: str  # "shallow" | "adequate" | "deep"


class InterviewState(TypedDict):
    session_id: str
    candidate: dict
    plan: list[PlanEntry]
    covered_days: set[int]
    transcript: list[TranscriptTurn]
    question_count: int
    status: Literal["IN_PROGRESS", "DONE"]
    topic_scores: Optional[list[TopicScore]]
    feedback: Optional[dict]
