'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Candidate, InterviewSettings } from '@/lib/types'
import { getCandidates } from '@/lib/candidates'
import { startInterview } from '@/lib/api'

/* ── Inline SVG icon set (stroke-only) ──────────────────────────────── */
const ICON_PROPS = {
  width: '20',
  height: '20',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: '2',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

function IconChat() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg {...ICON_PROPS}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function IconBolt() {
  return (
    <svg {...ICON_PROPS}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
  )
}

function IconGauge() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 15l3.5-3.5" />
      <path d="M20.3 15a8 8 0 1 0-16.6 0" />
      <path d="M20.3 15h.7" />
      <path d="M3 15h.7" />
    </svg>
  )
}

function IconShield() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

function IconDoc() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  )
}

function IconArrow({ className = '' }: { className?: string }) {
  return (
    <svg {...ICON_PROPS} width="16" height="16" className={className}>
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  )
}

/* ── Candidate picker card (used in the CTA section) ────────────────── */
function CandidatePicker() {
  const router = useRouter()
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [settings, setSettings] = useState<InterviewSettings>({ focus: 'Candidate project work', duration: 'standard', style: 'technical' })

  useEffect(() => {
    getCandidates()
      .then(setCandidates)
      .catch(() => setError('Cannot reach backend (port 8000). Candidates unavailable.'))
  }, [])

  async function handleStart() {
    if (selectedIdx === null) return
    setLoading(true)
    setError(null)
    const candidate = candidates[selectedIdx]
    const sessionId = crypto.randomUUID()

    try {
      const data = await startInterview(sessionId, candidate, settings)
      localStorage.setItem(
        'probeiq_session',
        JSON.stringify({ sessionId, candidate, settings, messages: [{ role: 'interviewer', text: data.reply }] }),
      )
      router.push('/interview')
    } catch (e) {
      setError('Cannot connect to backend. Make sure the server is running on port 8000.')
      setLoading(false)
    }
  }

  return (
    <div className="pi-surface landing-reveal landing-reveal-4 rounded-xl p-6 sm:p-8 w-full max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-sm font-semibold text-[#1E3A5F] uppercase tracking-widest">
          Select a Candidate
        </h3>
        <span className="text-xs text-[#2563EB] font-medium bg-blue-50 px-3 py-1 rounded-full">
          Real mission data
        </span>
      </div>

      <div className="flex flex-col gap-3 mb-6">
        {candidates.length === 0 && !error && (
          <div className="text-center text-slate-500 text-sm py-6">
            Loading candidates from the live backend…
          </div>
        )}
        {candidates.map((c, i) => (
          <button
            key={c.member.id}
            onClick={() => setSelectedIdx(i)}
            className={`flex flex-wrap sm:flex-nowrap items-center gap-2 p-4 rounded-xl border-2 text-left cursor-pointer
              transition-all duration-200
              ${selectedIdx === i
                ? 'border-[#2563EB] bg-blue-50'
                : 'border-[#E4E7EB] hover:border-[#2563EB] hover:bg-blue-50'}`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm text-[#0F172A]">{c.member.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">
                {c.member.jobRole} · {c.member.yearsExperience}y exp · {c.member.education}
              </div>
            </div>
            <span className="shrink-0 text-xs font-medium text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-full">
              {c.signals.missionsCompleted} missions
            </span>
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <label className="text-xs font-semibold text-slate-600">Focus<select value={settings.focus} onChange={e => setSettings(s => ({ ...s, focus: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm"><option>Candidate project work</option><option>System design</option><option>Debugging and delivery</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Length<select value={settings.duration} onChange={e => setSettings(s => ({ ...s, duration: e.target.value as InterviewSettings['duration'] }))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm"><option value="short">Short</option><option value="standard">Standard</option><option value="deep">Deep dive</option></select></label>
        <label className="text-xs font-semibold text-slate-600">Style<select value={settings.style} onChange={e => setSettings(s => ({ ...s, style: e.target.value as InterviewSettings['style'] }))} className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-sm"><option value="technical">Technical</option><option value="balanced">Balanced</option><option value="supportive">Supportive</option></select></label>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          {error}
        </p>
      )}

      <button
        onClick={handleStart}
        disabled={selectedIdx === null || loading}
        className="w-full py-3.5 bg-[#1E3A5F] text-white font-semibold rounded-xl cursor-pointer
          transition-all duration-150 shadow-lg shadow-slate-900/10
          disabled:opacity-40 disabled:cursor-not-allowed
          hover:bg-[#16304f] active:scale-[0.98]"
      >
        {loading ? 'Starting interview…' : 'Start the interview'}
      </button>
      <p className="text-center text-[11px] text-slate-400 mt-3">
        The interviewer adapts its questions to each candidate's experience.
      </p>
    </div>
  )
}

/* ── Hero mock panel ────────────────────────────────────────────────── */
function HeroMock() {
  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div className="relative rounded-2xl bg-white border border-[#BAE6FD] shadow-xl shadow-cyan-950/10 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E4E7EB] bg-[#F8FAFC]">
          <div className="w-10 h-10 rounded-full bg-[#0E7490]
            flex items-center justify-center text-white font-bold text-sm shadow-sm">AI</div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[#0F172A]">Alex</span>
              <span className="text-[11px] font-medium bg-blue-50 text-[#2563EB] px-2 py-0.5 rounded-full">
                Technical Interviewer
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Conducting · Q 4 of ~10
            </div>
          </div>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <div className="flex justify-start">
            <div className="max-w-[85%] bg-white border border-[#E4E7EB] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed text-[#0F172A]">
              Nice — embedding the intent classifier is a solid move. Building on that,
              how did you tune the retrieval threshold so recall didn't collapse on your
              Day 7 project? Walk me through your actual approach.
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[85%] bg-[#1E3A5F] text-white
              rounded-2xl rounded-br-sm px-4 py-3 text-sm leading-relaxed">
              I iterated on eval sets per category — started strict for finance terms, then
              relaxed the top-k so the LLM could rerank ambiguous queries.
            </div>
          </div>
          <div className="flex justify-start">
            <div className="bg-white border border-[#E4E7EB] rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="text-xs text-slate-500 mr-1.5">Alex is typing</span>
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
            </div>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-4 sm:-left-8 bg-white border border-[#E4E7EB] rounded-xl shadow-lg shadow-slate-900/5 px-4 py-3 hidden sm:block">
        <div className="text-[11px] text-slate-500 uppercase tracking-wide">Answer depth</div>
        <div className="text-sm font-bold text-[#0F172A] tabular-nums">Guided → Mastered</div>
      </div>
      <div className="absolute -top-4 -right-3 bg-white border border-[#E4E7EB] rounded-xl shadow-lg shadow-slate-900/5 px-4 py-2 hidden sm:block">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0F172A]">
          <IconShield /> Grounded in real missions
        </div>
      </div>
    </div>
  )
}

/* ── Landing body ───────────────────────────────────────────────────── */
const FEATURES = [
  {
    icon: <IconChat />,
    title: 'Conducts real conversations',
    body: 'Follow-ups reference what the candidate just said — calling back earlier answers instead of re-running a static checklist.',
  },
  {
    icon: <IconLayers />,
    title: 'Structured by a real curriculum',
    body: 'Interview plans are built from the candidate\'s actual missions, tools, and objectives — not generic canned questions.',
  },
  {
    icon: <IconBolt />,
    title: 'Adaptive to experience',
    body: 'Persona tuning per seniority: encouraging for juniors, system-design depth for seniors, implementation focus for mid-level.',
  },
  {
    icon: <IconDoc />,
    title: 'Wraps up with real feedback',
    body: 'Ends with a structured report — summary, strengths, gaps, and next steps — so interviews are useful, not just a log of questions.',
  },
  {
    icon: <IconGauge />,
    title: 'Paced, not interrogating',
    body: 'Detects "I don\'t know" and pivots gracefully instead of hammering the same topic. Momentum matters in hiring.',
  },
  {
    icon: <IconShield />,
    title: 'Resilient for live demos',
    body: 'OpenRouter → local Ollama → offline mock fallback. No crashes if the network or a key fails mid-demo.',
  },
]

const STEPS = [
  { n: '01', title: 'Pick a candidate', body: 'ProbeIQ reads live candidate & mission data from your backend — no manual setup.' },
  { n: '02', title: 'Interview with Alex', body: 'A multi-turn, conversational technical interview that adapts to every answer.' },
  { n: '03', title: 'Get structured feedback', body: 'Summary, strengths, gaps, and next steps — ready to share with your team.' },
]

export default function HomePage() {
  return (
    <main className="min-h-dvh text-[#0F172A] overflow-x-clip">
      {/* Nav */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-xl border-b border-[#E4E7EB]">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="#top" className="flex items-center gap-2.5 cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-[#1E3A5F] flex items-center justify-center
              text-white text-sm font-bold shadow-sm">PI</div>
            <span className="font-bold text-lg tracking-tight text-[#0F172A]">ProbeIQ</span>
          </a>
          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
            <a href="#how" className="hover:text-[#2563EB] transition-colors cursor-pointer">How it works</a>
            <a href="#features" className="hover:text-[#2563EB] transition-colors cursor-pointer">Features</a>
            <a href="#feedback" className="hover:text-[#0E7490] transition-colors cursor-pointer">Feedback</a>
            <a href="/dashboard" className="hover:text-[#0E7490] transition-colors cursor-pointer">Recruiter review</a>
          </div>
          <a href="#start"
            className="pi-control px-5 bg-[#0E7490] text-white text-sm font-semibold rounded-lg cursor-pointer
              transition-all duration-200 shadow-sm hover:bg-[#155E75] active:scale-[0.98]">
            Start interview</a>
        </nav>
      </header>

      {/* Hero */}
      <section id="top" className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-16 grid lg:grid-cols-2 gap-12 items-center min-h-[calc(100svh-4rem)]">
        <div>
          <span className="landing-reveal inline-flex items-center gap-2 text-xs font-semibold text-[#0E7490]
            bg-cyan-50 border border-cyan-100 rounded-full px-3.5 py-1.5">
            Interview intelligence for hiring teams
          </span>
          <h1 className="landing-reveal landing-reveal-1 mt-6 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[.98] text-[#0F172A]">
            ProbeIQ
          </h1>
          <p className="landing-reveal landing-reveal-2 mt-5 text-lg text-slate-600 leading-relaxed max-w-xl">
            ProbeIQ conducts realistic multi-turn technical interviews, grounded in what a
            candidate actually built — then delivers structured, honest feedback your team
            can act on.
          </p>
          <div className="landing-reveal landing-reveal-3 mt-8 flex flex-wrap gap-3">
            <a href="#start"
               className="pi-control px-7 inline-flex items-center bg-[#0E7490] text-white font-semibold rounded-lg cursor-pointer
                 transition-all duration-200 shadow-lg shadow-cyan-950/10 hover:bg-[#155E75] hover:-translate-y-0.5 active:scale-[0.98]">
              Start an interview <IconArrow className="inline" /></a>
            <a href="#how"
              className="pi-control px-7 inline-flex items-center bg-white text-[#0F172A] font-semibold rounded-lg cursor-pointer
                border border-[#BAE6FD] transition-all duration-200
                hover:border-[#0891B2] hover:text-[#0E7490] active:scale-[0.98]">
              See how it works</a>
          </div>
          <div className="landing-reveal landing-reveal-4 mt-10 flex flex-wrap items-center gap-x-8 gap-y-4 text-sm text-slate-500">
            <div><span className="font-bold text-[#0F172A] text-2xl">~8-12</span> questions</div>
            <div><span className="font-bold text-[#0F172A] text-2xl">3×</span> persona depth</div>
            <div><span className="font-bold text-[#0F172A] text-2xl">0</span> demo crashes</div>
          </div>
        </div>
        <div className="landing-reveal landing-reveal-2"><HeroMock /></div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-24 border-t border-[#E4E7EB] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-bold tracking-tight text-[#0F172A]">How it works</h2>
            <p className="mt-3 text-slate-600">Three steps from data to a hiring decision.</p>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {STEPS.map(s => (
              <div key={s.n} className="bg-[#F8FAFC] border border-[#E4E7EB] rounded-2xl p-6">
                <div className="text-3xl font-extrabold text-[#1E3A5F]">
                  {s.n}
                </div>
                <h3 className="mt-3 font-semibold text-lg">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-20">
        <div className="text-center max-w-2xl mx-auto">
          <span className="text-xs font-semibold text-[#2563EB] uppercase tracking-widest">Features</span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">Built to be scrupulously fair</h2>
          <p className="mt-3 text-slate-600">Every interview is grounded in real work — no skin-the-cat quizzes.</p>
        </div>
        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(f => (
            <div key={f.title} className="bg-white rounded-2xl border border-[#E4E7EB] p-6
              shadow-sm hover:shadow-md hover:border-[#2563EB]/40 hover:-translate-y-1 transition-all duration-200">
              <div className="w-11 h-11 rounded-xl bg-[#1E3A5F] text-white flex items-center justify-center shadow-sm">
                {f.icon}
              </div>
              <h3 className="mt-5 font-semibold text-[17px]">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feedback preview */}
      <section id="feedback" className="scroll-mt-24 border-t border-[#E4E7EB] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-20 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-semibold text-[#2563EB] uppercase tracking-widest">Output</span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#0F172A]">An interview that ends with a report — not a dead end</h2>
            <p className="mt-4 text-slate-600 leading-relaxed">
              When the last question is asked, ProbeIQ assembles a structured assessment:
              a candid summary, quantified strengths, areas to grow, and concrete next steps.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
              {['Summary narrative', 'Strengths', 'Gaps to address', 'Next steps'].map(t => (
                <div key={t} className="bg-[#F8FAFC] border border-[#E4E7EB] rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2563EB]" />
                  <span className="font-medium">{t}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-[#F8FAFC] border border-[#E4E7EB] rounded-2xl p-6 sm:p-8">
            <div className="text-xs font-semibold uppercase tracking-widest text-slate-400">Candidate · Sarah J.</div>
            <div className="mt-4 space-y-3">
              {[
                { tag: 'Strengths', text: 'Clear reasoning on retrieval recall vs precision trade-offs.', color: 'text-emerald-600' },
                { tag: 'Gap', text: 'Production latency — no caching plan discussed for large datasets.', color: 'text-amber-600' },
                { tag: 'Next', text: 'Prototype vector index with pgvector + monitor recall at p99.', color: 'text-[#2563EB]' },
              ].map(r => (
                <div key={r.tag} className="rounded-xl bg-white border border-[#E4E7EB] px-4 py-3">
                  <div className={`text-[11px] font-bold uppercase tracking-wide ${r.color}`}>{r.tag}</div>
                  <div className="text-sm text-slate-600 mt-1 leading-relaxed">{r.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="start" className="scroll-mt-24 max-w-6xl mx-auto px-4 sm:px-6 py-24 text-center">
        <div className="relative rounded-3xl overflow-hidden bg-[#1E3A5F]
          px-6 py-16 sm:py-20 shadow-xl shadow-slate-900/20">
          <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_-20%,rgba(37,99,235,0.35),transparent_50%)]" />
          <div className="relative">
            <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
              Try a live interview — on your own candidate data.
            </h2>
            <p className="mt-4 text-blue-100/90 max-w-xl mx-auto">
              Pick a candidate from your backend and watch the interviewer adapt in real time.
            </p>
          </div>
        </div>

        <div className="mt-10 pb-20">
          <CandidatePicker />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E4E7EB] bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#1E3A5F] flex items-center justify-center
              text-white text-[11px] font-bold">PI</div>
            <span className="text-sm font-semibold text-[#0F172A]">ProbeIQ</span>
          </div>
          <p className="text-xs text-slate-400 text-center">
            ProbeIQ · Technical interview agent · Built for hiring teams that value depth over dramatics.
          </p>
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <a href="/privacy" className="hover:text-[#2563EB] transition-colors cursor-pointer">Privacy</a>
            <a href="/terms" className="hover:text-[#2563EB] transition-colors cursor-pointer">Terms</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
