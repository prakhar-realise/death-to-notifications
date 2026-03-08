'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import { Inbox, CheckSquare, Settings, Sun, Moon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useMessages } from '@/hooks/useMessages'

const navItems = [
  { href: '/inbox', label: 'Inbox', icon: Inbox },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const { messages } = useMessages()
  const unreadCount = messages.length
  const [theme, setTheme] = useState<'light' | 'dark'>('light')

  useEffect(() => {
    const stored = localStorage.getItem('dtn-theme')
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    setTheme((stored as 'light' | 'dark') || system)
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('dtn-theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  return (
    <aside style={{
      width: '220px',
      flexShrink: 0,
      height: '100vh',
      background: 'var(--color-surface)',
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: 'var(--space-6) 0',
      position: 'sticky',
      top: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '0 var(--space-5) var(--space-6)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <div style={{
          width: 28, height: 28, background: 'var(--color-ink-100)', borderRadius: 'var(--radius-md)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Inbox size={14} color="var(--color-surface)" strokeWidth={2} />
        </div>
        <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-ink-100)', letterSpacing: '-0.01em' }}>
          Death to Notifs
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--color-border)', margin: '0 var(--space-4) var(--space-3)' }} />

      {/* Nav */}
      <nav style={{ flex: 1 }}>
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-3)',
                padding: 'var(--space-3) var(--space-5)',
                fontSize: 'var(--text-base)',
                fontWeight: 500,
                color: isActive ? 'var(--color-accent)' : 'var(--color-ink-70)',
                background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                borderLeft: isActive ? '3px solid var(--color-accent)' : '3px solid transparent',
                textDecoration: 'none',
                transition: 'background 100ms, color 100ms',
              }}
            >
              <Icon size={18} strokeWidth={1.5} />
              {label}
              {href === '/inbox' && unreadCount > 0 && (
                <span style={{
                  marginLeft: 'auto',
                  background: 'var(--color-accent)',
                  color: '#fff',
                  fontSize: 'var(--text-xs)',
                  fontWeight: 700,
                  minWidth: 20,
                  height: 20,
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0 var(--space-1)',
                }}>
                  {unreadCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Dark mode toggle */}
      <div style={{ padding: '0 var(--space-5) var(--space-4)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <Sun size={14} color="var(--color-ink-40)" strokeWidth={1.5} />
        <button
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          style={{
            position: 'relative',
            width: 40, height: 22,
            borderRadius: 'var(--radius-full)',
            background: theme === 'dark' ? 'var(--color-accent)' : 'var(--color-border-strong)',
            border: 'none',
            cursor: 'pointer',
            transition: 'background 150ms',
            padding: 0,
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
            transform: theme === 'dark' ? 'translateX(18px)' : 'translateX(0)',
            display: 'block',
          }} />
        </button>
        <Moon size={14} color="var(--color-ink-40)" strokeWidth={1.5} />
      </div>

      {/* Divider + Sign out */}
      <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-4) var(--space-5) 0' }}>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
