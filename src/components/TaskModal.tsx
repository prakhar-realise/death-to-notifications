'use client'

import { useState } from 'react'
import { X, Check } from 'lucide-react'

type SourceMessage = {
  content: string
  senderName: string
  source: string
}

export type Task = {
  id: string
  title: string
  notes?: string | null
  dueDate?: string | null
  status: string
  createdAt: string
  sourceMessage?: SourceMessage | null
}

type Props = {
  task: Task
  onClose: () => void
  onRefresh: () => void
}

export function TaskModal({ task, onClose, onRefresh }: Props) {
  const [saving, setSaving] = useState(false)

  async function markDone() {
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    setSaving(false)
    onRefresh()
    onClose()
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
          display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          borderBottom: '1px solid var(--color-border)',
          minHeight: 56,
        }}>
          <span style={{ flex: 1, fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-ink-100)', lineHeight: 1.4 }}>
            {task.title}
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-ink-40)', display: 'flex', padding: 4, flexShrink: 0 }}
          >
            <X size={20} strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-6)', borderBottom: '1px solid var(--color-border)' }}>
          {task.dueDate && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', marginBottom: 'var(--space-3)', fontFamily: 'var(--font-mono)' }}>
              Due {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}

          {task.notes && (
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink-70)', whiteSpace: 'pre-wrap', marginBottom: 'var(--space-4)' }}>
              {task.notes}
            </p>
          )}

          {task.sourceMessage && (
            <div style={{
              background: 'var(--color-bg)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-3) var(--space-4)',
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-40)', marginBottom: 'var(--space-1)', textTransform: 'capitalize' }}>
                From {task.sourceMessage.source} · {task.sourceMessage.senderName}
              </p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-70)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
                {task.sourceMessage.content}
              </p>
            </div>
          )}

          {!task.dueDate && !task.notes && !task.sourceMessage && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)' }}>No additional details.</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: 'var(--space-4) var(--space-5)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={markDone}
            disabled={saving}
            style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              fontSize: 'var(--text-sm)', fontWeight: 600,
              color: '#fff',
              background: 'var(--color-accent)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              padding: 'var(--space-2) var(--space-5)',
              cursor: 'pointer',
              opacity: saving ? 0.4 : 1,
            }}
          >
            <Check size={15} strokeWidth={2} />
            {saving ? 'Marking done…' : 'Mark as Done'}
          </button>
        </div>
      </div>
    </div>
  )
}
