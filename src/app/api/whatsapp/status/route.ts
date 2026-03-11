import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const QR_TTL_MS = 90_000

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wa = await prisma.whatsAppSession.findUnique({
    where: { id: 'singleton' },
  })

  if (!wa) {
    return NextResponse.json({ status: 'disconnected' })
  }

  const qrIsStale =
    wa.qrCode !== null &&
    wa.qrUpdatedAt !== null &&
    Date.now() - wa.qrUpdatedAt.getTime() > QR_TTL_MS

  const shouldOmitQr = wa.status === 'connected' || qrIsStale

  return NextResponse.json({
    status: wa.status,
    qrCode: shouldOmitQr ? undefined : (wa.qrCode ?? undefined),
    connectedAt: wa.connectedAt?.toISOString() ?? undefined,
  })
}
