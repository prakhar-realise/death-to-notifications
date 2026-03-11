import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { PrismaClient, WhatsAppStatus } from '@prisma/client'
import path from 'path'
import pino from 'pino'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

export async function startWhatsApp(): Promise<void> {
  const authDir = path.join(__dirname, '../../auth_sessions/whatsapp')
  const { state, saveCreds } = await useMultiFileAuthState(authDir)
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      prisma.whatsAppSession.upsert({
        where: { id: 'singleton' },
        update: { status: WhatsAppStatus.pending, qrCode: qr, qrUpdatedAt: new Date() },
        create: { id: 'singleton', status: WhatsAppStatus.pending, qrCode: qr, qrUpdatedAt: new Date() },
      }).catch(err => console.error('[WhatsApp] Failed to write QR to DB:', err))
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('[WhatsApp] Connection closed. Reconnecting:', shouldReconnect)

      if (!shouldReconnect) {
        prisma.whatsAppSession.upsert({
          where: { id: 'singleton' },
          update: { status: WhatsAppStatus.disconnected, qrCode: null },
          create: { id: 'singleton', status: WhatsAppStatus.disconnected, qrCode: null },
        }).catch(err => console.error('[WhatsApp] Failed to write disconnected status:', err))
      }

      if (shouldReconnect) startWhatsApp()
    } else if (connection === 'open') {
      console.log('[WhatsApp] Connected')
      prisma.whatsAppSession.upsert({
        where: { id: 'singleton' },
        update: { status: WhatsAppStatus.connected, qrCode: null, connectedAt: new Date() },
        create: { id: 'singleton', status: WhatsAppStatus.connected, qrCode: null, connectedAt: new Date() },
      }).catch(err => console.error('[WhatsApp] Failed to write connected status:', err))
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return

    for (const msg of messages) {
      if (msg.key.fromMe) continue
      if (!msg.message) continue

      const senderId = msg.key.remoteJid
      if (!senderId) continue

      const content =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      if (!content) continue

      await saveIfWatched({
        source: 'whatsapp',
        externalId: msg.key.id!,
        senderId,
        senderName: msg.pushName || senderId,
        content,
        threadRef: msg.key.participant || undefined,
      })
    }
  })

  // Poll for pending replies every 10 seconds
  setInterval(() => sendPendingWhatsAppReplies(sock), 10_000)
}

async function saveIfWatched(params: {
  source: 'whatsapp'
  externalId: string
  senderId: string
  senderName: string
  content: string
  threadRef?: string
}) {
  const { source, externalId, senderId, senderName, content, threadRef } = params

  const watchedSources = await prisma.watchedSource.findMany({
    where: { source, externalId: senderId, isActive: true },
  })

  for (const ws of watchedSources) {
    await prisma.message.upsert({
      where: {
        userId_source_externalId: {
          userId: ws.userId,
          source,
          externalId,
        },
      },
      update: {},
      create: {
        userId: ws.userId,
        source,
        externalId,
        senderName,
        content,
        threadRef,
      },
    })
    console.log(`[WhatsApp] Saved message from ${senderName} for user ${ws.userId}`)
  }
}

async function sendPendingWhatsAppReplies(sock: ReturnType<typeof makeWASocket>) {
  const pending = await prisma.reply.findMany({
    where: { status: 'pending' },
    include: { message: true },
  })

  for (const reply of pending) {
    if (reply.message.source !== 'whatsapp') continue

    try {
      await sock.sendMessage(reply.message.externalId, { text: reply.content })
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'sent', sentAt: new Date() },
      })
      console.log(`[WhatsApp] Reply sent: ${reply.id}`)
    } catch (err) {
      console.error(`[WhatsApp] Reply failed: ${reply.id}`, err)
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'failed' },
      })
    }
  }
}
