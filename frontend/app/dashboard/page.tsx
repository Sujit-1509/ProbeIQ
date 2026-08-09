'use client'
import { useEffect, useState } from 'react'
import { getInterviewHistory } from '@/lib/api'
import type { InterviewHistory } from '@/lib/types'

export default function DashboardPage() {
  const [items, setItems] = useState<InterviewHistory[]>([])
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('ALL')

  useEffect(() => {
    getInterviewHistory().then(setItems).catch(e => setError(e instanceof Error ? e.message : 'Unable to load history'))
  }, [])

  const filtered = items.filter(item => {
    const matchesQuery = `${item.candidateName} ${item.candidateRole}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (status === 'ALL' || item.status === status)
  })
  const completed = items.filter(item => item.status === 'DONE')
  const scored = completed.map(item => item.feedback?.overall_score).filter((score): score is number => typeof score === 'number')
  const average = scored.length ? (scored.reduce((sum, score) => sum + score, 0) / scored.length).toFixed(1) : '—'

  return (
    <main className="min-h-dvh bg-[#F8FAFC] px-5 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end justify-between mb-8">
          <div><p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Recruiter workspace</p><h1 className="text-3xl font-bold text-[#0F172A] mt-1">Interview history</h1><p className="text-slate-500 mt-2">Review completed sessions and compare technical depth.</p></div>
          <a href="/" className="text-sm font-semibold text-blue-600 hover:text-blue-800">New interview</a>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-6"><div className="bg-white border border-[#E4E7EB] rounded-xl p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Total sessions</p><p className="text-2xl font-bold text-[#1E3A5F] mt-1">{items.length}</p></div><div className="bg-white border border-[#E4E7EB] rounded-xl p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Completed</p><p className="text-2xl font-bold text-emerald-700 mt-1">{completed.length}</p></div><div className="bg-white border border-[#E4E7EB] rounded-xl p-4"><p className="text-xs uppercase tracking-wider text-slate-500">Average score</p><p className="text-2xl font-bold text-[#1E3A5F] mt-1">{average}<span className="text-sm font-normal">{average !== '—' ? '/5' : ''}</span></p></div></div>
        {error && <p className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4">{error}</p>}
        {!error && items.length === 0 && <div className="bg-white border border-[#E4E7EB] rounded-xl p-10 text-center text-slate-500">No interviews saved yet.</div>}
        {items.length > 0 && <div className="flex flex-col sm:flex-row gap-3 mb-4"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search candidate or role" className="flex-1 rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm focus:outline-none focus:border-blue-600" /><select value={status} onChange={e => setStatus(e.target.value)} className="rounded-lg border border-[#CBD5E1] bg-white px-3 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="DONE">Completed</option><option value="IN_PROGRESS">In progress</option></select></div>}
        <div className="overflow-x-auto bg-white border border-[#E4E7EB] rounded-xl shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-[#E4E7EB] text-xs uppercase tracking-wider text-slate-500"><tr><th className="px-5 py-4">Candidate</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Score</th><th className="px-5 py-4">Questions</th><th className="px-5 py-4">Updated</th></tr></thead>
            <tbody>{filtered.map(item => { const score = item.feedback?.overall_score; return <tr key={item.sessionId} className="border-b last:border-0 border-[#E4E7EB]"><td className="px-5 py-4"><div className="font-semibold text-[#0F172A]">{item.candidateName}</div><div className="text-slate-500">{item.candidateRole}</div></td><td className="px-5 py-4"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${item.status === 'DONE' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{item.status === 'DONE' ? 'Completed' : 'In progress'}</span></td><td className="px-5 py-4 font-semibold text-[#1E3A5F]">{score ? `${score}/5` : '—'}</td><td className="px-5 py-4 text-slate-600">{item.questionCount}</td><td className="px-5 py-4 text-slate-500">{new Date(item.updatedAt + 'Z').toLocaleString()}</td></tr>})}</tbody>
          </table>
        </div>
      </div>
    </main>
  )
}
