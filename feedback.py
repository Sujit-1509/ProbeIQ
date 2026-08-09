"""
FeedbackGenerator — produces structured end-of-interview feedback via LLM.

Called once after the stop condition fires. Grounds feedback in real signals
(missionsCompleted, missionsFirstTry, commitDays) and transcript evidence.

Includes multi-layer JSON parsing: direct → strip markdown fences → regex extract.
Validates required keys and backfills any missing ones.
Includes Markdown report card renderer.
"""
from __future__ import annotations
import json
import re
import logging
from models import InterviewState
from llm_client import chat

log = logging.getLogger(__name__)

_SYSTEM = (
    "You are a program mentor reviewing a technical interview for an AI engineering cohort. "
    "Be honest, specific, and constructive. Ground every observation in evidence from "
    "the interview transcript. Return only valid JSON — no markdown fences, no explanation."
)

_REQUIRED_KEYS = {"summary", "strengths", "gaps", "next"}

_SAFE_FALLBACK: dict = {
    "summary":   "Interview completed successfully.",
    "strengths": [],
    "gaps":      [],
    "next":      [],
}


def _transcript_text(state: InterviewState) -> str:
    """Format the full transcript for inclusion in the feedback prompt."""
    lines = []
    for t in state["transcript"]:
        speaker = "Interviewer" if t["role"] == "interviewer" else "Candidate"
        day_tag = f" [Day {t['day']}]" if t.get("day") else ""
        lines.append(f"{speaker}{day_tag}: {t['text']}")
    return "\n".join(lines)


def _plan_summary(state: InterviewState) -> str:
    """Format the interview plan with coverage markers for the feedback prompt."""
    lines = []
    for e in state["plan"]:
        covered = "✓" if e["day"] in state["covered_days"] else "–"
        lines.append(f"  {covered} Day {e['day']}: {e['title']} ({e['priority']} priority — {e['reason']})")
    return "\n".join(lines)


def _try_parse_json(raw: str) -> dict | None:
    """
    Multi-layer JSON extraction:
      1. Direct parse
      2. Strip markdown fences then parse
      3. Regex extract the first {...} block
    """
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    stripped = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    match = re.search(r'\{[\s\S]*\}', stripped)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    return None


def _validate_feedback(data: dict) -> dict:
    """Ensure all required keys are present with correct types."""
    for key in _REQUIRED_KEYS:
        if key not in data:
            log.warning("Feedback missing key '%s' — backfilling with default", key)
            data[key] = _SAFE_FALLBACK[key]

    for list_key in ("strengths", "gaps", "next"):
        if not isinstance(data[list_key], list):
            data[list_key] = [str(data[list_key])]

    if not isinstance(data.get("summary"), str):
        data["summary"] = str(data.get("summary", _SAFE_FALLBACK["summary"]))

    return data


def feedback_generator(state: InterviewState) -> dict:
    """Return {summary, strengths, gaps, next} grounded in transcript + signals."""
    member  = state["candidate"]["member"] if "member" in state["candidate"] else state["candidate"]
    signals = state["candidate"].get("signals", {})

    prompt = f"""Candidate: {member.get('name', 'Candidate')}, {member.get('jobRole', 'Engineer')}, {member.get('yearsExperience', 'N/A')} years experience
Cohort signals: {signals.get('missionsCompleted', '?')} missions completed, \
{signals.get('missionsFirstTry', '?')} on first try, \
{signals.get('commitDays', '?')} active commit days

Topics covered in this interview:
{_plan_summary(state)}

Full transcript:
{_transcript_text(state)}

Return a JSON object with exactly these keys:
{{
  "summary":   "2–3 sentence overall assessment",
  "strengths": ["specific strength backed by a transcript moment", ...],
  "gaps":      ["specific gap backed by evidence", ...],
  "next":      ["concrete, actionable recommendation", ...]
}}

Rules:
- strengths: 2–4 items
- gaps: 1–3 items
- next: 2–3 items
- Reference specific days, tools, or candidate quotes where possible.
- Avoid generic advice like "practice more" — be specific to this candidate."""

    raw = chat(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.4,
        max_tokens=1500,
    )

    parsed = _try_parse_json(raw)
    if parsed is not None:
        feedback = _validate_feedback(parsed)
        return _add_scores(feedback, state)

    log.error("Failed to parse LLM feedback response — returning safe fallback. Raw: %s", raw[:200])
    return _add_scores(_SAFE_FALLBACK.copy(), state)


def _add_scores(feedback: dict, state: InterviewState) -> dict:
    scores = state.get("topic_scores") or []
    if scores:
        feedback["topic_scores"] = scores
        feedback["overall_score"] = round(sum(item["score"] for item in scores) / len(scores), 1)
    return feedback


def render_feedback_markdown(feedback: dict, state: InterviewState | None = None) -> str:
    """Render structured feedback dict into a formatted Markdown report card."""
    name = "Candidate"
    role = "AI Engineer"
    exp = "N/A"

    if state and "candidate" in state:
        member = state["candidate"].get("member", state["candidate"])
        name = member.get("name", name)
        role = member.get("jobRole", member.get("role", role))
        exp = str(member.get("yearsExperience", exp))

    summary = feedback.get("summary", "Interview completed.")
    strengths = feedback.get("strengths", [])
    gaps = feedback.get("gaps", [])
    next_steps = feedback.get("next", [])

    lines = [
        "# 🎓 ProbeIQ Technical Mentor Assessment",
        "",
        f"**Candidate:** {name}  ",
        f"**Target Role:** {role} ({exp} yrs experience)  ",
        "**Status:** Interview Completed  ",
        "",
        "---",
        "",
        "### 📊 Overall Summary",
        f"> {summary}",
        "",
        "### 💪 Demonstrated Strengths",
    ]

    for s in strengths:
        lines.append(f"- 🌟 **{s}**")

    lines.extend(["", "### 🎯 Technical Knowledge Gaps"])
    for g in gaps:
        lines.append(f"- ⚠️ **{g}**")

    lines.extend(["", "### 🚀 Actionable Recommendations"])
    for n in next_steps:
        lines.append(f"- 📌 {n}")

    if state and state.get("topic_scores"):
        lines.extend(["", "---", "", "### 📈 Rubric Topic Evaluation"])
        for ts in state["topic_scores"]:
            stars = "⭐" * ts["score"] + "☆" * (5 - ts["score"])
            lines.append(f"- **Day {ts['day']}: {ts['title']}** — {stars} ({ts['score']}/5, {ts['depth_rating']})")

    return "\n".join(lines)
