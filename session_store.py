"""
In-memory session store keyed by sessionId.

No persistence — if the process restarts mid-interview, sessions are lost.
Acceptable hackathon tradeoff; swap for Redis/SQLite later if needed.
"""
from __future__ import annotations
from models import InterviewState
import json
import sqlite3
from pathlib import Path

_sessions: dict[str, InterviewState] = {}
_DB_PATH = Path(__file__).with_name("probeiq.db")

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("CREATE TABLE IF NOT EXISTS interviews (session_id TEXT PRIMARY KEY, candidate_name TEXT NOT NULL, candidate_role TEXT NOT NULL, status TEXT NOT NULL, question_count INTEGER NOT NULL, topic_scores TEXT NOT NULL, feedback TEXT, state TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    conn.commit()
    return conn


def get(session_id: str) -> InterviewState | None:
    return _sessions.get(session_id)


def save(state: InterviewState) -> None:
    _sessions[state["session_id"]] = state
    member = state["candidate"].get("member", state["candidate"])
    with _db() as conn:
        conn.execute("""INSERT INTO interviews (session_id,candidate_name,candidate_role,status,question_count,topic_scores,feedback,state,updated_at) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
        ON CONFLICT(session_id) DO UPDATE SET candidate_name=excluded.candidate_name,candidate_role=excluded.candidate_role,status=excluded.status,question_count=excluded.question_count,topic_scores=excluded.topic_scores,feedback=excluded.feedback,state=excluded.state,updated_at=CURRENT_TIMESTAMP""", (state["session_id"], member.get("name", "Candidate"), member.get("jobRole", member.get("role", "Engineer")), state["status"], state["question_count"], json.dumps(state.get("topic_scores") or []), json.dumps(state.get("feedback")) if state.get("feedback") else None, json.dumps({**state, "covered_days": list(state["covered_days"])})))


def exists(session_id: str) -> bool:
    return session_id in _sessions


def delete(session_id: str) -> None:
    _sessions.pop(session_id, None)


def count() -> int:
    return len(_sessions)

def history() -> list[dict]:
    with _db() as conn:
        rows = conn.execute("SELECT session_id,candidate_name,candidate_role,status,question_count,topic_scores,feedback,updated_at FROM interviews ORDER BY updated_at DESC").fetchall()
    return [{"sessionId": r["session_id"], "candidateName": r["candidate_name"], "candidateRole": r["candidate_role"], "status": r["status"], "questionCount": r["question_count"], "topicScores": json.loads(r["topic_scores"]), "feedback": json.loads(r["feedback"]) if r["feedback"] else None, "updatedAt": r["updated_at"]} for r in rows]
