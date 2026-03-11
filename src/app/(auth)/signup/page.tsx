'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    router.push('/login')
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontFamily: 'var(--font-sans)',
    fontSize: 'var(--text-base)',
    fontWeight: 400,
    color: 'var(--color-ink-100)',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-3) var(--space-4)',
    outline: 'none',
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg)',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        padding: 'var(--space-8)',
        width: '100%',
        maxWidth: 380,
        boxShadow: 'var(--shadow-md)',
      }}>
        <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-ink-100)', marginBottom: 'var(--space-1)' }}>
          Death to Notifications
        </h1>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', marginBottom: 'var(--space-6)' }}>
          Create your account
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 6 }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
              required
              autoFocus
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--color-ink-70)', marginBottom: 6 }}>
              Password <span style={{ color: 'var(--color-ink-40)', fontWeight: 400 }}>(min 8 chars)</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
              minLength={8}
            />
          </div>

          {error && (
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-danger)' }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'var(--color-accent)',
              color: '#fff',
              fontSize: 'var(--text-sm)',
              fontWeight: 600,
              padding: 'var(--space-3) var(--space-5)',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              transition: 'background 120ms ease',
              opacity: loading ? 0.6 : 1,
              width: '100%',
            }}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', marginTop: 'var(--space-4)', textAlign: 'center' }}>
          Already have an account?{' '}
          <Link href="/login" style={{ color: 'var(--color-accent)', textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
    </div>
  )
}
