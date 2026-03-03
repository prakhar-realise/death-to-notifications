# Death to Notifications — v1 Design

**Date:** 2026-03-02
**Status:** Approved

---

## Problem

Messages arriving across WhatsApp and Slack get lost. No single place to read, respond, and convert them to tracked tasks. Balls get dropped because tracking across multiple channels manually is impossible at volume.

---

## MVP Scope

- Read incoming messages from WhatsApp and Slack (specific contacts and channels only)
- Reply to messages directly from the app (response flows back to original channel)
- Convert a message into a task with a title and due date
- Track open tasks with RAG status and days outstanding

**Out of scope for v1:** Email integration, calendar sync, auto-reply on task creation, mobile app.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend + API | Next.js 14 + TypeScript |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Auth | NextAuth.js (email + password) |
| WhatsApp | baileys (multi-device companion protocol) |
| Slack | Slack Events API (webhooks) |
| Frontend hosting | Vercel (free tier) |
| Background service hosting | Railway (free tier) |
| DB hosting | Supabase (free tier) |

---

## Architecture

Two services sharing one database.

```
┌─────────────────────────────────┐     ┌──────────────────────────────┐
│  Next.js App (Vercel)           │     │  Background Service (Railway) │
│                                 │     │                              │
│  - Frontend UI                  │     │  - baileys (WhatsApp)        │
│  - API routes (tasks, messages) │     │  - Slack webhook receiver    │
│  - Auth (NextAuth.js)           │     │  - Writes to shared DB       │
└────────────────┬────────────────┘     └──────────────┬───────────────┘
                 │                                      │
                 └──────────────┬───────────────────────┘
                                │
                    ┌───────────▼──────────┐
                    │  PostgreSQL (Supabase)│
                    │  - users             │
                    │  - messages          │
                    │  - tasks             │
                    │  - watched_sources   │
                    │  - replies           │
                    └──────────────────────┘
```

**Why two services:** baileys requires a persistent long-running Node.js process (it maintains a permanent WebSocket connection to WhatsApp servers, like a companion device). Next.js on Vercel runs serverless functions that spin up and die per request — incompatible. The background service handles all integration logic; Next.js handles all user-facing logic. They only share the database.

**Message flow:**
1. Message arrives on WhatsApp or Slack
2. Background service receives it, checks if sender/channel is in `watched_sources` for that user
3. If yes, saves to `messages` table
4. Next.js frontend polls `GET /api/messages` every 5 seconds
5. New messages appear in the inbox

---

## Integration Approach

**Polling (Approach B):** Event-driven ingestion on the backend, frontend polls every 5 seconds.

- baileys listens for WhatsApp message events → writes to DB
- Slack Events API sends webhooks to background service → writes to DB
- Frontend calls `GET /api/messages` on a 5-second interval
- Display lag: ~5 seconds — acceptable for a task inbox, not a chat app

Chosen over WebSockets (too complex for v1) and SSE (awkward in Next.js, no clear advantage at this scale).

---

## Data Model

```sql
users
  id              UUID PRIMARY KEY
  email           TEXT UNIQUE NOT NULL
  password_hash   TEXT NOT NULL
  created_at      TIMESTAMP DEFAULT NOW()

messages
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  source          ENUM ('whatsapp', 'slack')
  external_id     TEXT                          -- WhatsApp msg ID / Slack ts
  sender_name     TEXT
  content         TEXT
  received_at     TIMESTAMP
  status          ENUM ('unread', 'read', 'converted', 'replied')
  task_id         UUID REFERENCES tasks(id)     -- nullable
  thread_ref      TEXT                          -- Slack thread ts / WhatsApp quoted msg id

tasks
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  title           TEXT NOT NULL
  notes           TEXT
  source_msg_id   UUID REFERENCES messages(id)  -- nullable, set if created from a message
  due_date        DATE
  status          ENUM ('open', 'done')
  created_at      TIMESTAMP DEFAULT NOW()

watched_sources
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  source          ENUM ('whatsapp', 'slack')
  external_id     TEXT                          -- WhatsApp JID / Slack channel or user ID
  display_name    TEXT
  is_active       BOOLEAN DEFAULT TRUE

replies
  id              UUID PRIMARY KEY
  user_id         UUID REFERENCES users(id)
  message_id      UUID REFERENCES messages(id)
  content         TEXT NOT NULL
  sent_at         TIMESTAMP
  status          ENUM ('pending', 'sent', 'failed')
```

**Multi-user by design:** every table carries `user_id`. All API routes validate session and filter by `user_id` before any DB query. User A never sees User B's data.

---

## API Routes

All routes validate NextAuth session. All DB queries filter by `req.user.id`.

```
Messages
  GET  /api/messages          Fetch unread messages (polled every 5s)
  PUT  /api/messages/:id/read Mark message as read

Tasks
  GET  /api/tasks             Fetch all open tasks
  POST /api/tasks             Create task (from message or manually)
  PUT  /api/tasks/:id         Update task (title, due date, status)

Replies
  POST /api/replies           Send reply to a message

Watched Sources
  GET  /api/sources           List monitored contacts/channels
  POST /api/sources           Add a contact/channel to monitor
  PUT  /api/sources/:id       Toggle active/inactive
```

The background service writes directly to the database via Prisma — it does not call these API routes.

---

## Frontend

Three screens. List → modal detail pattern on Inbox and Tasks.

### Inbox
- List: source badge (WhatsApp green / Slack purple), sender name, content preview, timestamp
- Modal on click: full message content, inline reply box, "Convert to Task" button (opens title + due date form)

### Tasks
- List: task title, RAG status dot, due date, days outstanding
  - Green: more than 3 days remaining
  - Amber: 1–3 days remaining
  - Red: overdue
- Modal on click: full task detail, notes, link to source message if created from one, mark done button

### Settings
- **Account:** email, change password, logout
- **Connections:** WhatsApp (QR code scan, session status), Slack (OAuth connect/disconnect button)
- **Sources:** list of watched contacts/channels per integration, add new, toggle active/inactive

---

## Auth

NextAuth.js with credentials provider (email + password). Sessions stored server-side. Every API route checks session before executing. Designed for multiple users from day one — no single-user shortcuts in the DB schema or API layer.

---

## Deployment

| Service | Platform | Cost |
|---|---|---|
| Next.js app | Vercel | Free |
| Background service | Railway | Free tier |
| PostgreSQL | Supabase | Free tier |

WhatsApp QR session files stored on Railway persistent storage (one per user).
Slack OAuth tokens stored in the `users` table (or a separate `integrations` table if needed).

---

## What This Is Not

- Not a chat replacement — 5s polling lag is fine
- Not a notification system — no push notifications in v1
- Not a mobile app — web first, mobile next
- Not a team product yet — multi-user schema is ready, multi-tenant features are not
