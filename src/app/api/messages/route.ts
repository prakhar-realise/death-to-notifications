import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messages = await prisma.message.findMany({
    where: {
      userId: session.user.id,
      status: 'unread',
    },
    orderBy: { receivedAt: 'desc' },
  })

  return NextResponse.json(messages)
}
