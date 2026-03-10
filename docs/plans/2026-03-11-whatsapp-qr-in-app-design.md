# WhatsApp QR — In-App Connection Flow

**Date:** 2026-03-11
**Status:** Approved
**Scope:** v1

---

## Problem

The current implementation prints the WhatsApp QR code to Railway deploy logs. Users have no way to connect WhatsApp without accessing Railway infrastructure. This is not a viable UX for a product.

## Decision

Surface the QR code in the Settings page of the web app. Users navigate to Settings → Connections → WhatsApp and scan the QR inline. No Railway log access required.

---

## Architecture Decision: Session Storage

**v1 — Filesystem (Railway ephemeral):**
The WhatsApp auth session is stored on Railway's container filesystem (`auth_sessions/whatsapp/`). This is a single shared connection for the entire service — not per user. Simple to operate for a pre-launch product with a small, known user base.

**Known limitation:** Railway container restarts wipe the filesystem. Users must re-scan QR after every Railway redeploy or restart.

**v2 migration path:** Replace `useMultiFileAuthState` with a custom DB-backed auth state adapter. Each user gets their own WhatsApp session stored in Postgres. Session survives redeploys. Enables true multi-user with separate WhatsApp accounts.

---

## Chosen Approach: DB as shared state (Option 1)

The service writes QR and connection status to a singleton DB row. The Next.js API reads it. The frontend polls the API. No direct networking between Vercel and Railway.

**Why this over the alternatives:**
- No Railway service URL exposure (vs. HTTP endpoint / SSE approaches)
- Uses existing Prisma + DB infrastructure
- QR rotates every ~20s; a 5s poll lag is invisible to the user
- Clean separation of concerns — service owns writes, API owns reads

---

## Data Model

New Prisma model added to `prisma/schema.prisma`:

```prisma
model WhatsAppSession {
  id          String             @id @default("singleton")
  status      WhatsAppStatus     @default(disconnected)
  qrCode      String?
  qrUpdatedAt DateTime?
  connectedAt DateTime?
  updatedAt   DateTime           @updatedAt
}

enum WhatsAppStatus {
  disconnected
  qr_pending
  connected
}
```

One row, always. `id = "singleton"`. All writes use `upsert({ where: { id: "singleton" }, ... })`.

---

## Service Changes (`service/src/whatsapp.ts`)

On `connection.update` event from Baileys:

| Baileys event | DB write |
|---|---|
| `qr` field present | `status: qr_pending, qrCode: <string>, qrUpdatedAt: now` |
| `connection === 'open'` | `status: connected, qrCode: null, connectedAt: now` |
| `connection === 'close'` + not reconnecting | `status: disconnected, qrCode: null` |

---

## API Route

**`GET /api/whatsapp/status`**

- Protected: requires active session (`auth()`)
- Reads `WhatsAppSession` singleton
- Returns `{ status, qrCode?, connectedAt? }`
- If no row exists, returns `{ status: "disconnected" }`

No write endpoints. The background service is the sole writer.

---

## Frontend — Settings Page

The WhatsApp section in Settings/Connections renders one of three states based on polling `GET /api/whatsapp/status` every 5 seconds:

| State | UI |
|---|---|
| `disconnected` | "Waiting for service..." + subtle pulse |
| `qr_pending` | QR code (via `react-qr-code`) + scan instructions |
| `connected` | Green dot + "WhatsApp connected" |

Polling stops once `connected` is received. QR auto-refreshes as the service writes new codes.

**New frontend dependency:** `react-qr-code` (renders QR from string, ~6KB).

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `WhatsAppSession` model + `WhatsAppStatus` enum |
| `service/prisma/schema.prisma` | Mirror the above (kept in sync manually, v1 constraint) |
| `service/src/whatsapp.ts` | Write QR/status to DB on connection events |
| `src/app/api/whatsapp/status/route.ts` | New GET route |
| `src/app/(app)/settings/page.tsx` | Replace static WhatsApp instructions with live polling component |
| `package.json` | Add `react-qr-code` dependency |

---

## PRD Updates Required

- Section 4.6 (Settings): Replace "scan QR code to link device" with note that QR is shown inline in the app
- Section 9 (Success Criteria): Criteria #5 implicitly assumes per-user WhatsApp — update to reflect v1 is shared single connection; per-user is v2
- Add note to Future Additions: Per-user WhatsApp sessions (DB-backed auth state) as Phase 2 infrastructure work
