export interface Member {
  id: string
  name: string
  jobRole: string
  yearsExperience: number
  education: string
  status: string
}

export interface Mission {
  day: number
  attempts: number
  passed: boolean
  skipped: boolean
}

export interface Signals {
  commitDays: number
  missionsCompleted: number
  missionsFirstTry: number
}

export interface Candidate {
  member: Member
  missions: Mission[]
  signals: Signals
}

export interface Message {
  role: 'interviewer' | 'candidate' | 'system'
  text: string
}

export interface Feedback {
  summary: string
  strengths: string[]
  gaps: string[]
  next: string[]
  topic_scores?: TopicScore[]
  overall_score?: number
}

export interface InterviewSettings {
  focus: string
  duration: 'short' | 'standard' | 'deep'
  style: 'technical' | 'balanced' | 'supportive'
}

export interface TopicScore {
  day: number
  title: string
  score: number
  depth_rating: string
}

export interface InterviewHistory {
  sessionId: string
  candidateName: string
  candidateRole: string
  status: string
  questionCount: number
  topicScores: TopicScore[]
  feedback?: Feedback | null
  updatedAt: string
  transcript?: Message[]
  settings?: InterviewSettings
  decision?: string | null
  reviewerNote?: string | null
}

export interface InterviewResponse {
  reply: string
  done: boolean
  feedback?: Feedback
}
