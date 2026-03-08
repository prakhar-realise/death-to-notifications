import { App } from '@slack/bolt'
import type { GenericMessageEvent } from '@slack/types'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function startSlack(): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  const port = parseInt(process.env.PORT || '3001')

  if (!token || !signingSecret) {
    console.log('[Slack] SLACK_BOT_TOKEN or SLACK_SIGNING_SECRET not set — skipping')
    return
  }

  const app = new App({ token, signingSecret, port })

  app.message(async ({ message, client }) => {
    const msg = message as GenericMessageEvent
    if (!msg.text || msg.subtype) return

    const senderId = msg.user
    const channelId = msg.channel
    const externalId = msg.ts
    const threadRef = msg.thread_ts

    let senderName = senderId
    try {
      const info = await client.users.info({ user: senderId })
      senderName = info.user?.real_name || info.user?.name || senderId
    } catch {
      // fallback to ID
    }

    await saveIfWatched({ senderId, channelId, externalId, senderName, content: msg.text, threadRef })
  })

  setInterval(() => sendPendingSlackReplies(app.client), 10_000)

  await app.start()
  console.log(`[Slack] Running on port ${port}`)
}

async function saveIfWatched(params: {
  senderId: string
  channelId: string
  externalId: string
  senderName: string
  content: string
  threadRef?: string
}) {
  const { senderId, channelId, externalId, senderName, content, threadRef } = params

  const watchedSources = await prisma.watchedSource.findMany({
    where: {
      source: 'slack',
      isActive: true,
      OR: [{ externalId: senderId }, { externalId: channelId }],
    },
  })

  for (const ws of watchedSources) {
    await prisma.message.upsert({
      where: {
        userId_source_externalId: {
          userId: ws.userId,
          source: 'slack',
          externalId,
        },
      },
      update: {},
      create: {
        userId: ws.userId,
        source: 'slack',
        externalId,
        senderName,
        content,
        threadRef,
      },
    })
    console.log(`[Slack] Saved message from ${senderName} for user ${ws.userId}`)
  }
}

async function sendPendingSlackReplies(client: App['client']) {
  const pending = await prisma.reply.findMany({
    where: { status: 'pending' },
    include: { message: true },
  })

  for (const reply of pending) {
    if (reply.message.source !== 'slack') continue

    try {
      await client.chat.postMessage({
        channel: reply.message.externalId,
        text: reply.content,
        thread_ts: reply.message.threadRef || undefined,
      })
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'sent', sentAt: new Date() },
      })
      console.log(`[Slack] Reply sent: ${reply.id}`)
    } catch (err) {
      console.error(`[Slack] Reply failed: ${reply.id}`, err)
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'failed' },
      })
    }
  }
}
