'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Feedback, Message } from '@/lib/types'

function List({ items, bulletColor }: { items: string[]; bulletColor: string }) {
  if (!items?.length) return <p className="text-sm text-slate-400">None noted</p>
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed">
          <span className={`${bulletColor} font-bold shrink-0 mt-0.5`}>•</span>
          <span className="text-[#0F172A]">{item}</span>
        </li>
      ))}
    </ul>
  )
}

export default function FeedbackPage() {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [name, setName] = useState('')
  const [transcript, setTranscript] = useState<Message[]>([])

  useEffect(() => {
    const fb      = localStorage.getItem('probeiq_feedback')
    const session = localStorage.getItem('probeiq_session')
    if (!fb) { router.replace('/'); return }
    setFeedback(JSON.parse(fb))
    if (session) {
      const parsed = JSON.parse(session)
      setName(parsed.candidate.member.name)
      setTranscript(parsed.messages ?? [])
    }
  }, [router])

  function restart() {
    localStorage.removeItem('probeiq_session')
    localStorage.removeItem('probeiq_feedback')
    router.push('/')
  }

  if (!feedback) return null

  const cards = [
    {
      label:   'Summary',
      border:  'border-t-[#1E3A5F]',
      content: <p className="text-sm leading-relaxed text-[#0F172A]">{feedback.summary ?? '—'}</p>,
    },
    {
      label:   'Strengths',
      border:  'border-t-[#059669]',
      content: <List items={feedback.strengths} bulletColor="text-[#059669]" />,
    },
    {
      label:   'Areas to Improve',
      border:  'border-t-amber-500',
      content: <List items={feedback.gaps} bulletColor="text-amber-500" />,
    },
    {
      label:   'Next Steps',
      border:  'border-t-[#2563EB]',
      content: <List items={feedback.next} bulletColor="text-[#2563EB]" />,
    },
  ]

  return (
    <main className="min-h-dvh bg-[#F8FAFC] flex flex-col items-center px-4 py-10">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-[#1E3A5F]">Interview Complete</h1>
        <p className="text-slate-500 text-sm mt-1">Feedback for {name}</p>
        <button onClick={() => window.print()} className="mt-4 px-4 py-2 border border-[#CBD5E1] rounded-lg text-sm font-semibold text-[#1E3A5F] hover:bg-white">Print report</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-3xl mb-8">
        {cards.map(c => (
          <div
            key={c.label}
            className={`bg-white rounded-xl border border-[#E4E7EB] border-t-4 ${c.border} p-5 shadow-sm`}
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              {c.label}
            </h3>
            {c.content}
          </div>
        ))}
      </div>

      {feedback.overall_score && <div className="w-full max-w-3xl bg-white border border-[#E4E7EB] rounded-xl p-5 mb-8"><div className="flex items-center justify-between mb-4"><h2 className="font-semibold text-[#0F172A]">Technical depth by topic</h2><span className="text-2xl font-bold text-[#1E3A5F]">{feedback.overall_score}/5</span></div><div className="grid sm:grid-cols-2 gap-3">{feedback.topic_scores?.map(score => <div key={`${score.day}-${score.title}`} className="border border-slate-200 rounded-lg p-3"><div className="flex justify-between text-sm"><span className="font-medium text-[#0F172A]">Day {score.day}: {score.title}</span><span className="font-semibold text-blue-600">{score.score}/5</span></div><div className="h-2 bg-slate-100 rounded-full mt-2"><div className="h-2 bg-blue-600 rounded-full" style={{ width: `${score.score * 20}%` }} /></div></div>)}</div></div>}

      {transcript.length > 0 && <details className="w-full max-w-3xl bg-white border border-[#E4E7EB] rounded-xl p-5 mb-8"><summary className="font-semibold text-[#0F172A] cursor-pointer">Interview transcript</summary><div className="mt-4 flex flex-col gap-3">{transcript.filter(message => message.role !== 'system').map((message, index) => <div key={index} className="text-sm"><span className="font-semibold text-slate-500">{message.role === 'interviewer' ? 'Interviewer' : name}:</span> <span className="text-[#0F172A]">{message.text}</span></div>)}</div></details>}

      <button
        onClick={restart}
        className="px-8 py-3 bg-[#1E3A5F] text-white font-semibold rounded-lg cursor-pointer
          transition-colors duration-150 hover:bg-[#16304f]"
      >
        ← New Interview
      </button>
    </main>
  )
}
