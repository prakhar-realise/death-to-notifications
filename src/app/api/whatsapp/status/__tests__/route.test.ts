import { GET } from '../route'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    whatsAppSession: {
      findUnique: jest.fn(),
    },
  },
}))

const { auth } = require('@/lib/auth')
const { prisma } = require('@/lib/prisma')

describe('GET /api/whatsapp/status', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    auth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns disconnected when no session row exists', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue(null)
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('disconnected')
  })

  it('returns pending with qrCode when status is pending', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'pending',
      qrCode: 'test-qr-string',
      qrUpdatedAt: new Date(),
      connectedAt: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.qrCode).toBe('test-qr-string')
  })

  it('returns connected with connectedAt', async () => {
    const connectedAt = new Date('2026-03-11T00:00:00Z')
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'connected',
      qrCode: null,
      qrUpdatedAt: null,
      connectedAt,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('connected')
    expect(body.connectedAt).toBe(connectedAt.toISOString())
  })

  it('does not include qrCode when status is connected', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'connected',
      qrCode: 'leftover-qr',
      qrUpdatedAt: new Date(),
      connectedAt: new Date('2026-03-11T00:00:00Z'),
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('connected')
    expect(body.qrCode).toBeUndefined()
  })

  it('does not include qrCode when status is pending but qrCode is null', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'pending',
      qrCode: null,
      qrUpdatedAt: null,
      connectedAt: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('pending')
    expect(body.qrCode).toBeUndefined()
  })
})
