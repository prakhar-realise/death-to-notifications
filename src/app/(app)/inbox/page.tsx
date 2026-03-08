'use client'

import { useState } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { MessageModal } from '@/components/MessageModal'
import type { Message } from '@/hooks/useMessages'

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function InboxPage() {
  const { messages, loading, refresh } = useMessages()
  const [selected, setSelected] = useState<Message | null>(null)

  if (loading) return <p style={{ color: 'var(--color-ink-40)', fontSize: 'var(--text-sm)' }}>Loading…</p>

  return (
    <>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-ink-100)', marginBottom: 'var(--space-6)' }}>
        Inbox
      </h1>

      {messages.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
          <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-ink-100)', marginBottom: 'var(--space-2)' }}>
            You&apos;re all caught up.
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)' }}>
            New messages appear here.
          </p>
        </div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface)' }}>
          {messages.map((msg, i) => (
            <button
              key={msg.id}
              onClick={() => setSelected(msg)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
                padding: 'var(--space-4) var(--space-5)',
                height: 64,
                background: 'transparent',
                border: 'none',
                borderBottom: i < messages.length - 1 ? '1px solid var(--color-border)' : 'none',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 80ms',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {/* Unread dot */}
              <div style={{
                width: 8, height: 8, borderRadius: 'var(--radius-full)',
                background: 'var(--color-accent)', flexShrink: 0,
              }} />

              {/* Content */}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 4 }}>
                  <span style={{
                    background: msg.source === 'whatsapp' ? 'var(--color-whatsapp)' : 'var(--color-slack)',
                    color: '#fff',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-full)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}>
                    {msg.source === 'whatsapp' ? 'WA' : 'Slack'}
                  </span>
                  <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--color-ink-100)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.senderName}
                  </span>
                </div>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-70)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
                  {msg.content}
                </p>
              </div>

              {/* Timestamp */}
              <time
                dateTime={msg.receivedAt}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-40)', flexShrink: 0 }}
              >
                {timeAgo(msg.receivedAt)}
              </time>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MessageModal message={selected} onClose={() => setSelected(null)} onRefresh={refresh} />
      )}
    </>
  )
}
