import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSourceSchema = z.object({
  source: z.enum(['whatsapp', 'slack']),
  externalId: z.string().min(1),
  displayName: z.string().min(1),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sources = await prisma.watchedSource.findMany({
    where: { userId: session.user.id },
    orderBy: { displayName: 'asc' },
  })

  return NextResponse.json(sources)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = createSourceSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const source = await prisma.watchedSource.create({
    data: { userId: session.user.id, ...result.data },
  })

  return NextResponse.json(source, { status: 201 })
}
