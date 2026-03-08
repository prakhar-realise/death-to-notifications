jest.mock('@/lib/prisma', () => ({
  prisma: {
    task: { findMany: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    message: { updateMany: jest.fn() },
  },
}))
jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))

import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { GET, POST } from '@/app/api/tasks/route'
import { PUT } from '@/app/api/tasks/[id]/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('GET /api/tasks', () => {
  beforeEach(() => { jest.clearAllMocks(); (auth as jest.Mock).mockResolvedValue(mockSession) })

  it('returns 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
  })

  it('returns open tasks for current user', async () => {
    (prisma.task.findMany as jest.Mock).mockResolvedValue([{ id: 't1', title: 'Review deck', status: 'open' }])
    const res = await GET()
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data[0].title).toBe('Review deck')
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ userId: 'user-1', status: 'open' }),
    }))
  })
})

describe('POST /api/tasks', () => {
  beforeEach(() => { jest.clearAllMocks(); (auth as jest.Mock).mockResolvedValue(mockSession) })

  it('returns 401 when not authenticated', async () => {
    (auth as jest.Mock).mockResolvedValue(null)
    const req = new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'x' }), headers: { 'Content-Type': 'application/json' } })
    expect((await POST(req)).status).toBe(401)
  })

  it('returns 400 if title is missing', async () => {
    const req = new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } })
    expect((await POST(req)).status).toBe(400)
  })

  it('creates a task and returns 201', async () => {
    (prisma.task.create as jest.Mock).mockResolvedValue({ id: 't1', title: 'New task' })
    const req = new Request('http://localhost/api/tasks', { method: 'POST', body: JSON.stringify({ title: 'New task' }), headers: { 'Content-Type': 'application/json' } })
    expect((await POST(req)).status).toBe(201)
  })
})

describe('PUT /api/tasks/:id', () => {
  beforeEach(() => { jest.clearAllMocks(); (auth as jest.Mock).mockResolvedValue(mockSession) })

  it('returns 404 if task not found', async () => {
    (prisma.task.updateMany as jest.Mock).mockResolvedValue({ count: 0 })
    const req = new Request('http://localhost/api/tasks/bad', { method: 'PUT', body: JSON.stringify({ status: 'done' }), headers: { 'Content-Type': 'application/json' } })
    expect((await PUT(req, { params: Promise.resolve({ id: 'bad' }) })).status).toBe(404)
  })

  it('marks task as done', async () => {
    (prisma.task.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
    const req = new Request('http://localhost/api/tasks/t1', { method: 'PUT', body: JSON.stringify({ status: 'done' }), headers: { 'Content-Type': 'application/json' } })
    const res = await PUT(req, { params: Promise.resolve({ id: 't1' }) })
    expect(res.status).toBe(200)
    expect((await res.json()).success).toBe(true)
  })
})
