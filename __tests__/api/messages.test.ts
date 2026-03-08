import { NextResponse } from 'next/server'

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}))

// Mock auth
jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { GET } from '@/app/api/messages/route'
import { PUT } from '@/app/api/messages/[id]/read/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('GET /api/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  it('returns 401 when not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('returns unread messages for current user', async () => {
    const mockMessages = [
      { id: 'msg-1', userId: 'user-1', source: 'slack', senderName: 'Alice', content: 'Hello', status: 'unread', receivedAt: new Date() },
    ]
    ;(prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0].senderName).toBe('Alice')
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', status: 'unread' }),
      })
    )
  })
})

describe('PUT /api/messages/:id/read', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(auth as jest.Mock).mockResolvedValue(mockSession)
  })

  it('returns 401 when not authenticated', async () => {
    ;(auth as jest.Mock).mockResolvedValue(null)
    const request = new Request('http://localhost/api/messages/msg-1/read', { method: 'PUT' })
    const response = await PUT(request, { params: Promise.resolve({ id: 'msg-1' }) })
    expect(response.status).toBe(401)
  })

  it('marks message as read and returns success', async () => {
    ;(prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    const request = new Request('http://localhost/api/messages/msg-1/read', { method: 'PUT' })
    const response = await PUT(request, { params: Promise.resolve({ id: 'msg-1' }) })
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.success).toBe(true)
  })

  it('returns 404 if message not found or not owned by user', async () => {
    ;(prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    const request = new Request('http://localhost/api/messages/bad-id/read', { method: 'PUT' })
    const response = await PUT(request, { params: Promise.resolve({ id: 'bad-id' }) })
    expect(response.status).toBe(404)
  })
})
