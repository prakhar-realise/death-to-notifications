'use client'

import { useState } from 'react'
import { X, CornerUpLeft, ListPlus } from 'lucide-react'
import type { Message } from '@/hooks/useMessages'

type Props = {
  message: Message
  onClose: () => void
  onRefresh: () => void
}

export function MessageModal({ message, onClose, onRefresh }: Props) {
  const [reply, setReply] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [view, setView] = useState<'default' | 'task'>('default')
  const [saving, setSaving] = useState(false)

  async function sendReply() {
    if (!reply.trim()) return
    setSaving(true)
    await fetch('/api/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, content: reply }),
    })
    setSaving(false)
    onRefresh()
    onClose()
  }

  async function createTask() {
    setSaving(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: taskTitle || message.content.slice(0, 80),
        sourceMsgId: message.id,
        dueDate: taskDue || undefined,
      }),
    })
    setSaving(false)
    onRefresh()
    onClose()
  }

  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-base)',
    color: 'var(--color-ink-100)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
    outline: 'none',
  }

  const btnSecondary: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: 'var(--color-ink-70)',
    background: 'transparent',
    border: '1px solid var(--color-border-strong)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2) var(--space-5)',
    cursor: 'pointer',
  }

  const btnPrimary: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 'var(--space-2)',
    fontSize: 'var(--text-sm)',
    fontWeight: 600,
    color: '#fff',
    background: 'var(--color-accent)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-2) var(--space-5)',
    cursor: 'pointer',
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'var(--color-backdrop)',
        backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 50,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        width: '100%',
        maxWidth: 480,
        margin: '0 var(--space-4)',
        animation: 'modal-in 150ms cubic-bezier(0, 0, 0.2, 1) forwards',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          minHeight: 56,
        }}>
          <span style={{
            background: message.source === 'whatsapp' ? 'var(--color-whatsapp)' : 'var(--color-slack)',
            color: '#fff',
            fontSize: 'var(--text-xs)',
            fontWeight: 500,
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>
            {message.source === 'whatsapp' ? 'WA' : 'Slack'}
          </span>
          <span style={{ fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--color-ink-100)', flex: 1 }}>
            {message.senderName}
          </span>
          <time style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-40)' }}>
            {formatTime(message.receivedAt)}
          </time>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-40)', display: 'flex', padding: 4 }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink-100)', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>
            {message.content}
          </p>
        </div>

        {/* Footer — reply + convert */}
        {view === 'default' && (
          <div style={{ padding: 'var(--space-5)' }}>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 'var(--space-2)' }}>Reply</p>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply…"
              rows={3}
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.6, display: 'block', marginBottom: 'var(--space-3)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button onClick={() => setView('task')} style={btnSecondary}>
                <ListPlus size={15} strokeWidth={1.5} />
                Convert to Task
              </button>
              <button
                onClick={sendReply}
                disabled={!reply.trim() || saving}
                style={{ ...btnPrimary, opacity: (!reply.trim() || saving) ? 0.4 : 1 }}
              >
                <CornerUpLeft size={15} strokeWidth={1.5} />
                {saving ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {/* Footer — create task */}
        {view === 'task' && (
          <div style={{ padding: 'var(--space-5)' }}>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 'var(--space-3)' }}>Create Task</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 6 }}>Title</label>
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder={message.content.slice(0, 60) + (message.content.length > 60 ? '…' : '')}
                  style={inputStyle}
                  autoFocus
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 6 }}>Due date (optional)</label>
                <input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
              <button onClick={() => setView('default')} style={btnSecondary}>Cancel</button>
              <button onClick={createTask} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.4 : 1 }}>
                {saving ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
