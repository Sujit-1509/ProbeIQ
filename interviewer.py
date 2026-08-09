"""
InterviewerAgent — generates next interview question or follow-up via LLM.

Features:
  1. Persona & Depth Adaptation based on candidate seniority (Junior, Mid, Senior)
  2. Keyword-aware Thin-answer Heuristic
  3. Soft Framing for Skipped Missions
  4. Real-time Rubric & Turn Scoring (1-5 scale)
  5. Memory Compression for long transcripts (>6 turns)
"""
from __future__ import annotations
import re
from models import InterviewState, PlanEntry, TopicScore
from progress import get_current_plan_entry
from llm_client import chat

_SYSTEM = (
    "You are Alex, a senior technical interviewer with 10 years of experience conducting interviews for AI engineering programs. "
    "Your style: warm but technically rigorous, genuinely curious, excellent active listener who builds on what candidates say. "
    "\n\n"
    "Core principles:\n"
    "- ALWAYS acknowledge what the candidate just said before moving forward\n"
    "- Use natural conversational connectors: 'That's interesting...', 'I see...', 'Building on that...', 'Tell me more about...'\n"
    "- Ask ONE focused question at a time, but make it feel like a conversation, not an interrogation\n"
    "- Vary your question types naturally: open-ended exploration, specific probes, trade-off questions, 'walk me through' requests\n"
    "- When appropriate, briefly share context or observations before asking\n"
    "- Show genuine interest in understanding their experience and thought process\n"
    "- Be encouraging and professional — never adversarial or robotic"
)

_THIN_ANSWER_WORDS = 25
_MAX_FOLLOWUPS_PER_DAY = 2


def _get_candidate_info(candidate_obj: dict) -> tuple[str, str, str | int]:
    """Extract name, jobRole, and yearsExperience safely from raw candidate object."""
    member = candidate_obj.get("member", candidate_obj)
    name = member.get("name", "Candidate")
    role = member.get("jobRole", member.get("role", "Engineer"))
    exp = member.get("yearsExperience", "N/A")
    return name, role, exp


def _get_persona_guidance(candidate_info: tuple[str, str, str | int]) -> str:
    """Return persona and question depth instructions based on candidate experience level."""
    _, role, exp = candidate_info
    try:
        years = int(exp)
    except (ValueError, TypeError):
        years = 3

    if years >= 6:
        return (
            f"Persona Mode: Senior Expert Interviewer. Target Role: {role} ({years} yrs exp).\n"
            "Question depth: Probe for system design trade-offs, architecture scalability, failure modes, and production edge cases. "
            "Ask about technical decisions, alternatives considered, and lessons learned from building at scale. "
            "Expect detailed answers with architectural reasoning."
        )
    elif years >= 3:
        return (
            f"Persona Mode: Mid-level Practitioner Interviewer. Target Role: {role} ({years} yrs exp).\n"
            "Question depth: Focus on implementation details, framework/API choices, design patterns, debugging experience. "
            "Ask about specific code decisions, testing approaches, and how they solved concrete problems. "
            "Balance conceptual understanding with hands-on execution."
        )
    else:
        return (
            f"Persona Mode: Encouraging Mentor Interviewer. Target Role: {role} ({years} yrs exp).\n"
            "Question depth: Focus on conceptual clarity, foundational tool usage, step-by-step reasoning. "
            "Use supportive tone, celebrate learning moments, guide through thought process. "
            "Ask 'how did you learn' and 'what made sense' questions. Keep explanations accessible."
        )


def score_turn_response(entry: PlanEntry, candidate_text: str) -> TopicScore:
    """Evaluate candidate response quality on a 1-5 rubric scale for real-time tracking."""
    words = candidate_text.split()
    word_count = len(words)
    keywords = _extract_keywords(entry)
    hits = sum(1 for kw in keywords if kw in candidate_text.lower()) if keywords else 0

    if word_count < 8:
        score = 1
        rating = "shallow"
    elif (hits >= 2 and word_count >= 10) or word_count >= 40:
        score = 5
        rating = "deep"
    elif hits >= 1 or word_count >= 25:
        score = 4
        rating = "adequate"
    elif word_count >= 15:
        score = 3
        rating = "adequate"
    else:
        score = 2
        rating = "shallow"

    return {
        "day": entry["day"],
        "title": entry["title"],
        "score": score,
        "depth_rating": rating,
    }


def _last_candidate_answer(state: InterviewState) -> str:
    """Return the most recent candidate message text."""
    for turn in reversed(state["transcript"]):
        if turn["role"] == "candidate":
            return turn["text"]
    return ""


def _recent_transcript_text(state: InterviewState, max_turns: int = 5) -> str:
    """
    Format transcript history with memory compression.
    If transcript is long (> 6 turns), compresses older turns into a summary header.
    """
    transcript = state["transcript"]
    if not transcript:
        return ""

    if len(transcript) <= max_turns + 2:
        lines = []
        for t in transcript[-max_turns:]:
            speaker = "Interviewer" if t["role"] == "interviewer" else "Candidate"
            day_tag = f" [Day {t['day']}]" if t.get("day") else ""
            lines.append(f"{speaker}{day_tag}: {t['text']}")
        return "\n".join(lines)

    older_turns = transcript[:-max_turns]
    recent_turns = transcript[-max_turns:]

    covered_topics = set()
    for t in older_turns:
        if t.get("day"):
            covered_topics.add(str(t["day"]))

    compressed_header = (
        f"[Memory Summary of Turns 1..{len(older_turns)}: "
        f"Already covered Days {', '.join(sorted(covered_topics)) if covered_topics else 'initial topics'}]"
    )

    lines = [compressed_header]
    for t in recent_turns:
        speaker = "Interviewer" if t["role"] == "interviewer" else "Candidate"
        day_tag = f" [Day {t['day']}]" if t.get("day") else ""
        lines.append(f"{speaker}{day_tag}: {t['text']}")

    return "\n".join(lines)


def _followups_on_current_day(state: InterviewState, day: int | None) -> int:
    """Count how many follow-ups have been asked on this day so far."""
    if day is None:
        return 0
    count = 0
    for t in reversed(state["transcript"]):
        if t["role"] == "interviewer" and t.get("day") == day:
            count += 1
        elif t["role"] == "interviewer":
            break
    return max(0, count - 1)


def _extract_keywords(entry: PlanEntry) -> set[str]:
    """Extract keywords from a plan entry's objectives and tools."""
    keywords: set[str] = set()
    for tool in entry.get("tools", []):
        keywords.add(tool.lower())
        for word in tool.lower().split():
            if len(word) > 3:
                keywords.add(word)
    for obj in entry.get("objectives", []):
        for word in re.findall(r'[a-zA-Z]+', obj.lower()):
            if len(word) >= 4:
                keywords.add(word)
    return keywords


# Words that indicate a candidate IS engaged despite using an 'unknown' phrase
_POSITIVE_CONTEXT_WORDS = {
    "but", "however", "although", "studied", "understand",
    "know", "learned", "tried", "worked", "built", "used",
    "implemented", "explored", "covered", "read",
}


def _is_explicit_unknown(text: str) -> bool:
    """
    Check if candidate genuinely says they don't know / didn't do a topic.

    Guards against false positives like:
      'I dont know the exact params but I tuned them carefully'
    by requiring no positive context words alongside the unknown phrase.
    """
    lower = text.lower().strip()
    word_set = set(re.findall(r'[a-z]+', lower))
    unknown_phrases = [
        "i don't know", "i dont know", "not sure", "no idea",
        "didn't do", "didnt do", "haven't done", "havent done",
        "i don't", "i dont", "don't remember", "dont remember",
    ]
    has_unknown = any(phrase in lower for phrase in unknown_phrases)
    if not has_unknown:
        return False
    # Long answers with positive context are NOT truly unknown
    words = text.split()
    has_positive_context = bool(word_set & _POSITIVE_CONTEXT_WORDS)
    return len(words) < 12 or not has_positive_context


def _is_thin(text: str, entry: PlanEntry) -> bool:
    """Determine if candidate answer is too thin to move on."""
    words = text.split()
    word_count = len(words)

    # Explicit "I don't know" should NOT trigger follow-up
    if _is_explicit_unknown(text):
        return False

    if word_count < 8:
        return True
    if word_count >= 50:
        return False

    keywords = _extract_keywords(entry)
    if keywords:
        answer_lower = text.lower()
        hits = sum(1 for kw in keywords if kw in answer_lower)
        # Any keyword engagement with >=10 words = substantive, not thin
        if hits >= 1 and word_count >= 10:
            return False
        # Strong keyword coverage (3+) even with very short answers = not thin
        if hits >= 3:
            return False
        # No keyword engagement AND under 35 words = thin
        if hits == 0 and word_count < 35:
            return True

    return word_count < _THIN_ANSWER_WORDS


def _is_skipped_topic(entry: PlanEntry) -> bool:
    """Check if this plan entry is for a mission the candidate skipped."""
    reason = entry.get("reason", "").lower()
    return "skipped" in reason


def should_followup(
    state: InterviewState, last_message: str
) -> tuple[bool, PlanEntry | None, int | None]:
    """
    Decide whether to ask a follow-up on current active topic or advance.
    Returns (do_followup, active_entry, active_day).
    """
    last_interviewer_turn = next(
        (t for t in reversed(state["transcript"]) if t["role"] == "interviewer"),
        None,
    )
    active_day = last_interviewer_turn.get("day") if last_interviewer_turn else None
    if active_day is None:
        return False, None, None

    active_entry = next((e for e in state["plan"] if e["day"] == active_day), None)
    if not active_entry:
        return False, None, active_day

    # If candidate explicitly says "I don't know" or similar, move on immediately
    if _is_explicit_unknown(last_message):
        return False, active_entry, active_day

    followups_done = _followups_on_current_day(state, active_day)
    is_thin_answer = _is_thin(last_message, active_entry)

    do_followup = is_thin_answer and followups_done < _MAX_FOLLOWUPS_PER_DAY
    return do_followup, active_entry, active_day


# ── Prompt builders ──────────────────────────────────────────────────────────

def interviewer_agent(
    state: InterviewState,
    target_entry: PlanEntry | None = None,
    is_followup: bool = False,
) -> str:
    """Return next interviewer message (opening or question/follow-up)."""
    is_opening = len(state["transcript"]) == 0

    if is_opening:
        entry = target_entry or get_current_plan_entry(state)
        if not entry:
            return "Thank you — we've covered all the topics. Let me put together your feedback."
        candidate_info = _get_candidate_info(state["candidate"])
        prompt = _opening_prompt(candidate_info, entry)
    else:
        if target_entry is not None:
            entry = target_entry
            do_followup = is_followup
        else:
            last_answer = _last_candidate_answer(state)
            do_followup, active_entry, _ = should_followup(state, last_answer)
            entry = active_entry if do_followup else get_current_plan_entry(state)

        if not entry:
            return "Thank you — we've covered all the topics. Let me put together your feedback."

        candidate_info = _get_candidate_info(state["candidate"])
        prompt = _question_prompt(candidate_info, entry, state, do_followup)

    # Use higher temperature for more natural, varied responses
    return chat(
        [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}],
        temperature=0.85,
        max_tokens=1024
    )


def _opening_prompt(candidate_info: tuple[str, str, str | int], entry: PlanEntry) -> str:
    """Build prompt for the opening turn with persona guidance."""
    name, role, exp = candidate_info
    persona = _get_persona_guidance(candidate_info)
    skipped_note = ""
    if _is_skipped_topic(entry):
        skipped_note = (
            "\nNote: The candidate skipped this mission. Frame your question gently — "
            "ask if they explored this topic at all, without assuming they completed it."
        )

    return f"""Candidate: {name}, {exp} years experience, role: {role}
{persona}

CONVERSATION STYLE EXAMPLES:

Example Opening 1 (Senior):
"Hi Sarah! Thanks for joining me today. I've been looking forward to this conversation — I can see from your profile you've been working with AI systems for quite a while now. Let's dive into your recent experience with the program. I noticed you worked through embeddings and vector databases early on — can you walk me through how you approached building your first retrieval system?"

Example Opening 2 (Junior):
"Hey Alex! Great to meet you. I'm excited to hear about your journey through the AI program so far. I know you're relatively new to this space, so I'm really interested in understanding how you're thinking about these concepts. Let's start with embeddings — when you first encountered that topic, what clicked for you, and what felt challenging?"

YOUR TASK:
Open the interview with a warm, personalized greeting (1-2 sentences that acknowledge their background), then naturally transition into your first question.

First topic — Day {entry['day']}: {entry['title']}
Objectives: {', '.join(entry['objectives'][:3])}
Tools mentioned: {', '.join(entry['tools'][:4])}
Context: {entry['reason']}{skipped_note}

Return ONLY your opening message (greeting + first question). Make it conversational and natural."""


def _question_prompt(
    candidate_info: tuple[str, str, str | int],
    entry: PlanEntry,
    state: InterviewState,
    follow_up: bool,
) -> str:
    """Build prompt for turn 2+ with persona guidance and memory compression."""
    name, role, _ = candidate_info
    persona = _get_persona_guidance(candidate_info)

    if follow_up:
        action = (
            "The candidate's last answer was brief or surface-level. Ask a natural follow-up that digs deeper into the SAME topic. "
            "\n\nFollow-up style examples:\n"
            "- 'That makes sense — can you walk me through a specific example of how you used [tool/concept]?'\n"
            "- 'Interesting. What trade-offs did you consider when you made that choice?'\n"
            "- 'I see. Tell me more about [specific thing they mentioned] — how did that work out?'\n"
            "- 'Building on that, what challenges did you run into with [aspect of their answer]?'\n"
            "\nAcknowledge their previous answer, then probe deeper naturally. Reference something specific they said."
        )
    else:
        # Check if we're moving away from a topic the candidate didn't know about
        last_answer = _last_candidate_answer(state)
        graceful_pivot = ""
        if _is_explicit_unknown(last_answer):
            graceful_pivot = (
                "\n\nIMPORTANT: The candidate indicated they don't know about or didn't work on the previous topic. "
                "Acknowledge this gracefully and move on WITHOUT dwelling on it. Examples:\n"
                "- 'No problem — let's move to something else. [new topic question]'\n"
                "- 'That's okay! Let me shift to [new topic]. [question]'\n"
                "- 'Got it. Let's talk about [new topic] instead. [question]'\n"
                "\nDo NOT explain why you're moving on, just transition smoothly."
            )

        transition = f"Move to the next topic — Day {entry['day']}: {entry['title']}.{graceful_pivot}"
        if _is_skipped_topic(entry):
            transition += (
                "\n\nThe candidate skipped this mission. Transition gently:\n"
                "- 'Let's shift to [topic] — did you get a chance to explore this area at all?'\n"
                "- 'Moving on to [topic] — I know not everyone gets to every mission. How familiar are you with...?'"
            )
        else:
            transition += (
                "\n\nTransition naturally. Examples:\n"
                "- 'That's helpful context. Let's talk about [new topic] now — [question]?'\n"
                "- 'Great. Building on that foundation, I'm curious about your work with [new topic]. [question]?'\n"
                "- 'I see. Shifting gears a bit — [acknowledge their work], now let's explore [new topic]. [question]?'"
            )
        action = transition

    last_answer = _last_candidate_answer(state)
    last_answer_preview = last_answer[:200] + "..." if len(last_answer) > 200 else last_answer

    return f"""Candidate: {name}, {role}
{persona}

Current topic — Day {entry['day']}: {entry['title']}
Objectives: {', '.join(entry['objectives'][:3])}
Tools mentioned: {', '.join(entry['tools'][:4])}
Context: {entry['reason']}

Recent conversation:
{_recent_transcript_text(state)}

Candidate's most recent answer:
"{last_answer_preview}"

Task: {action}

Return ONLY your next question/response. Be conversational and natural — acknowledge what they said, then continue."""
