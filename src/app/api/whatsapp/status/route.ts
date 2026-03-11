import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  return NextResponse.json({
    status: wa.status,
    qrCode: wa.qrCode ?? undefined,
    connectedAt: wa.connectedAt?.toISOString() ?? undefined,
  })
}
