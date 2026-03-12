import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { PrismaClient, WhatsAppStatus } from '@prisma/client'
import path from 'path'
import pino from 'pino'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const prisma = new PrismaClient()

// Maps @lid IDs → phone numbers, populated from Baileys contact events.
// WhatsApp now uses @lid (Linked Device IDs) instead of @s.whatsapp.net for many contacts.
const lidToPhone = new Map<string, string>()

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

  // Build lid → phone mapping from contact sync events
  sock.ev.on('contacts.upsert', (contacts) => {
    for (const contact of contacts) {
      if (contact.lid && contact.id) {
        const phone = contact.id.replace(/@s\.whatsapp\.net$/, '')
        const lid = contact.lid.replace(/@lid$/, '')
        lidToPhone.set(lid, phone)
      }
    }
    console.log(`[WhatsApp] contacts.upsert: ${contacts.length} contacts, lid map size=${lidToPhone.size}`)
  })

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
    console.log(`[WhatsApp] messages.upsert type=${type} count=${messages.length}`)
    if (type !== 'notify') return

    for (const msg of messages) {
      console.log(`[WhatsApp] msg fromMe=${msg.key.fromMe} remoteJid=${msg.key.remoteJid} hasMessage=${!!msg.message}`)
      if (msg.key.fromMe) continue
      if (!msg.message) continue

      const rawJid = msg.key.remoteJid
      if (!rawJid) continue

      // Resolve @lid to phone number. WhatsApp uses @lid for multi-device contacts.
      // Fall back to stripping the suffix if no mapping found.
      let senderId: string
      if (rawJid.endsWith('@lid')) {
        const lidKey = rawJid.replace(/@lid$/, '')
        const resolved = lidToPhone.get(lidKey)
        if (resolved) {
          senderId = resolved
          console.log(`[WhatsApp] Resolved lid ${lidKey} → ${senderId}`)
        } else {
          senderId = lidKey
          console.log(`[WhatsApp] No lid mapping for ${lidKey} (lid map size=${lidToPhone.size})`)
        }
      } else {
        senderId = rawJid.replace(/@s\.whatsapp\.net$|@g\.us$/, '')
      }

      console.log(`[WhatsApp] senderId=${senderId}`)

      const content =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''
      if (!content) {
        console.log(`[WhatsApp] skipping: no text content. message keys=${Object.keys(msg.message).join(',')}`)
        continue
      }

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
  console.log(`[WhatsApp] lookup source=${source} senderId=${senderId} → ${watchedSources.length} watched source(s)`)

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
