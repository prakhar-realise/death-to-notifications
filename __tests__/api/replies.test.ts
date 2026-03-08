jest.mock('@/lib/prisma', () => ({
  prisma: {
    reply: { create: jest.fn() },
    message: { updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { POST } from '@/app/api/replies/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('POST /api/replies', () => {
  beforeEach(() => { jest.clearAllMocks(); (auth as jest.Mock).mockResolvedValue(mockSession) })

  it('returns 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null)
    const req = new Request('http://localhost/api/replies', { method: 'POST', body: JSON.stringify({ messageId: 'm1', content: 'hi' }), headers: { 'Content-Type': 'application/json' } })
    expect((await POST(req)).status).toBe(401)
  })

  it('returns 400 if messageId or content missing', async () => {
    const req = new Request('http://localhost/api/replies', { method: 'POST', body: JSON.stringify({ content: 'hi' }), headers: { 'Content-Type': 'application/json' } })
    expect((await POST(req)).status).toBe(400)
  })

  it('creates reply and marks message as replied', async () => {
    (prisma.reply.create as jest.Mock).mockResolvedValue({ id: 'r1' })
    ;(prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    const req = new Request('http://localhost/api/replies', { method: 'POST', body: JSON.stringify({ messageId: 'm1', content: 'On it!' }), headers: { 'Content-Type': 'application/json' } })
    const res = await POST(req)
    expect(res.status).toBe(201)
    expect(prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'm1' }),
      data: expect.objectContaining({ status: 'replied' }),
    }))
  })
})
