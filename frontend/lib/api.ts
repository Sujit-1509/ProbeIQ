import type { Candidate, InterviewResponse, InterviewHistory, InterviewSettings } from './types'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
const API = `${API_BASE}/api/interview`

export async function startInterview(
  sessionId: string,
  candidate: Candidate,
  settings?: InterviewSettings,
): Promise<InterviewResponse> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, candidate, settings }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function sendMessage(
  sessionId: string,
  message: string,
): Promise<InterviewResponse> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function skipQuestion(sessionId: string): Promise<InterviewResponse> {
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId, action: 'skip' }) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getInterviewHistory(): Promise<InterviewHistory[]> {
  const res = await fetch(`${API_BASE}/api/interviews`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function getInterview(sessionId: string): Promise<InterviewHistory> {
  const res = await fetch(`${API_BASE}/api/interviews/${sessionId}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export async function saveReview(sessionId: string, decision: string, reviewerNote: string): Promise<InterviewHistory> {
  const res = await fetch(`${API_BASE}/api/interviews/${sessionId}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, reviewerNote }) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}
