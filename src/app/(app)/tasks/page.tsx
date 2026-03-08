'use client'

import { useState, useEffect, useCallback } from 'react'
import { TaskModal } from '@/components/TaskModal'
import type { Task } from '@/components/TaskModal'

type RagResult = { color: string; label: string; group: 'overdue' | 'soon' | 'ok' | 'none' }

function getRag(dueDate?: string | null): RagResult {
  if (!dueDate) return { color: 'var(--color-ink-20)', label: 'No date', group: 'none' }
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86_400_000)
  if (days < 0) return { color: 'var(--color-status-red)', label: `${Math.abs(days)}d overdue`, group: 'overdue' }
  if (days <= 3) return { color: 'var(--color-status-amber)', label: `${days}d left`, group: 'soon' }
  return { color: 'var(--color-status-green)', label: `${days}d left`, group: 'ok' }
}

function formatDue(dueDate: string) {
  return new Date(dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Task | null>(null)

  const fetchTasks = useCallback(async () => {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchTasks() }, [fetchTasks])

  if (loading) return <p style={{ color: 'var(--color-ink-40)', fontSize: 'var(--text-sm)' }}>Loading…</p>

  const groups = [
    { label: 'Overdue', color: 'var(--color-status-red)', items: tasks.filter(t => getRag(t.dueDate).group === 'overdue') },
    { label: 'Due soon', color: 'var(--color-status-amber)', items: tasks.filter(t => getRag(t.dueDate).group === 'soon') },
    { label: 'Upcoming', color: 'var(--color-ink-40)', items: tasks.filter(t => ['ok', 'none'].includes(getRag(t.dueDate).group)) },
  ].filter(g => g.items.length > 0)

  return (
    <>
      <h1 style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--color-ink-100)', marginBottom: 'var(--space-6)' }}>
        Open Tasks
      </h1>

      {tasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-12) 0' }}>
          <p style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--color-ink-100)', marginBottom: 'var(--space-2)' }}>
            No open tasks.
          </p>
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)' }}>
            Convert a message to create one.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          {groups.map(({ label, color, items }) => (
            <div key={label}>
              <p style={{
                fontSize: 'var(--text-xs)',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color,
                marginBottom: 'var(--space-3)',
              }}>
                {label}
              </p>
              <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--color-surface)' }}>
                {items.map((task, i) => {
                  const rag = getRag(task.dueDate)
                  return (
                    <button
                      key={task.id}
                      onClick={() => setSelected(task)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                        padding: 'var(--space-4) var(--space-5)',
                        height: 60,
                        background: 'transparent',
                        border: 'none',
                        borderBottom: i < items.length - 1 ? '1px solid var(--color-border)' : 'none',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 80ms',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      <span
                        style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: rag.color, flexShrink: 0 }}
                        title={rag.label}
                      />
                      <span style={{ flex: 1, fontSize: 'var(--text-md)', fontWeight: 500, color: 'var(--color-ink-100)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </span>
                      {task.dueDate && (
                        <time
                          dateTime={task.dueDate}
                          style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--color-ink-40)', flexShrink: 0 }}
                        >
                          {formatDue(task.dueDate)}
                        </time>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <TaskModal task={selected} onClose={() => setSelected(null)} onRefresh={fetchTasks} />
      )}
    </>
  )
}
