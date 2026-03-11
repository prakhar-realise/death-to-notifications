'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Plus } from 'lucide-react'
import QRCode from 'react-qr-code'

type Source = {
  id: string
  source: 'whatsapp' | 'slack'
  externalId: string
  displayName: string
  isActive: boolean
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      style={{
        position: 'relative',
        width: 40, height: 22,
        borderRadius: 'var(--radius-full)',
        background: checked ? 'var(--color-accent)' : 'var(--color-border-strong)',
        border: 'none',
        cursor: 'pointer',
        transition: 'background 150ms',
        padding: 0,
        flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute',
        top: 2, left: 2,
        width: 18, height: 18,
        borderRadius: 'var(--radius-full)',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
        transition: 'transform 150ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        transform: checked ? 'translateX(18px)' : 'translateX(0)',
        display: 'block',
      }} />
    </button>
  )
}

const sectionTitle: React.CSSProperties = {
  fontSize: 'var(--text-lg)',
  fontWeight: 600,
  color: 'var(--color-ink-100)',
  paddingBottom: 'var(--space-4)',
  borderBottom: '1px solid var(--color-border)',
  marginBottom: 'var(--space-4)',
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

const codeStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-xs)',
  background: 'var(--color-bg)',
  padding: '1px 6px',
  borderRadius: 'var(--radius-sm)',
}

type WAStatus = {
  status: 'disconnected' | 'pending' | 'connected'
  qrCode?: string
  connectedAt?: string
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [sources, setSources] = useState<Source[]>([])
  const [form, setForm] = useState({ source: 'slack' as 'whatsapp' | 'slack', externalId: '', displayName: '' })
  const [adding, setAdding] = useState(false)

  const fetchSources = useCallback(async () => {
    const res = await fetch('/api/sources')
    if (res.ok) setSources(await res.json())
  }, [])

  useEffect(() => { fetchSources() }, [fetchSources])

  const [waStatus, setWaStatus] = useState<WAStatus>({ status: 'disconnected' })

  useEffect(() => {
    let stopped = false

    async function poll() {
      try {
        const res = await fetch('/api/whatsapp/status')
        if (res.status === 401) return // session expired — stop polling
        if (res.ok) {
          const data: WAStatus = await res.json()
          if (!stopped) setWaStatus(data)
          if (data.status === 'connected') return // stop polling
        }
      } catch {
        // network error — keep polling
      }
      if (!stopped) setTimeout(poll, 5000)
    }

    poll()
    return () => { stopped = true }
  }, [])

  async function addSource() {
    if (!form.externalId || !form.displayName) return
    setAdding(true)
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setForm({ source: 'slack', externalId: '', displayName: '' })
    setAdding(false)
    fetchSources()
  }

  async function toggleSource(id: string, isActive: boolean) {
    await fetch(`/api/sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    fetchSources()
  }

  return (
    <>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-ink-100)', marginBottom: 'var(--space-8)' }}>
        Settings
      </h1>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

        {/* Account */}
        <section>
          <h2 style={sectionTitle}>Account</h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 48 }}>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink-70)' }}>Email</p>
            <p style={{ fontSize: 'var(--text-base)', color: 'var(--color-ink-100)', fontWeight: 500 }}>{session?.user?.email}</p>
          </div>
        </section>

        {/* Connections */}
        <section>
          <h2 style={sectionTitle}>Connections</h2>
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', overflow: 'hidden' }}>
            <div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
              <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)', marginBottom: 8 }}>WhatsApp</p>

              {waStatus.status === 'connected' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-70)' }}>WhatsApp connected</span>
                </div>
              )}

              {waStatus.status === 'pending' && waStatus.qrCode && (
                <div>
                  <div style={{
                    display: 'inline-block',
                    padding: 'var(--space-3)',
                    background: '#fff',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    marginBottom: 'var(--space-3)',
                  }}>
                    <QRCode value={waStatus.qrCode} size={180} />
                  </div>
                  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.6 }}>
                    Open WhatsApp → Linked Devices → Link a Device → scan this code.
                    The QR refreshes automatically.
                  </p>
                </div>
              )}

              {waStatus.status === 'disconnected' && (
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.5 }}>
                  Waiting for service to start…
                </p>
              )}
            </div>
            <div style={{ padding: 'var(--space-4) var(--space-5)' }}>
              <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)', marginBottom: 4 }}>Slack</p>
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.5 }}>
                Add your <code style={codeStyle}>SLACK_BOT_TOKEN</code> and <code style={codeStyle}>SLACK_SIGNING_SECRET</code> to <code style={codeStyle}>service/.env</code>.
              </p>
            </div>
          </div>
        </section>

        {/* Watched Sources */}
        <section>
          <h2 style={sectionTitle}>Watched Sources</h2>

          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', overflow: 'hidden', marginBottom: 'var(--space-4)' }}>
            {sources.length === 0 ? (
              <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', padding: 'var(--space-4) var(--space-5)' }}>
                No sources yet. Add one below.
              </p>
            ) : sources.map((src, i) => (
              <div key={src.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--space-4) var(--space-5)',
                minHeight: 48,
                borderBottom: i < sources.length - 1 ? '1px solid var(--color-border)' : 'none',
              }}>
                <div>
                  <span style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)' }}>{src.displayName}</span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-40)', marginLeft: 'var(--space-2)', fontFamily: 'var(--font-mono)' }}>
                    {src.source} · {src.externalId}
                  </span>
                </div>
                <Toggle checked={src.isActive} onChange={() => toggleSource(src.id, src.isActive)} />
              </div>
            ))}
          </div>

          {/* Add source form */}
          <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', background: 'var(--color-surface)', padding: 'var(--space-5)' }}>
            <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)', marginBottom: 'var(--space-4)' }}>Add a source</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <select
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value as 'whatsapp' | 'slack' })}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="slack">Slack</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              <input
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Display name (e.g. Alice, #product-team)"
                style={inputStyle}
              />
              <input
                value={form.externalId}
                onChange={(e) => setForm({ ...form, externalId: e.target.value })}
                placeholder={form.source === 'slack' ? 'Slack user or channel ID (e.g. U0123ABCD)' : 'WhatsApp number with country code (e.g. 919876543210)'}
                style={inputStyle}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={addSource}
                  disabled={adding || !form.externalId || !form.displayName}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                    fontSize: 'var(--text-sm)', fontWeight: 600,
                    color: '#fff',
                    background: 'var(--color-accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: 'var(--space-2) var(--space-5)',
                    cursor: 'pointer',
                    opacity: (adding || !form.externalId || !form.displayName) ? 0.4 : 1,
                  }}
                >
                  <Plus size={15} strokeWidth={2} />
                  {adding ? 'Adding…' : 'Add Source'}
                </button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  )
}
