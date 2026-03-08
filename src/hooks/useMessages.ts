'use client'

import { useState, useEffect, useCallback } from 'react'

export type Message = {
  id: string
  source: 'whatsapp' | 'slack'
  senderName: string
  content: string
  receivedAt: string
  status: string
}

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch('/api/messages')
      if (res.ok) setMessages(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000)
    return () => clearInterval(interval)
  }, [fetchMessages])

  return { messages, loading, refresh: fetchMessages }
}
