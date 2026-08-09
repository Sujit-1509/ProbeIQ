"""
LLM client wrapper — single swap point with multi-provider fallback.
All LLM calls in the project go through chat() here.

Fallback sequence:
  1. Primary LLM (OpenRouter API using OPENROUTER_API_KEY)
  2. Local LLM / Ollama (OpenAI-compatible server at OLLAMA_BASE_URL, default http://localhost:11434/v1)
  3. Offline Mock Fallback (Guarantees zero crashes during live demos if network/API key fails)
"""
from __future__ import annotations
import os
import time
import logging
import re
from openai import OpenAI, APITimeoutError, APIConnectionError, RateLimitError, APIError
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

_openrouter_client: OpenAI | None = None
_ollama_client: OpenAI | None = None

# Default timeouts and retries
_TIMEOUT = 30
_MAX_RETRIES = 1
_RETRY_DELAY = 2


def _get_openrouter_client() -> OpenAI | None:
    """Return initialized OpenRouter client if API key is present."""
    global _openrouter_client
    if _openrouter_client is None:
        api_key = os.environ.get("OPENROUTER_API_KEY")
        if api_key and not api_key.startswith("sk-placeholder"):
            try:
                _openrouter_client = OpenAI(
                    base_url="https://openrouter.ai/api/v1",
                    api_key=api_key,
                    timeout=_TIMEOUT
                )
            except Exception as e:
                log.warning("Failed to initialize OpenRouter client: %s", e)
    return _openrouter_client


def _get_ollama_client() -> OpenAI | None:
    """Return OpenAI client pointed to local Ollama server if available."""
    global _ollama_client
    if _ollama_client is None:
        base_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/v1")
        try:
            import httpx
            http_client = httpx.Client(timeout=10.0)
            _ollama_client = OpenAI(base_url=base_url, api_key="ollama", http_client=http_client)
        except Exception as e:
            log.debug("Ollama client initialization skipped: %s", e)
    return _ollama_client


def _mock_fallback_response(messages: list[dict]) -> str:
    """Generate a realistic mock response if all LLM providers fail."""
    last_user_msg = ""
    for m in reversed(messages):
        if m.get("role") == "user":
            last_user_msg = m.get("content", "")
            break

    log.warning("Using offline mock fallback response for turn.")
    if "Return a JSON object" in last_user_msg or "exactly these keys" in last_user_msg:
        return '{"summary": "Candidate demonstrated solid foundations across technical topics.", "strengths": ["Clear communication on core tools", "Understands basic workflow patterns"], "gaps": ["Could elaborate more on edge-case trade-offs"], "next": ["Practice deeper system architecture scenarios"]}'

    candidate = re.search(r"Candidate:\s*([^,\n]+).*?role:\s*([^\n]+)", last_user_msg)
    name = candidate.group(1).strip() if candidate else "there"
    topic = re.search(r"(?:First topic|Next topic|Current topic).*?Day\s+(\d+):\s*([^\n]+)", last_user_msg, re.I)
    topic_name = topic.group(2).strip() if topic else "this topic"
    if "Follow-up" in last_user_msg or "follow-up" in last_user_msg:
        return f"Thanks, {name}. Staying with {topic_name}, what was the hardest issue you encountered and how did you validate your solution?"
    if "previous topic" in last_user_msg and ("move on" in last_user_msg or "indicated" in last_user_msg):
        return f"No problem, {name}. Let's move on to {topic_name}: what did you build, and what would you improve in a second iteration?"
    return f"Thanks, {name}. For {topic_name}, can you describe the concrete implementation, one trade-off you made, and how you tested it?"


def chat(
    messages: list[dict],
    temperature: float = 0.7,
    max_tokens: int = 1024,
) -> str:
    """
    Send a list of {role, content} messages to LLM and return reply text.

    Tries Primary OpenRouter → Local Ollama → Offline Mock Fallback.
    """
    # ── 1. Try Primary OpenRouter ────────────────────────────────────────────────
    primary_client = _get_openrouter_client()
    if primary_client is not None:
        model = os.environ.get("LLM_MODEL", "openai/gpt-4o-mini")
        for attempt in range(_MAX_RETRIES + 1):
            try:
                response = primary_client.chat.completions.create(
                    model=model,
                    messages=messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                )
                content = response.choices[0].message.content
                if content:
                    log.info(f"LLM response received ({len(content)} chars, model={model})")
                    return content.strip()
            except (APITimeoutError, APIConnectionError, RateLimitError, APIError) as e:
                log.warning("Primary LLM attempt %d/%d failed: %s", attempt + 1, _MAX_RETRIES + 1, e)
                if attempt < _MAX_RETRIES:
                    time.sleep(_RETRY_DELAY)

    # ── 2. Fallback to Local Ollama ──────────────────────────────────────────
    ollama_client = _get_ollama_client()
    if ollama_client is not None:
        ollama_model = os.environ.get("OLLAMA_MODEL", "qwen2.5-coder")
        try:
            log.info("Attempting local Ollama fallback (%s)...", ollama_model)
            response = ollama_client.chat.completions.create(
                model=ollama_model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
            )
            content = response.choices[0].message.content
            if content:
                log.info("Successfully received reply from local Ollama model.")
                return content.strip()
        except Exception as e:
            log.warning("Local Ollama fallback failed: %s", e)

    # ── 3. Offline Mock Fallback ─────────────────────────────────────────────
    return _mock_fallback_response(messages)
