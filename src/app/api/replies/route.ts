import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createReplySchema = z.object({
  messageId: z.string().min(1),
  content: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = createReplySchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { messageId, content } = result.data

  const reply = await prisma.reply.create({
    data: {
      userId: session.user.id,
      messageId,
      content,
      status: 'pending',
    },
  })

  await prisma.message.updateMany({
    where: { id: messageId, userId: session.user.id },
    data: { status: 'replied' },
  })

  return NextResponse.json(reply, { status: 201 })
}
