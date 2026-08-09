"""
ProbeIQ — AI Interview Agent
FastAPI app + single /api/interview endpoint.

Turn 1:  POST { sessionId, candidate }  → { reply, done: false }
Turn 2+: POST { sessionId, message }    → { reply, done: false }
Final:   POST { sessionId, message }    → { reply, done: true, feedback: {...} }
"""
from __future__ import annotations
import json
from functools import lru_cache
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import session_store
from models import InterviewState
from planner import build_plan
from progress import is_done, get_current_plan_entry
from interviewer import interviewer_agent, should_followup, score_turn_response
from feedback import feedback_generator

app = FastAPI(title="ProbeIQ — AI Interview Agent", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


# ── Request / Response models ─────────────────────────────────────────────────

class InterviewRequest(BaseModel):
    sessionId: str
    candidate: Optional[dict] = None   # required on turn 1 only
    message:   Optional[str]  = None   # required on turn 2+ only
    settings:  Optional[dict] = None
    action:    Optional[str]  = None

class ReviewRequest(BaseModel):
    decision: Optional[str] = None
    reviewerNote: Optional[str] = None


class InterviewResponse(BaseModel):
    reply:    str
    done:     bool
    feedback: Optional[dict] = None    # present only when done=true


# ── Route ─────────────────────────────────────────────────────────────────────

@app.post("/api/interview", response_model=InterviewResponse)
def interview(req: InterviewRequest):

    # ── Turn 1: start a new session ──────────────────────────────────────────
    if req.candidate is not None:
        plan = build_plan(req.candidate)
        state: InterviewState = {
            "session_id":    req.sessionId,
            "candidate":     req.candidate,
            "plan":          plan,
            "covered_days":  set(),
            "transcript":    [],
            "question_count": 0,
            "status":        "IN_PROGRESS",
            "topic_scores":  [],
            "feedback":       None,
            "settings":       req.settings or {},
        }
        session_store.save(state)

        opening = interviewer_agent(state)

        # Log opening message to transcript
        first_entry = get_current_plan_entry(state)
        state["transcript"].append({
            "role": "interviewer",
            "text": opening,
            "day":  first_entry["day"] if first_entry else None,
        })
        state["question_count"] += 1
        session_store.save(state)

        return InterviewResponse(reply=opening, done=False)

    # ── Turn 2+: continue an existing session ────────────────────────────────
    if req.action == "skip":
        state = session_store.get(req.sessionId)
        if state is None:
            raise HTTPException(status_code=404, detail=f"Session '{req.sessionId}' not found.")
        active = get_current_plan_entry(state)
        if active:
            state["covered_days"].add(active["day"])
        next_entry = get_current_plan_entry(state)
        reply = interviewer_agent(state, target_entry=next_entry)
        state["transcript"].append({"role": "interviewer", "text": reply, "day": next_entry["day"] if next_entry else None})
        state["question_count"] += 1
        session_store.save(state)
        return InterviewResponse(reply=reply, done=False)

    if not req.message:
        raise HTTPException(
            status_code=400,
            detail="Provide 'candidate' for turn 1, or 'message' for turn 2+.",
        )

    state = session_store.get(req.sessionId)
    if state is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{req.sessionId}' not found. Send 'candidate' to start.",
        )
    if state["status"] == "DONE":
        raise HTTPException(status_code=400, detail="This interview is already completed.")

    # Append candidate's reply
    state["transcript"].append({"role": "candidate", "text": req.message, "day": None})

    # Decide follow-up on active topic vs advance to next topic
    do_followup, active_entry, active_day = should_followup(state, req.message)

    # Real-time topic score evaluation
    if active_entry:
        score_data = score_turn_response(active_entry, req.message)
        if "topic_scores" not in state or state["topic_scores"] is None:
            state["topic_scores"] = []
        state["topic_scores"].append(score_data)

    # Mark active day as covered only when NOT following up on it anymore
    if not do_followup and active_day is not None:
        state["covered_days"].add(active_day)

    # ── Stop condition check ──────────────────────────────────────────────────
    if is_done(state):
        state["status"] = "DONE"
        fb = feedback_generator(state)
        state["feedback"] = fb
        session_store.save(state)
        return InterviewResponse(
            reply="Thank you — that's the end of our interview. I'll put together your feedback now.",
            done=True,
            feedback=fb,
        )

    # ── Next question / follow-up ─────────────────────────────────────────────
    target_entry = active_entry if do_followup else get_current_plan_entry(state)
    next_question = interviewer_agent(
        state,
        target_entry=target_entry,
        is_followup=do_followup,
    )
    state["transcript"].append({
        "role": "interviewer",
        "text": next_question,
        "day":  target_entry["day"] if target_entry else None,
    })
    state["question_count"] += 1
    session_store.save(state)

    return InterviewResponse(reply=next_question, done=False)


# ── Candidates endpoint ───────────────────────────────────────────────────────

@app.get("/api/candidates")
def get_candidates():
    """Return all candidates from candidates.json for frontend picker."""
    return _load_candidates()


@lru_cache(maxsize=1)
def _load_candidates() -> list[dict]:
    candidates_path = Path("candidates.json")
    if not candidates_path.exists():
        raise HTTPException(status_code=500, detail="candidates.json not found")
    with open(candidates_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("candidates", [])


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "sessions": session_store.count()}

@app.get("/api/interviews")
def get_interview_history():
    return session_store.history()

@app.get("/api/interviews/{session_id}")
def get_interview(session_id: str):
    record = session_store.detail(session_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Interview not found")
    return record

@app.patch("/api/interviews/{session_id}/review")
def review_interview(session_id: str, review: ReviewRequest):
    record = session_store.update_review(session_id, review.decision, review.reviewerNote)
    if record is None:
        raise HTTPException(status_code=404, detail="Interview not found")
    return record


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
