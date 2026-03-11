# WhatsApp QR In-App Connection — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the terminal QR hack with a live QR code rendered in the Settings page, powered by the background service writing connection state to the DB.

**Architecture:** The Railway background service writes WhatsApp connection status (and QR string) to a `WhatsAppSession` singleton row in Postgres. A Next.js API route reads that row. The Settings page polls the API every 5 seconds and renders the QR using `react-qr-code`.

**Tech Stack:** Prisma (schema migration), Next.js App Router API routes, React polling with `useEffect`/`setInterval`, `react-qr-code` for QR rendering, Baileys `connection.update` event for state transitions.

---

## Worktree

All work happens in: `.worktrees/v1-build` on branch `feature/v1-build`.

Run commands from that directory unless specified otherwise.

---

### Task 1: Add `WhatsAppSession` to both Prisma schemas

The schema lives in two places: `prisma/schema.prisma` (used by Next.js / Vercel) and `service/prisma/schema.prisma` (used by the background service on Railway). Both must be updated identically.

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `service/prisma/schema.prisma`

**Step 1: Add the enum and model to `prisma/schema.prisma`**

Append to the end of `prisma/schema.prisma`:

```prisma
enum WhatsAppStatus {
  disconnected
  qr_pending
  connected
}

model WhatsAppSession {
  id          String          @id @default("singleton")
  status      WhatsAppStatus  @default(disconnected)
  qrCode      String?
  qrUpdatedAt DateTime?
  connectedAt DateTime?
  updatedAt   DateTime        @updatedAt
}
```

**Step 2: Apply the identical change to `service/prisma/schema.prisma`**

Append the same block to `service/prisma/schema.prisma`.

**Step 3: Run the migration**

```bash
export PATH="/opt/homebrew/bin:$PATH"
npx prisma migrate dev --name add-whatsapp-session
```

Expected output: `Your database is now in sync with your schema.`

**Step 4: Regenerate Prisma client for the service**

```bash
cd service && npx prisma generate && cd ..
```

Expected: `Generated Prisma Client`

**Step 5: Commit**

```bash
git add prisma/schema.prisma service/prisma/schema.prisma prisma/migrations/
git commit -m "feat: add WhatsAppSession model to schema"
```

---

### Task 2: Add `react-qr-code` to the frontend

**Files:**
- Modify: `package.json`

**Step 1: Add the dependency**

In `package.json`, add to `dependencies`:

```json
"react-qr-code": "^2.0.15"
```

**Step 2: Install**

```bash
export PATH="/opt/homebrew/opt/node/bin:$PATH"
npm install
```

Expected: `added N packages`

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add react-qr-code dependency"
```

---

### Task 3: Update the service to write WhatsApp status to DB

`service/src/whatsapp.ts` currently handles `connection.update` events from Baileys but only logs to console. Update it to write connection state and QR codes to the `WhatsAppSession` singleton in the DB.

**Files:**
- Modify: `service/src/whatsapp.ts`

**Step 1: Replace the `connection.update` handler**

The current handler (around lines 30–39) only logs. Replace the entire `sock.ev.on('connection.update', ...)` block with:

```typescript
sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
  if (qr) {
    prisma.whatsAppSession.upsert({
      where: { id: 'singleton' },
      update: { status: 'qr_pending', qrCode: qr, qrUpdatedAt: new Date() },
      create: { id: 'singleton', status: 'qr_pending', qrCode: qr, qrUpdatedAt: new Date() },
    }).catch(err => console.error('[WhatsApp] Failed to write QR to DB:', err))
  }

  if (connection === 'close') {
    const shouldReconnect =
      (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
    console.log('[WhatsApp] Connection closed. Reconnecting:', shouldReconnect)

    if (!shouldReconnect) {
      prisma.whatsAppSession.upsert({
        where: { id: 'singleton' },
        update: { status: 'disconnected', qrCode: null },
        create: { id: 'singleton', status: 'disconnected', qrCode: null },
      }).catch(err => console.error('[WhatsApp] Failed to write disconnected status:', err))
    }

    if (shouldReconnect) startWhatsApp()
  } else if (connection === 'open') {
    console.log('[WhatsApp] Connected')
    prisma.whatsAppSession.upsert({
      where: { id: 'singleton' },
      update: { status: 'connected', qrCode: null, connectedAt: new Date() },
      create: { id: 'singleton', status: 'connected', qrCode: null, connectedAt: new Date() },
    }).catch(err => console.error('[WhatsApp] Failed to write connected status:', err))
  }
})
```

Note: DB writes use `.catch()` not `await` because this is a synchronous event handler. Errors are logged but don't crash the connection flow.

**Step 2: Remove the `qrcode-terminal` import and usage**

The `qrcode-terminal` package was added as a temporary workaround. Remove it entirely:
- Remove the import: `import qrcode from 'qrcode-terminal'`
- The `qrcode.generate(...)` call is replaced by the DB write above — nothing else to remove.

Also remove `qrcode-terminal` and `@types/qrcode-terminal` from `service/package.json`.

**Step 3: Verify TypeScript compiles**

```bash
cd service && npx tsc --noEmit && cd ..
```

Expected: No errors.

**Step 4: Commit**

```bash
git add service/src/whatsapp.ts service/package.json
git commit -m "feat: write WhatsApp QR and status to DB via WhatsAppSession"
```

---

### Task 4: Create the API route `GET /api/whatsapp/status`

**Files:**
- Create: `src/app/api/whatsapp/status/route.ts`

**Step 1: Write the failing test**

Create `src/app/api/whatsapp/status/__tests__/route.test.ts`:

```typescript
import { GET } from '../route'
import { NextResponse } from 'next/server'

jest.mock('@/lib/auth', () => ({
  auth: jest.fn(),
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    whatsAppSession: {
      findUnique: jest.fn(),
    },
  },
}))

const { auth } = require('@/lib/auth')
const { prisma } = require('@/lib/prisma')

describe('GET /api/whatsapp/status', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    auth.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })

  it('returns disconnected when no session row exists', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue(null)
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('disconnected')
  })

  it('returns qr_pending with qrCode when status is qr_pending', async () => {
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'qr_pending',
      qrCode: 'test-qr-string',
      connectedAt: null,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('qr_pending')
    expect(body.qrCode).toBe('test-qr-string')
  })

  it('returns connected with connectedAt', async () => {
    const connectedAt = new Date('2026-03-11T00:00:00Z')
    auth.mockResolvedValue({ user: { id: 'u1' } })
    prisma.whatsAppSession.findUnique.mockResolvedValue({
      status: 'connected',
      qrCode: null,
      connectedAt,
    })
    const res = await GET()
    const body = await res.json()
    expect(body.status).toBe('connected')
    expect(body.connectedAt).toBe(connectedAt.toISOString())
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
npx jest src/app/api/whatsapp/status --no-coverage
```

Expected: FAIL — `Cannot find module '../route'`

**Step 3: Create the route**

Create `src/app/api/whatsapp/status/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const wa = await prisma.whatsAppSession.findUnique({
    where: { id: 'singleton' },
  })

  if (!wa) {
    return NextResponse.json({ status: 'disconnected' })
  }

  return NextResponse.json({
    status: wa.status,
    qrCode: wa.qrCode ?? undefined,
    connectedAt: wa.connectedAt?.toISOString() ?? undefined,
  })
}
```

**Step 4: Run the tests to verify they pass**

```bash
npx jest src/app/api/whatsapp/status --no-coverage
```

Expected: 4 tests pass.

**Step 5: Commit**

```bash
git add src/app/api/whatsapp/status/
git commit -m "feat: add GET /api/whatsapp/status route"
```

---

### Task 5: Update the Settings page — WhatsApp Connections section

Replace the static WhatsApp instructions with a live polling component that shows the QR or connection status.

**Files:**
- Modify: `src/app/(app)/settings/page.tsx`

**Step 1: Add state and polling hook**

At the top of the `SettingsPage` component (after the existing `useState`/`useEffect` calls), add:

```typescript
type WAStatus = {
  status: 'disconnected' | 'qr_pending' | 'connected'
  qrCode?: string
  connectedAt?: string
}

const [waStatus, setWaStatus] = useState<WAStatus>({ status: 'disconnected' })

useEffect(() => {
  let stopped = false

  async function poll() {
    try {
      const res = await fetch('/api/whatsapp/status')
      if (res.ok) {
        const data: WAStatus = await res.json()
        if (!stopped) setWaStatus(data)
        if (data.status === 'connected') return // stop polling
      }
    } catch {
      // network error — keep polling
    }
    if (!stopped) setTimeout(poll, 5000)
  }

  poll()
  return () => { stopped = true }
}, [])
```

**Step 2: Add the QRCode import**

At the top of the file, add:

```typescript
import QRCode from 'react-qr-code'
```

**Step 3: Replace the static WhatsApp block in JSX**

Find the existing WhatsApp `<div>` in the Connections section (around lines 133–138):

```tsx
<div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
  <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)', marginBottom: 4 }}>WhatsApp</p>
  <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.5 }}>
    Scan the QR code in your terminal when you start the background service (<code style={codeStyle}>cd service && npm run dev</code>).
  </p>
</div>
```

Replace it with:

```tsx
<div style={{ padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border)' }}>
  <p style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--color-ink-100)', marginBottom: 8 }}>WhatsApp</p>

  {waStatus.status === 'connected' && (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block' }} />
      <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-70)' }}>WhatsApp connected</span>
    </div>
  )}

  {waStatus.status === 'qr_pending' && waStatus.qrCode && (
    <div>
      <div style={{
        display: 'inline-block',
        padding: 'var(--space-3)',
        background: '#fff',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--color-border)',
        marginBottom: 'var(--space-3)',
      }}>
        <QRCode value={waStatus.qrCode} size={180} />
      </div>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.6 }}>
        Open WhatsApp → Linked Devices → Link a Device → scan this code.
        The QR refreshes automatically.
      </p>
    </div>
  )}

  {waStatus.status === 'disconnected' && (
    <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-40)', lineHeight: 1.5 }}>
      Waiting for service to start…
    </p>
  )}
</div>
```

**Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/app/(app)/settings/page.tsx
git commit -m "feat: show WhatsApp QR inline in Settings page"
```

---

### Task 6: Merge to main and deploy

**Step 1: Merge to main**

From the main worktree (`/Users/prakharmishra/Documents/Side Projects/Death to notifications`):

```bash
git merge feature/v1-build --no-edit
git push origin main
```

**Step 2: Run the Prisma migration on the production DB**

This must be run once against the production database (Neon). Set `DATABASE_URL` and `DIRECT_URL` to the production values from `.env.local`, then:

```bash
npx prisma migrate deploy
```

Expected: `1 migration applied.`

**Step 3: Verify Railway redeploys**

Railway will auto-deploy on the push. The service will now:
1. On boot: attempt WhatsApp connection
2. Baileys generates QR → service writes `qr_pending` + QR string to DB
3. User visits Settings → sees QR within 5 seconds
4. User scans → Baileys fires `connection === 'open'` → service writes `connected` to DB
5. Settings page detects `connected` → shows green dot, stops polling

**Step 4: Verify Vercel redeploys**

Vercel will also auto-deploy. After deploy, visit `/settings` and confirm the WhatsApp section shows "Waiting for service to start..." (not the old terminal instructions).

---

## What's NOT in this plan

- Per-user WhatsApp sessions (Phase 2 — see design doc)
- Disconnect button (not in v1 scope)
- Error states beyond "disconnected" (sufficient for v1)
- `qrcode-terminal` kept as fallback (removed — in-app is the canonical path now)
