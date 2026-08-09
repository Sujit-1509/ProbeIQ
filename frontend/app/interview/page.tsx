'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { sendMessage as apiSend, skipQuestion } from '@/lib/api'
import type { Message } from '@/lib/types'

export default function InterviewPage() {
  const router = useRouter()
  const [messages, setMessages]       = useState<Message[]>([])
  const [sessionId, setSessionId]     = useState('')
  const [candidateName, setName]      = useState('')
  const [candidateRole, setRole]      = useState('')
  const [input, setInput]             = useState('')
  const [typing, setTyping]           = useState(false)
  const [disabled, setDisabled]       = useState(false)
  const [qCount, setQCount]           = useState(0)
  const [paused, setPaused]           = useState(false)
  const bottomRef                     = useRef<HTMLDivElement>(null)
  const textareaRef                   = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const raw = localStorage.getItem('probeiq_session')
    if (!raw) { router.replace('/'); return }
    const { sessionId, candidate, messages } = JSON.parse(raw)
    setSessionId(sessionId)
    setName(candidate.member.name)
    setRole(candidate.member.jobRole)
    setMessages(messages)
    setQCount(messages.filter((message: Message) => message.role === 'interviewer').length)
  }, [router])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, typing])

  useEffect(() => {
    const raw = localStorage.getItem('probeiq_session')
    if (raw && messages.length) localStorage.setItem('probeiq_session', JSON.stringify({ ...JSON.parse(raw), messages }))
  }, [messages])

  async function handleSend() {
    const text = input.trim()
    if (!text || disabled || paused) return
    setInput('')
    setDisabled(true)
    setTyping(true)
    setQCount(q => q + 1)
    setMessages(m => [...m, { role: 'candidate', text }])

    try {
      const data = await apiSend(sessionId, text)
      setTyping(false)
      setMessages(m => {
        const last = m[m.length - 1]
        return last?.role === 'interviewer' && last.text === data.reply
          ? m
          : [...m, { role: 'interviewer', text: data.reply }]
      })

      if (data.done) {
        localStorage.setItem('probeiq_feedback', JSON.stringify(data.feedback))
        setTimeout(() => router.push('/feedback'), 700)
      } else {
        setDisabled(false)
        textareaRef.current?.focus()
      }
    } catch (e: unknown) {
      setTyping(false)
      setDisabled(false)
      const msg = e instanceof Error ? e.message : 'Network error'
      setMessages(m => [...m, { role: 'system', text: `⚠️ ${msg} — please try again.` }])
    }
  }

  async function handleSkip() {
    if (disabled || paused) return
    setDisabled(true)
    setTyping(true)
    try {
      const data = await skipQuestion(sessionId)
      setQCount(q => q + 1)
      setMessages(m => [...m, { role: 'system', text: 'Topic skipped.' }, { role: 'interviewer', text: data.reply }])
    } catch (e) {
      setMessages(m => [...m, { role: 'system', text: 'Could not skip this topic. Please try again.' }])
    } finally {
      setTyping(false)
      setDisabled(false)
    }
  }

  const initials = candidateName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <div className="flex flex-col h-dvh max-w-3xl mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-[#E4E7EB] bg-white flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#2563EB] to-[#1E3A5F]
            flex items-center justify-center text-white font-bold text-xs select-none shadow-sm">
            AI
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[#0F172A]">Alex</span>
              <span className="text-xs font-medium bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                Technical Interviewer
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Interviewing {candidateName}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3"><span className="text-xs text-slate-400 tabular-nums">Q {qCount} / ~8-12</span><button onClick={() => setPaused(value => !value)} className="text-xs font-semibold text-blue-600">{paused ? 'Resume' : 'Pause'}</button></div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3 bg-[#F8FAFC]">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex fade-up
              ${m.role === 'candidate' ? 'justify-end' :
                m.role === 'system'    ? 'justify-center' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap rounded-xl
              ${m.role === 'interviewer'
                ? 'bg-white border border-[#E4E7EB] text-[#0F172A] rounded-bl-sm'
                : m.role === 'candidate'
                ? 'bg-[#1E3A5F] text-white rounded-br-sm'
                : 'bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-lg'
              }`}
            >
              {m.text}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start fade-up">
            <div className="bg-white border border-[#E4E7EB] rounded-xl rounded-bl-sm px-4 py-3 flex gap-1.5 items-center">
              <span className="text-xs text-slate-500 mr-1.5">Alex is typing</span>
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
              <span className="w-2 h-2 rounded-full bg-slate-400 typing-dot" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3 items-end px-5 py-4 border-t border-[#E4E7EB] bg-white flex-shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={e => {
            setInput(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
          }}
          disabled={disabled || paused}
          rows={2}
          placeholder="Type your answer… (Enter to send, Shift+Enter for newline)"
          className="flex-1 resize-none rounded-lg border-2 border-[#E4E7EB] px-3 py-2.5 text-sm
            focus:outline-none focus:border-[#2563EB] transition-colors duration-150
            disabled:opacity-50 max-h-[120px]"
        />
        <button onClick={handleSkip} disabled={disabled || paused} className="px-3 py-2.5 border border-[#CBD5E1] text-slate-600 font-semibold text-sm rounded-lg disabled:opacity-40">Skip</button>
        <button
          onClick={handleSend}
          disabled={disabled || paused || !input.trim()}
          className="px-5 py-2.5 bg-[#2563EB] text-white font-semibold text-sm rounded-lg
            cursor-pointer transition-colors duration-150 whitespace-nowrap
            disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </div>
  )
}
