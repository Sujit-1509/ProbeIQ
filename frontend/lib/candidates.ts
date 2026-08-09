import type { Candidate } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/backend'

export async function getCandidates(): Promise<Candidate[]> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(`${API_URL}/api/candidates`, { signal: controller.signal })
    if (!response.ok) {
      throw new Error('Failed to fetch candidates')
    }
    return response.json()
  } finally {
    window.clearTimeout(timeout)
  }
}

