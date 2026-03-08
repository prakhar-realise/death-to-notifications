import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createTaskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  sourceMsgId: z.string().optional(),
  dueDate: z.string().optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id, status: 'open' },
    orderBy: { dueDate: 'asc' },
    include: { sourceMessage: true },
  })

  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = createTaskSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { title, notes, sourceMsgId, dueDate } = result.data

  const task = await prisma.task.create({
    data: {
      userId: session.user.id,
      title,
      notes,
      sourceMsgId,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    },
  })

  // Mark source message as converted
  if (sourceMsgId) {
    await prisma.message.updateMany({
      where: { id: sourceMsgId, userId: session.user.id },
      data: { status: 'converted', taskId: task.id },
    })
  }

  return NextResponse.json(task, { status: 201 })
}
