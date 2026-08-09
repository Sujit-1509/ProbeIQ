'use client'
import { useEffect, useState } from 'react'
import { getInterviewHistory, saveReview } from '@/lib/api'
import type { InterviewHistory } from '@/lib/types'

export default function DashboardPage() {
  const [items, setItems] = useState<InterviewHistory[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')
  const [selected, setSelected] = useState<InterviewHistory | null>(null)
  const [decision, setDecision] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    getInterviewHistory().then(setItems).catch(e => setError(e instanceof Error ? e.message : 'Unable to load history'))
  }, [])

  const filtered = items.filter(item => `${item.candidateName} ${item.candidateRole}`.toLowerCase().includes(query.toLowerCase()) && (status === 'ALL' || item.status === status))
  const completed = items.filter(item => item.status === 'DONE')
  const scores = completed.map(item => item.feedback?.overall_score).filter((score): score is number => typeof score === 'number')
  const average = scores.length ? (scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1) : '—'

  function select(item: InterviewHistory) {
    setSelected(item)
    setDecision(item.decision ?? '')
    setNote(item.reviewerNote ?? '')
  }

  async function submitReview() {
    if (!selected) return
    setSaving(true)
    try {
      const saved = await saveReview(selected.sessionId, decision, note)
      setItems(current => current.map(item => item.sessionId === saved.sessionId ? saved : item))
      setSelected(saved)
    } catch {
      setError('Could not save the review. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return <main className="min-h-dvh bg-[#F8FAFC] px-5 py-10"><div className="max-w-6xl mx-auto">
    <div className="flex items-end justify-between mb-8"><div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Recruiter workspace</p><h1 className="text-3xl font-bold text-[#0F172A] mt-1">Interview history</h1><p className="text-slate-500 mt-2">Review evidence, add notes, and record a human decision.</p></div><a href="/" className="text-sm font-semibold text-blue-600 hover:text-blue-800">New interview</a></div>
    <div className="grid grid-cols-3 gap-3 mb-6"><Metric label="Total sessions" value={String(items.length)} /><Metric label="Completed" value={String(completed.length)} tone="text-emerald-700" /><Metric label="Average score" value={average === '—' ? average : `${average}/5`} /></div>
    {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4">{error}</p>}
    <div className="flex flex-col sm:flex-row gap-3 mb-4"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search candidate or role" className="flex-1 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-blue-600" /><select value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="DONE">Completed</option><option value="IN_PROGRESS">In progress</option></select></div>
    <div className="grid lg:grid-cols-[1.35fr_.85fr] gap-5"><div className="overflow-x-auto bg-white border border-[#E4E7EB] rounded-xl shadow-sm"><table className="w-full text-left text-sm"><thead className="bg-slate-50 border-b border-[#E4E7EB] text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Candidate</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Score</th><th className="px-5 py-4">Decision</th></tr></thead><tbody>{filtered.map(item => <tr key={item.sessionId} onClick={() => select(item)} className="border-b last:border-0 border-[#E4E7EB] cursor-pointer hover:bg-blue-50"><td className="px-5 py-4"><div className="font-semibold text-[#0F172A]">{item.candidateName}</div><div className="text-slate-500">{item.candidateRole}</div></td><td className="px-5 py-4"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'DONE' ? 'Completed' : 'In progress'}</span></td><td className="px-5 py-4 font-semibold text-[#1E3A5F]">{item.feedback?.overall_score ? `${item.feedback.overall_score}/5` : '—'}</td><td className="px-5 py-4 text-slate-600">{item.decision || 'Pending'}</td></tr>)}</tbody></table>{!error && filtered.length === 0 && <p className="p-8 text-center text-slate-500">No interviews match these filters.</p>}</div>
      <aside className="bg-white border border-[#E4E7EB] rounded-xl p-5 shadow-sm min-h-72">{selected ? <><p className="text-xs uppercase tracking-wider font-semibold text-blue-600">Interview review</p><h2 className="text-xl font-bold text-[#0F172A] mt-1">{selected.candidateName}</h2><p className="text-sm text-slate-500">{selected.candidateRole} · {selected.questionCount} questions</p><div className="mt-5 space-y-3 text-sm"><p><span className="font-semibold">Summary:</span> {selected.feedback?.summary ?? 'Interview is still in progress.'}</p><p><span className="font-semibold">Strengths:</span> {selected.feedback?.strengths?.join(' · ') || 'Not available yet.'}</p><p><span className="font-semibold">Gaps:</span> {selected.feedback?.gaps?.join(' · ') || 'Not available yet.'}</p></div><details className="mt-5 text-sm"><summary className="cursor-pointer font-semibold text-[#1E3A5F]">View transcript ({selected.transcript?.length ?? 0} turns)</summary><div className="mt-3 max-h-48 overflow-y-auto space-y-2">{selected.transcript?.map((turn, index) => <p key={index}><span className="font-semibold text-slate-500">{turn.role === 'interviewer' ? 'Interviewer' : selected.candidateName}:</span> {turn.text}</p>)}</div></details><div className="mt-5 border-t border-[#E4E7EB] pt-4"><label className="text-xs font-semibold text-slate-600">Decision<select value={decision} onChange={e => setDecision(e.target.value)} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm"><option value="">Pending review</option><option>Strong hire</option><option>Hire</option><option>Hold</option><option>No hire</option></select></label><label className="block text-xs font-semibold text-slate-600 mt-3">Reviewer note<textarea value={note} onChange={e => setNote(e.target.value)} rows={3} className="mt-1 w-full resize-none rounded-lg border border-[#CBD5E1] p-2 text-sm" placeholder="Add context for the hiring team" /></label><button onClick={submitReview} disabled={saving} className="mt-3 w-full rounded-lg bg-[#1E3A5F] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{saving ? 'Saving...' : 'Save review'}</button></div></> : <div className="h-full flex items-center text-sm text-slate-500">Select an interview to inspect its report and add a human decision.</div>}</aside></div>
  </div></main>
}

function Metric({ label, value, tone = 'text-[#1E3A5F]' }: { label: string; value: string; tone?: string }) {
  return <div className="bg-white border border-[#E4E7EB] rounded-xl p-4"><p className="text-xs uppercase tracking-wider text-slate-500">{label}</p><p className={`text-2xl font-bold mt-1 ${tone}`}>{value}</p></div>
}
