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

type PendingMessage = {
  lidKey: string
  msg: Parameters<typeof extractAndSave>[0]
}

// Messages that arrived before contacts synced — drained after contacts.upsert
const pendingLidQueue: PendingMessage[] = []

type WAMessage = {
  key: { fromMe?: boolean | null; remoteJid?: string | null; id?: string | null; participant?: string | null }
  message?: Record<string, unknown> | null
  pushName?: string | null
}

async function extractAndSave(msg: WAMessage, senderId: string) {
  const content =
    (msg.message?.conversation as string | undefined) ||
    (msg.message?.extendedTextMessage as { text?: string } | undefined)?.text ||
    ''
  if (!content) {
    console.log(`[WhatsApp] skipping: no text content. message keys=${Object.keys(msg.message ?? {}).join(',')}`)
    return
  }
  await saveIfWatched({
    source: 'whatsapp',
    externalId: msg.key.id!,
    senderId,
    senderName: msg.pushName || senderId,
    content,
    threadRef: msg.key.participant ?? undefined,
  })
}

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

  // Build lid → phone mapping from contact sync events, then drain queued messages
  sock.ev.on('contacts.upsert', async (contacts) => {
    for (const contact of contacts) {
      if (contact.lid && contact.id) {
        const phone = contact.id.replace(/@s\.whatsapp\.net$/, '')
        const lid = contact.lid.replace(/@lid$/, '')
        lidToPhone.set(lid, phone)
      }
    }
    console.log(`[WhatsApp] contacts.upsert: ${contacts.length} contacts, lid map size=${lidToPhone.size}`)

    // Drain messages that arrived before contacts synced
    if (pendingLidQueue.length > 0) {
      const toProcess = pendingLidQueue.splice(0)
      console.log(`[WhatsApp] Draining ${toProcess.length} pending lid message(s)`)
      for (const { lidKey, msg } of toProcess) {
        const phone = lidToPhone.get(lidKey)
        if (phone) {
          console.log(`[WhatsApp] Resolved queued lid ${lidKey} → ${phone}`)
          await extractAndSave(msg, phone)
        } else {
          console.log(`[WhatsApp] Still unresolved after contacts sync: ${lidKey}`)
        }
      }
    }
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

      if (rawJid.endsWith('@lid')) {
        const lidKey = rawJid.replace(/@lid$/, '')
        const resolved = lidToPhone.get(lidKey)
        if (resolved) {
          console.log(`[WhatsApp] Resolved lid ${lidKey} → ${resolved}`)
          await extractAndSave(msg as WAMessage, resolved)
        } else {
          // Contacts haven't synced yet — queue and process after contacts.upsert
          console.log(`[WhatsApp] Queuing unresolved lid ${lidKey} (lid map size=${lidToPhone.size})`)
          pendingLidQueue.push({ lidKey, msg: msg as WAMessage })
        }
      } else {
        const senderId = rawJid.replace(/@s\.whatsapp\.net$|@g\.us$/, '')
        console.log(`[WhatsApp] senderId=${senderId}`)
        await extractAndSave(msg as WAMessage, senderId)
      }
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
