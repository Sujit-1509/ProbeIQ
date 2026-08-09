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
    conn.execute("CREATE TABLE IF NOT EXISTS interviews (session_id TEXT PRIMARY KEY, candidate_name TEXT NOT NULL, candidate_role TEXT NOT NULL, status TEXT NOT NULL, question_count INTEGER NOT NULL, topic_scores TEXT NOT NULL, feedback TEXT, state TEXT NOT NULL, decision TEXT, reviewer_note TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    columns = {row[1] for row in conn.execute("PRAGMA table_info(interviews)")}
    if "decision" not in columns:
        conn.execute("ALTER TABLE interviews ADD COLUMN decision TEXT")
    if "reviewer_note" not in columns:
        conn.execute("ALTER TABLE interviews ADD COLUMN reviewer_note TEXT")
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
        rows = conn.execute("SELECT session_id,candidate_name,candidate_role,status,question_count,topic_scores,feedback,state,decision,reviewer_note,updated_at FROM interviews ORDER BY updated_at DESC").fetchall()
    return [_history_row(r) for r in rows]

def detail(session_id: str) -> dict | None:
    with _db() as conn:
        row = conn.execute("SELECT session_id,candidate_name,candidate_role,status,question_count,topic_scores,feedback,state,decision,reviewer_note,updated_at FROM interviews WHERE session_id=?", (session_id,)).fetchone()
    return _history_row(row) if row else None

def update_review(session_id: str, decision: str | None, reviewer_note: str | None) -> dict | None:
    with _db() as conn:
        conn.execute("UPDATE interviews SET decision=?, reviewer_note=?, updated_at=CURRENT_TIMESTAMP WHERE session_id=?", (decision, reviewer_note, session_id))
    return detail(session_id)

def _history_row(row: sqlite3.Row) -> dict:
    state = json.loads(row["state"])
    return {"sessionId": row["session_id"], "candidateName": row["candidate_name"], "candidateRole": row["candidate_role"], "status": row["status"], "questionCount": row["question_count"], "topicScores": json.loads(row["topic_scores"]), "feedback": json.loads(row["feedback"]) if row["feedback"] else None, "transcript": state.get("transcript", []), "settings": state.get("settings", {}), "decision": row["decision"], "reviewerNote": row["reviewer_note"], "updatedAt": row["updated_at"]}
