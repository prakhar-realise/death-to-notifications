# Death to Notifications — v1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified inbox web app that reads incoming WhatsApp and Slack messages from specific contacts/channels, lets the user reply from the app, and convert messages into tracked tasks.

**Architecture:** Two services sharing one PostgreSQL database. Next.js app (Vercel) handles the frontend and API routes. A separate Node.js background service (Railway) runs baileys (WhatsApp) and receives Slack webhooks, writing all messages to the shared database. Frontend polls the API every 5 seconds to show new messages.

**Tech Stack:** Next.js 14, TypeScript, PostgreSQL (Supabase), Prisma ORM, NextAuth.js, baileys (@whiskeysockets/baileys), @slack/bolt, Tailwind CSS, Jest + @testing-library/react, Vercel + Railway

---

## Project Structure

```
death-to-notifications/
├── prisma/
│   └── schema.prisma           ← shared DB schema (used by both services)
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── messages/
│   │   │   │   ├── route.ts           ← GET /api/messages
│   │   │   │   └── [id]/read/route.ts ← PUT /api/messages/:id/read
│   │   │   ├── tasks/
│   │   │   │   ├── route.ts           ← GET + POST /api/tasks
│   │   │   │   └── [id]/route.ts      ← PUT /api/tasks/:id
│   │   │   ├── replies/route.ts       ← POST /api/replies
│   │   │   └── sources/
│   │   │       ├── route.ts           ← GET + POST /api/sources
│   │   │       └── [id]/route.ts      ← PUT /api/sources/:id
│   │   ├── (auth)/login/page.tsx
│   │   ├── inbox/page.tsx
│   │   ├── tasks/page.tsx
│   │   ├── settings/page.tsx
│   │   └── layout.tsx
│   ├── components/
│   │   ├── Sidebar.tsx
│   │   ├── MessageList.tsx
│   │   ├── MessageModal.tsx
│   │   ├── TaskList.tsx
│   │   └── TaskModal.tsx
│   └── lib/
│       ├── prisma.ts            ← Prisma client singleton
│       └── auth.ts              ← NextAuth config
├── service/                     ← background service (separate Node.js app)
│   ├── src/
│   │   ├── index.ts
│   │   ├── whatsapp.ts
│   │   └── slack.ts
│   ├── package.json
│   └── tsconfig.json
├── __tests__/
│   └── api/
│       ├── messages.test.ts
│       ├── tasks.test.ts
│       ├── replies.test.ts
│       └── sources.test.ts
├── docs/plans/
├── .env
├── package.json
└── tsconfig.json
```

---

## Before You Start

**You will need accounts on:**
- [github.com](https://github.com) — already set up
- [supabase.com](https://supabase.com) — free, sign up now
- [vercel.com](https://vercel.com) — free, sign up with GitHub
- [railway.app](https://railway.app) — free tier, sign up with GitHub

**Tools to install on your machine:**
```bash
# Check if Node.js is installed (need version 18+)
node --version

# If not installed, go to nodejs.org and download the LTS version

# Check if git is installed
git --version
```

---

## Task 1: Initialize the Next.js Project

**Files:**
- Create: entire project scaffold via CLI

**Step 1: Clone your GitHub repo and scaffold the Next.js app**

```bash
# Navigate to your projects folder
cd "/Users/prakharmishra/Documents/Side Projects/Death to notifications"

# Create the Next.js app (answer the prompts as shown below)
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
```

When prompted:
- Would you like to use TypeScript? → Yes
- Would you like to use ESLint? → Yes
- Would you like to use Tailwind CSS? → Yes
- Would you like to use `src/` directory? → Yes
- Would you like to use App Router? → Yes
- Would you like to customize the default import alias? → Yes, keep `@/*`

**Step 2: Install project dependencies**

```bash
npm install prisma @prisma/client
npm install next-auth@beta @auth/prisma-adapter
npm install zod
npm install --save-dev jest @types/jest ts-jest jest-environment-jsdom
npm install --save-dev @testing-library/react @testing-library/jest-dom
```

**Step 3: Verify the dev server starts**

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the default Next.js welcome page.

Stop the server with `Ctrl+C`.

**Step 4: Set up Jest config**

Create `jest.config.ts` at the project root:

```typescript
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'node',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
```

Create `jest.setup.ts` at the project root:

```typescript
import '@testing-library/jest-dom'
```

**Step 5: Commit**

```bash
git add .
git commit -m "feat: initialize Next.js 14 project with TypeScript and Tailwind"
```

---

## Task 2: Set Up Supabase and Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`
- Create: `.env`
- Create: `.env.example`

**Step 1: Create a Supabase project**

1. Go to [supabase.com](https://supabase.com) and sign in
2. Click "New Project"
3. Name it `death-to-notifications`, choose a region close to you, set a strong database password — **save this password somewhere safe**
4. Wait ~2 minutes for the project to provision
5. Go to Project Settings → Database → Connection string → URI
6. Copy the connection string — it looks like:
   `postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres`

**Step 2: Create your `.env` file**

Create `.env` at the project root (this file is secret — never commit it):

```bash
# Database (from Supabase)
DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres:[YOUR-PASSWORD]@db.xxxxx.supabase.co:5432/postgres"

# Auth (generate a random secret: run `openssl rand -base64 32` in terminal)
NEXTAUTH_SECRET="your-random-secret-here"
NEXTAUTH_URL="http://localhost:3000"
```

Create `.env.example` (safe to commit, no real values):

```bash
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
NEXTAUTH_SECRET="generate with: openssl rand -base64 32"
NEXTAUTH_URL="http://localhost:3000"
```

**Step 3: Initialize Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

**Step 4: Write the Prisma schema**

Replace the contents of `prisma/schema.prisma` with:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  createdAt     DateTime  @default(now())
  messages      Message[]
  tasks         Task[]
  sources       WatchedSource[]
  replies       Reply[]
}

enum Source {
  whatsapp
  slack
}

enum MessageStatus {
  unread
  read
  converted
  replied
}

model Message {
  id          String        @id @default(cuid())
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  source      Source
  externalId  String
  senderName  String
  content     String
  receivedAt  DateTime      @default(now())
  status      MessageStatus @default(unread)
  threadRef   String?
  task        Task?
  taskId      String?       @unique
  replies     Reply[]

  @@unique([userId, source, externalId])
}

enum TaskStatus {
  open
  done
}

model Task {
  id            String     @id @default(cuid())
  userId        String
  user          User       @relation(fields: [userId], references: [id])
  title         String
  notes         String?
  sourceMessage Message?   @relation(fields: [sourceMsgId], references: [id])
  sourceMsgId   String?    @unique
  dueDate       DateTime?
  status        TaskStatus @default(open)
  createdAt     DateTime   @default(now())
}

model WatchedSource {
  id          String  @id @default(cuid())
  userId      String
  user        User    @relation(fields: [userId], references: [id])
  source      Source
  externalId  String
  displayName String
  isActive    Boolean @default(true)

  @@unique([userId, source, externalId])
}

enum ReplyStatus {
  pending
  sent
  failed
}

model Reply {
  id        String      @id @default(cuid())
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  messageId String
  message   Message     @relation(fields: [messageId], references: [id])
  content   String
  sentAt    DateTime?
  status    ReplyStatus @default(pending)
}
```

**Step 5: Run the migration**

```bash
npx prisma migrate dev --name init
```

Expected output: `Your database is now in sync with your schema.`

**Step 6: Verify in Supabase**

Go to your Supabase project → Table Editor. You should see the five tables: `User`, `Message`, `Task`, `WatchedSource`, `Reply`.

**Step 7: Commit**

```bash
git add prisma/ .env.example
git commit -m "feat: add Prisma schema with users, messages, tasks, sources, replies"
```

---

## Task 3: Prisma Client Singleton and Auth Setup

**Files:**
- Create: `src/lib/prisma.ts`
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`

**Step 1: Create the Prisma client singleton**

Create `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**What this does:** In development, Next.js reloads your code on every change. Without this singleton, you'd create hundreds of database connections. This reuses one connection across reloads.

**Step 2: Write the auth config**

Create `src/lib/auth.ts`:

```typescript
import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user) return null

        const passwordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        )

        if (!passwordValid) return null

        return { id: user.id, email: user.email }
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id
      return token
    },
    session({ session, token }) {
      if (token) session.user.id = token.id as string
      return session
    },
  },
}
```

**Step 3: Install bcryptjs**

```bash
npm install bcryptjs
npm install --save-dev @types/bcryptjs
```

**Step 4: Create the NextAuth API route**

Create `src/app/api/auth/[...nextauth]/route.ts`:

```typescript
import NextAuth from 'next-auth'
import { authOptions } from '@/lib/auth'

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
```

**Step 5: Create a seed script to create your first user**

Create `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('changeme123', 12)

  const user = await prisma.user.upsert({
    where: { email: 'your@email.com' },
    update: {},
    create: {
      email: 'your@email.com',
      passwordHash,
    },
  })

  console.log('Created user:', user.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

Add to `package.json` (inside the existing `"scripts"` block):
```json
"seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
```

Run the seed:
```bash
npm install --save-dev ts-node
npx prisma db seed
```

**Step 6: Extend Next.js session types**

Create `src/types/next-auth.d.ts`:

```typescript
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
    }
  }
}
```

**Step 7: Commit**

```bash
git add src/ prisma/seed.ts
git commit -m "feat: add Prisma singleton, NextAuth credentials auth, seed script"
```

---

## Task 4: Messages API Routes

**Files:**
- Create: `src/app/api/messages/route.ts`
- Create: `src/app/api/messages/[id]/read/route.ts`
- Create: `__tests__/api/messages.test.ts`

**Step 1: Write the failing tests**

Create `__tests__/api/messages.test.ts`:

```typescript
import { prisma } from '@/lib/prisma'

// Mock Prisma so tests don't hit the real database
jest.mock('@/lib/prisma', () => ({
  prisma: {
    message: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}))

// Mock NextAuth getServerSession
jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { GET } from '@/app/api/messages/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('GET /api/messages', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
  })

  it('returns 401 when not authenticated', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('returns unread messages for the current user', async () => {
    const mockMessages = [
      {
        id: 'msg-1',
        userId: 'user-1',
        source: 'slack',
        senderName: 'Alice',
        content: 'Can you review this?',
        status: 'unread',
        receivedAt: new Date(),
      },
    ]
    ;(prisma.message.findMany as jest.Mock).mockResolvedValue(mockMessages)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0].senderName).toBe('Alice')
    expect(prisma.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: 'user-1', status: 'unread' }),
      })
    )
  })
})
```

**Step 2: Run the test to verify it fails**

```bash
npx jest __tests__/api/messages.test.ts --no-coverage
```

Expected: FAIL — `Cannot find module '@/app/api/messages/route'`

**Step 3: Implement GET /api/messages**

Create `src/app/api/messages/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const messages = await prisma.message.findMany({
    where: {
      userId: session.user.id,
      status: 'unread',
    },
    orderBy: { receivedAt: 'desc' },
  })

  return NextResponse.json(messages)
}
```

**Step 4: Run the test to verify it passes**

```bash
npx jest __tests__/api/messages.test.ts --no-coverage
```

Expected: PASS

**Step 5: Implement PUT /api/messages/:id/read**

Create `src/app/api/messages/[id]/read/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const message = await prisma.message.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { status: 'read' },
  })

  if (message.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

**Note:** `updateMany` with both `id` and `userId` in the where clause ensures a user can only update their own messages. Security built into the query.

**Step 6: Commit**

```bash
git add src/app/api/messages/ __tests__/api/messages.test.ts
git commit -m "feat: add messages API routes with auth guard"
```

---

## Task 5: Tasks API Routes

**Files:**
- Create: `src/app/api/tasks/route.ts`
- Create: `src/app/api/tasks/[id]/route.ts`
- Create: `__tests__/api/tasks.test.ts`

**Step 1: Write the failing tests**

Create `__tests__/api/tasks.test.ts`:

```typescript
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    task: {
      findMany: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      updateMany: jest.fn(),
    },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { GET, POST } from '@/app/api/tasks/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('GET /api/tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
  })

  it('returns 401 when not authenticated', async () => {
    ;(getServerSession as jest.Mock).mockResolvedValue(null)
    const response = await GET()
    expect(response.status).toBe(401)
  })

  it('returns open tasks for the current user', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        userId: 'user-1',
        title: 'Review deck',
        status: 'open',
        dueDate: new Date(),
      },
    ]
    ;(prisma.task.findMany as jest.Mock).mockResolvedValue(mockTasks)

    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0].title).toBe('Review deck')
  })
})

describe('POST /api/tasks', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
  })

  it('creates a task and returns 201', async () => {
    const newTask = { id: 'task-2', title: 'New task', status: 'open' }
    ;(prisma.task.create as jest.Mock).mockResolvedValue(newTask)

    const request = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'New task', dueDate: '2026-03-10' }),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
  })

  it('returns 400 if title is missing', async () => {
    const request = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json' },
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
```

**Step 2: Run tests to verify they fail**

```bash
npx jest __tests__/api/tasks.test.ts --no-coverage
```

Expected: FAIL

**Step 3: Implement GET and POST /api/tasks**

Create `src/app/api/tasks/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createTaskSchema = z.object({
  title: z.string().min(1),
  notes: z.string().optional(),
  sourceMsgId: z.string().optional(),
  dueDate: z.string().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tasks = await prisma.task.findMany({
    where: { userId: session.user.id, status: 'open' },
    orderBy: { dueDate: 'asc' },
    include: { sourceMessage: true },
  })

  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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

  // If created from a message, mark that message as converted
  if (sourceMsgId) {
    await prisma.message.updateMany({
      where: { id: sourceMsgId, userId: session.user.id },
      data: { status: 'converted', taskId: task.id },
    })
  }

  return NextResponse.json(task, { status: 201 })
}
```

Create `src/app/api/tasks/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  notes: z.string().optional(),
  dueDate: z.string().optional(),
  status: z.enum(['open', 'done']).optional(),
})

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const result = updateTaskSchema.safeParse(body)

  if (!result.success) {
    return NextResponse.json({ error: result.error.flatten() }, { status: 400 })
  }

  const { title, notes, dueDate, status } = result.data

  const updated = await prisma.task.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: {
      ...(title && { title }),
      ...(notes !== undefined && { notes }),
      ...(dueDate && { dueDate: new Date(dueDate) }),
      ...(status && { status }),
    },
  })

  if (updated.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

**Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/tasks.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/tasks/ __tests__/api/tasks.test.ts
git commit -m "feat: add tasks API routes with Zod validation"
```

---

## Task 6: Replies API Route

**Files:**
- Create: `src/app/api/replies/route.ts`
- Create: `__tests__/api/replies.test.ts`

**Step 1: Write the failing test**

Create `__tests__/api/replies.test.ts`:

```typescript
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    reply: { create: jest.fn() },
    message: { updateMany: jest.fn() },
  },
}))

jest.mock('next-auth', () => ({
  getServerSession: jest.fn(),
}))

import { getServerSession } from 'next-auth'
import { POST } from '@/app/api/replies/route'

const mockSession = { user: { id: 'user-1', email: 'test@test.com' } }

describe('POST /api/replies', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(getServerSession as jest.Mock).mockResolvedValue(mockSession)
    ;(prisma.reply.create as jest.Mock).mockResolvedValue({ id: 'reply-1' })
    ;(prisma.message.updateMany as jest.Mock).mockResolvedValue({ count: 1 })
  })

  it('returns 400 if messageId or content is missing', async () => {
    const request = new Request('http://localhost/api/replies', {
      method: 'POST',
      body: JSON.stringify({ content: 'hello' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('creates a reply and marks message as replied', async () => {
    const request = new Request('http://localhost/api/replies', {
      method: 'POST',
      body: JSON.stringify({ messageId: 'msg-1', content: 'On it!' }),
      headers: { 'Content-Type': 'application/json' },
    })
    const response = await POST(request)
    expect(response.status).toBe(201)
    expect(prisma.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'msg-1' }),
        data: expect.objectContaining({ status: 'replied' }),
      })
    )
  })
})
```

**Step 2: Run test to verify it fails**

```bash
npx jest __tests__/api/replies.test.ts --no-coverage
```

Expected: FAIL

**Step 3: Implement POST /api/replies**

Create `src/app/api/replies/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createReplySchema = z.object({
  messageId: z.string().min(1),
  content: z.string().min(1),
})

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
```

**Note:** The reply is saved with status `pending`. The background service will pick up pending replies, send them via WhatsApp/Slack, and update the status to `sent` or `failed`.

**Step 4: Run tests to verify they pass**

```bash
npx jest __tests__/api/replies.test.ts --no-coverage
```

Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/replies/ __tests__/api/replies.test.ts
git commit -m "feat: add replies API route - saves reply, marks message as replied"
```

---

## Task 7: Sources API Routes

**Files:**
- Create: `src/app/api/sources/route.ts`
- Create: `src/app/api/sources/[id]/route.ts`

**Step 1: Implement GET and POST /api/sources**

Create `src/app/api/sources/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const createSourceSchema = z.object({
  source: z.enum(['whatsapp', 'slack']),
  externalId: z.string().min(1),
  displayName: z.string().min(1),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sources = await prisma.watchedSource.findMany({
    where: { userId: session.user.id },
    orderBy: { displayName: 'asc' },
  })

  return NextResponse.json(sources)
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
```

Create `src/app/api/sources/[id]/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function PUT(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { isActive } = await request.json()

  const updated = await prisma.watchedSource.updateMany({
    where: { id: params.id, userId: session.user.id },
    data: { isActive },
  })

  if (updated.count === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
```

**Step 2: Run all tests to confirm nothing is broken**

```bash
npx jest --no-coverage
```

Expected: all tests PASS

**Step 3: Commit**

```bash
git add src/app/api/sources/
git commit -m "feat: add sources API routes for managing watched contacts/channels"
```

---

## Task 8: Background Service Setup

**Files:**
- Create: `service/package.json`
- Create: `service/tsconfig.json`
- Create: `service/src/index.ts`

**Step 1: Initialize the background service**

```bash
mkdir -p service/src
cd service
npm init -y
```

**Step 2: Install service dependencies**

```bash
npm install @prisma/client @whiskeysockets/baileys @slack/bolt
npm install --save-dev typescript ts-node @types/node
```

**Step 3: Create `service/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

**Step 4: Update `service/package.json` scripts**

```json
{
  "name": "death-to-notifications-service",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  }
}
```

**Step 5: Set up Prisma client in the service**

The service uses the same Prisma schema. From the `service/` directory:

```bash
npx prisma generate --schema=../prisma/schema.prisma
```

Add to `service/package.json`:
```json
"prisma": {
  "schema": "../prisma/schema.prisma"
}
```

**Step 6: Create `service/src/index.ts`**

```typescript
import { startWhatsApp } from './whatsapp'
import { startSlack } from './slack'

async function main() {
  console.log('Starting Death to Notifications background service...')

  await Promise.all([
    startWhatsApp(),
    startSlack(),
  ])
}

main().catch(console.error)
```

**Step 7: Create `.env` in the service directory**

```bash
# service/.env — same DB credentials as root .env
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."
SLACK_BOT_TOKEN="xoxb-your-token"
SLACK_SIGNING_SECRET="your-signing-secret"
PORT=3001
```

**Step 8: Go back to root and commit**

```bash
cd ..
git add service/
git commit -m "feat: initialize background service with TypeScript"
```

---

## Task 9: WhatsApp Integration (baileys)

**Files:**
- Create: `service/src/whatsapp.ts`

**Step 1: Create the WhatsApp service**

Create `service/src/whatsapp.ts`:

```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import { PrismaClient } from '@prisma/client'
import path from 'path'

const prisma = new PrismaClient()

export async function startWhatsApp() {
  // Auth state is stored in a folder — this is the "session" that persists across restarts
  const { state, saveCreds } = await useMultiFileAuthState(
    path.join(__dirname, '../../auth_sessions/whatsapp')
  )

  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true, // Shows QR code in terminal on first run
  })

  // Save credentials whenever they update (keeps session alive)
  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('Scan this QR code with WhatsApp on your phone:')
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut

      console.log('WhatsApp connection closed. Reconnecting:', shouldReconnect)

      if (shouldReconnect) {
        startWhatsApp() // Reconnect automatically
      }
    }

    if (connection === 'open') {
      console.log('WhatsApp connected successfully')
    }
  })

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return // Only process new incoming messages

    for (const msg of messages) {
      if (msg.key.fromMe) continue // Skip messages sent by us
      if (!msg.message) continue // Skip empty messages

      const senderId = msg.key.remoteJid // WhatsApp ID of the sender
      if (!senderId) continue

      const content =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        ''

      if (!content) continue

      await saveMessageIfWatched({
        source: 'whatsapp',
        externalId: msg.key.id!,
        senderId,
        senderName: msg.pushName || senderId,
        content,
        threadRef: msg.key.participant || undefined,
      })
    }
  })

  // Also handle outgoing replies from our app
  // Poll the DB every 10 seconds for pending replies
  setInterval(async () => {
    await sendPendingReplies(sock)
  }, 10000)

  return sock
}

async function saveMessageIfWatched({
  source,
  externalId,
  senderId,
  senderName,
  content,
  threadRef,
}: {
  source: 'whatsapp'
  externalId: string
  senderId: string
  senderName: string
  content: string
  threadRef?: string
}) {
  // Find all users who are watching this sender
  const watchedSources = await prisma.watchedSource.findMany({
    where: {
      source,
      externalId: senderId,
      isActive: true,
    },
  })

  if (watchedSources.length === 0) return

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
  }

  console.log(`Saved WhatsApp message from ${senderName}`)
}

async function sendPendingReplies(sock: ReturnType<typeof makeWASocket>) {
  const pendingReplies = await prisma.reply.findMany({
    where: { status: 'pending' },
    include: { message: true },
  })

  for (const reply of pendingReplies) {
    if (reply.message.source !== 'whatsapp') continue

    try {
      await sock.sendMessage(reply.message.externalId, {
        text: reply.content,
      })

      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'sent', sentAt: new Date() },
      })

      console.log(`Sent WhatsApp reply: ${reply.id}`)
    } catch (error) {
      console.error(`Failed to send reply ${reply.id}:`, error)
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'failed' },
      })
    }
  }
}
```

**Step 2: Create the auth_sessions directory**

```bash
mkdir -p service/auth_sessions
echo "auth_sessions/" >> .gitignore
```

**Step 3: Test the WhatsApp connection manually**

```bash
cd service
npm run dev
```

A QR code will appear in your terminal. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan the QR code.

Expected: `WhatsApp connected successfully` appears in the terminal.

Press `Ctrl+C` to stop.

**Step 4: Commit**

```bash
cd ..
git add service/src/whatsapp.ts .gitignore
git commit -m "feat: add WhatsApp integration via baileys with message ingestion and reply sending"
```

---

## Task 10: Slack Integration

**Files:**
- Create: `service/src/slack.ts`

**Step 1: Set up a Slack App**

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → "Create New App" → "From scratch"
2. Name it "Death to Notifications", select your workspace
3. Go to "OAuth & Permissions" → Bot Token Scopes → Add:
   - `channels:history` (read public channel messages)
   - `groups:history` (read private channel messages)
   - `im:history` (read DMs)
   - `chat:write` (send messages)
   - `users:read` (get user info)
4. Click "Install to Workspace" → copy the **Bot User OAuth Token** (starts with `xoxb-`)
5. Go to "Basic Information" → copy the **Signing Secret**
6. Add both to `service/.env`

**Step 2: Enable Event Subscriptions**

1. In your Slack App → "Event Subscriptions" → toggle on
2. Request URL: `https://your-railway-url/slack/events` (you'll fill this in after deployment — skip for now)
3. Subscribe to bot events: `message.channels`, `message.groups`, `message.im`

**Step 3: Create the Slack service**

Create `service/src/slack.ts`:

```typescript
import { App } from '@slack/bolt'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function startSlack() {
  const app = new App({
    token: process.env.SLACK_BOT_TOKEN!,
    signingSecret: process.env.SLACK_SIGNING_SECRET!,
    socketMode: false,
    port: parseInt(process.env.PORT || '3001'),
  })

  // Listen for all messages in channels the bot is in
  app.message(async ({ message, client }) => {
    // Type guard — ensure it's a real message with text
    if (message.subtype || !('text' in message) || !message.text) return
    if (message.bot_id) return // Ignore bot messages

    const senderId = message.user
    const channelId = message.channel
    const externalId = message.ts // Slack's unique message timestamp
    const threadRef = message.thread_ts

    // Get sender's display name
    let senderName = senderId
    try {
      const userInfo = await client.users.info({ user: senderId })
      senderName = userInfo.user?.real_name || userInfo.user?.name || senderId
    } catch {
      // If we can't get the name, use the ID
    }

    await saveMessageIfWatched({
      externalId,
      senderId,
      channelId,
      senderName,
      content: message.text,
      threadRef,
    })
  })

  // Handle pending Slack replies every 10 seconds
  setInterval(async () => {
    await sendPendingSlackReplies(app.client)
  }, 10000)

  await app.start()
  console.log('Slack service running on port', process.env.PORT || 3001)
}

async function saveMessageIfWatched({
  externalId,
  senderId,
  channelId,
  senderName,
  content,
  threadRef,
}: {
  externalId: string
  senderId: string
  channelId: string
  senderName: string
  content: string
  threadRef?: string
}) {
  // Check if the user is watching this specific person OR this channel
  const watchedSources = await prisma.watchedSource.findMany({
    where: {
      source: 'slack',
      isActive: true,
      OR: [
        { externalId: senderId },   // Watching this specific person
        { externalId: channelId },  // Watching this channel
      ],
    },
  })

  if (watchedSources.length === 0) return

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
  }

  console.log(`Saved Slack message from ${senderName}`)
}

async function sendPendingSlackReplies(client: App['client']) {
  const pendingReplies = await prisma.reply.findMany({
    where: { status: 'pending' },
    include: { message: true },
  })

  for (const reply of pendingReplies) {
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

      console.log(`Sent Slack reply: ${reply.id}`)
    } catch (error) {
      console.error(`Failed to send Slack reply ${reply.id}:`, error)
      await prisma.reply.update({
        where: { id: reply.id },
        data: { status: 'failed' },
      })
    }
  }
}
```

**Step 4: Test the Slack connection**

```bash
cd service
npm run dev
```

Expected: `Slack service running on port 3001` and `WhatsApp connected successfully`

Send a message in a Slack channel where your bot is installed. Check your database (Supabase table editor) — you should see a row in the `Message` table.

**Step 5: Commit**

```bash
cd ..
git add service/src/slack.ts
git commit -m "feat: add Slack integration via Bolt with message ingestion and reply sending"
```

---

## Task 11: Frontend Layout and Login Page

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/components/Sidebar.tsx`
- Create: `src/app/providers.tsx`

**Step 1: Create the session provider wrapper**

Create `src/app/providers.tsx`:

```typescript
'use client'

import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>
}
```

**Step 2: Update root layout**

Replace `src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Death to Notifications',
  description: 'Your unified inbox',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

**Step 3: Create the login page**

Create `src/app/(auth)/login/page.tsx`:

```typescript
'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    })

    if (result?.error) {
      setError('Invalid email or password')
    } else {
      router.push('/inbox')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6 text-gray-900">
          Death to Notifications
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}

          <button
            type="submit"
            className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 4: Create the Sidebar component**

Create `src/components/Sidebar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

const navItems = [
  { href: '/inbox', label: 'Inbox' },
  { href: '/tasks', label: 'Tasks' },
  { href: '/settings', label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-48 min-h-screen bg-gray-900 text-white flex flex-col">
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-sm font-bold text-gray-100">Death to Notifications</h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm transition-colors ${
              pathname === item.href
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-gray-700">
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}
```

**Step 5: Create a shared authenticated layout**

Create `src/app/(app)/layout.tsx`:

```typescript
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-gray-50 p-6">{children}</main>
    </div>
  )
}
```

Move `inbox/`, `tasks/`, and `settings/` pages under `(app)/`:
```bash
mkdir -p src/app/\(app\)
mv src/app/inbox src/app/\(app\)/
mv src/app/tasks src/app/\(app\)/
mv src/app/settings src/app/\(app\)/
```

**Step 6: Test in browser**

```bash
npm run dev
```

Visit [http://localhost:3000/login](http://localhost:3000). Log in with `your@email.com` / `changeme123`.

You should see the sidebar and be redirected to `/inbox`.

**Step 7: Commit**

```bash
git add src/
git commit -m "feat: add login page, sidebar, and authenticated app layout"
```

---

## Task 12: Inbox Screen

**Files:**
- Create: `src/app/(app)/inbox/page.tsx`
- Create: `src/components/MessageList.tsx`
- Create: `src/components/MessageModal.tsx`

**Step 1: Create the polling hook**

Create `src/hooks/useMessages.ts`:

```typescript
'use client'

import { useState, useEffect } from 'react'

type Message = {
  id: string
  source: 'whatsapp' | 'slack'
  senderName: string
  content: string
  receivedAt: string
  status: string
}

export function useMessages() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchMessages() {
    try {
      const res = await fetch('/api/messages')
      if (res.ok) {
        const data = await res.json()
        setMessages(data)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 5000) // Poll every 5s
    return () => clearInterval(interval) // Cleanup on unmount
  }, [])

  return { messages, loading, refresh: fetchMessages }
}
```

**Step 2: Create the MessageModal component**

Create `src/components/MessageModal.tsx`:

```typescript
'use client'

import { useState } from 'react'

type Message = {
  id: string
  source: 'whatsapp' | 'slack'
  senderName: string
  content: string
  receivedAt: string
}

type Props = {
  message: Message
  onClose: () => void
  onRefresh: () => void
}

export function MessageModal({ message, onClose, onRefresh }: Props) {
  const [reply, setReply] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')
  const [view, setView] = useState<'default' | 'reply' | 'task'>('default')
  const [sending, setSending] = useState(false)

  async function sendReply() {
    setSending(true)
    await fetch('/api/replies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: message.id, content: reply }),
    })
    setSending(false)
    onRefresh()
    onClose()
  }

  async function createTask() {
    setSending(true)
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: taskTitle || message.content.slice(0, 60),
        sourceMsgId: message.id,
        dueDate: taskDue || undefined,
      }),
    })
    setSending(false)
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <span
              className={`text-xs font-medium px-2 py-1 rounded ${
                message.source === 'whatsapp'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-purple-100 text-purple-700'
              }`}
            >
              {message.source === 'whatsapp' ? 'WhatsApp' : 'Slack'}
            </span>
            <p className="font-semibold text-gray-900 mt-2">{message.senderName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ×
          </button>
        </div>

        <p className="text-gray-800 mb-6 whitespace-pre-wrap">{message.content}</p>

        {view === 'default' && (
          <div className="flex gap-3">
            <button
              onClick={() => setView('reply')}
              className="flex-1 border border-gray-300 text-gray-700 py-2 rounded text-sm hover:bg-gray-50"
            >
              Reply
            </button>
            <button
              onClick={() => setView('task')}
              className="flex-1 bg-gray-900 text-white py-2 rounded text-sm hover:bg-gray-700"
            >
              Create Task
            </button>
          </div>
        )}

        {view === 'reply' && (
          <div className="space-y-3">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Type your reply..."
              className="w-full border border-gray-300 rounded p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setView('default')}
                className="flex-1 border border-gray-300 py-2 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={sendReply}
                disabled={!reply.trim() || sending}
                className="flex-1 bg-gray-900 text-white py-2 rounded text-sm disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send'}
              </button>
            </div>
          </div>
        )}

        {view === 'task' && (
          <div className="space-y-3">
            <input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={message.content.slice(0, 60)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="date"
              value={taskDue}
              onChange={(e) => setTaskDue(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setView('default')}
                className="flex-1 border border-gray-300 py-2 rounded text-sm"
              >
                Cancel
              </button>
              <button
                onClick={createTask}
                disabled={sending}
                className="flex-1 bg-gray-900 text-white py-2 rounded text-sm disabled:opacity-50"
              >
                {sending ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Step 3: Create the Inbox page**

Create `src/app/(app)/inbox/page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useMessages } from '@/hooks/useMessages'
import { MessageModal } from '@/components/MessageModal'

type Message = {
  id: string
  source: 'whatsapp' | 'slack'
  senderName: string
  content: string
  receivedAt: string
  status: string
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export default function InboxPage() {
  const { messages, loading, refresh } = useMessages()
  const [selected, setSelected] = useState<Message | null>(null)

  if (loading) {
    return <p className="text-gray-500 text-sm">Loading...</p>
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Inbox{' '}
        {messages.length > 0 && (
          <span className="text-sm text-gray-500 font-normal">
            ({messages.length} unread)
          </span>
        )}
      </h2>

      {messages.length === 0 ? (
        <p className="text-gray-500 text-sm">No unread messages. You&apos;re clear.</p>
      ) : (
        <div className="space-y-2">
          {messages.map((msg) => (
            <button
              key={msg.id}
              onClick={() => setSelected(msg)}
              className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded ${
                      msg.source === 'whatsapp'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {msg.source === 'whatsapp' ? 'WhatsApp' : 'Slack'}
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {msg.senderName}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{timeAgo(msg.receivedAt)}</span>
              </div>
              <p className="text-sm text-gray-600 truncate">{msg.content}</p>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <MessageModal
          message={selected}
          onClose={() => setSelected(null)}
          onRefresh={refresh}
        />
      )}
    </div>
  )
}
```

**Step 4: Test in browser**

```bash
npm run dev
```

Visit [http://localhost:3000/inbox](http://localhost:3000/inbox). The inbox should load, show "No unread messages" if empty, and show a message list if any exist in the database.

**Step 5: Commit**

```bash
git add src/
git commit -m "feat: add inbox screen with polling, message modal, reply and task creation"
```

---

## Task 13: Tasks Screen

**Files:**
- Create: `src/app/(app)/tasks/page.tsx`
- Create: `src/components/TaskModal.tsx`

**Step 1: Create the TaskModal**

Create `src/components/TaskModal.tsx`:

```typescript
'use client'

import { useState } from 'react'

type Task = {
  id: string
  title: string
  notes?: string
  dueDate?: string
  status: string
  createdAt: string
  sourceMessage?: { content: string; senderName: string; source: string }
}

type Props = {
  task: Task
  onClose: () => void
  onRefresh: () => void
}

export function TaskModal({ task, onClose, onRefresh }: Props) {
  const [saving, setSaving] = useState(false)

  async function markDone() {
    setSaving(true)
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    setSaving(false)
    onRefresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <h3 className="font-semibold text-gray-900 text-lg">{task.title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ×
          </button>
        </div>

        {task.dueDate && (
          <p className="text-sm text-gray-500 mb-3">
            Due: {new Date(task.dueDate).toLocaleDateString('en-GB')}
          </p>
        )}

        {task.notes && (
          <p className="text-gray-700 text-sm mb-4 whitespace-pre-wrap">{task.notes}</p>
        )}

        {task.sourceMessage && (
          <div className="bg-gray-50 rounded p-3 mb-4">
            <p className="text-xs text-gray-500 mb-1">
              Created from {task.sourceMessage.source} · {task.sourceMessage.senderName}
            </p>
            <p className="text-sm text-gray-700">{task.sourceMessage.content}</p>
          </div>
        )}

        <button
          onClick={markDone}
          disabled={saving}
          className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {saving ? 'Marking done...' : 'Mark as Done'}
        </button>
      </div>
    </div>
  )
}
```

**Step 2: Create the Tasks page**

Create `src/app/(app)/tasks/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { TaskModal } from '@/components/TaskModal'

type Task = {
  id: string
  title: string
  notes?: string
  dueDate?: string
  status: string
  createdAt: string
  sourceMessage?: { content: string; senderName: string; source: string }
}

function getRag(dueDate?: string): { color: string; label: string } {
  if (!dueDate) return { color: 'bg-gray-300', label: 'No date' }
  const days = Math.ceil(
    (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  if (days < 0) return { color: 'bg-red-500', label: `${Math.abs(days)}d overdue` }
  if (days <= 3) return { color: 'bg-amber-400', label: `${days}d left` }
  return { color: 'bg-green-500', label: `${days}d left` }
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Task | null>(null)

  async function fetchTasks() {
    const res = await fetch('/api/tasks')
    if (res.ok) setTasks(await res.json())
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  if (loading) return <p className="text-gray-500 text-sm">Loading...</p>

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Open Tasks{' '}
        {tasks.length > 0 && (
          <span className="text-sm text-gray-500 font-normal">({tasks.length})</span>
        )}
      </h2>

      {tasks.length === 0 ? (
        <p className="text-gray-500 text-sm">No open tasks.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const rag = getRag(task.dueDate)
            return (
              <button
                key={task.id}
                onClick={() => setSelected(task)}
                className="w-full text-left bg-white rounded-lg border border-gray-200 p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${rag.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {task.title}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400 flex-shrink-0">{rag.label}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {selected && (
        <TaskModal
          task={selected}
          onClose={() => setSelected(null)}
          onRefresh={fetchTasks}
        />
      )}
    </div>
  )
}
```

**Step 3: Test in browser**

Visit [http://localhost:3000/tasks](http://localhost:3000/tasks). Create a task from the inbox screen. It should appear here with a RAG dot.

**Step 4: Commit**

```bash
git add src/
git commit -m "feat: add tasks screen with RAG status and task modal"
```

---

## Task 14: Settings Screen

**Files:**
- Create: `src/app/(app)/settings/page.tsx`

Create `src/app/(app)/settings/page.tsx`:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'

type Source = {
  id: string
  source: 'whatsapp' | 'slack'
  externalId: string
  displayName: string
  isActive: boolean
}

export default function SettingsPage() {
  const { data: session } = useSession()
  const [sources, setSources] = useState<Source[]>([])
  const [newSource, setNewSource] = useState({
    source: 'slack' as 'whatsapp' | 'slack',
    externalId: '',
    displayName: '',
  })

  async function fetchSources() {
    const res = await fetch('/api/sources')
    if (res.ok) setSources(await res.json())
  }

  async function addSource() {
    if (!newSource.externalId || !newSource.displayName) return
    await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSource),
    })
    setNewSource({ source: 'slack', externalId: '', displayName: '' })
    fetchSources()
  }

  async function toggleSource(id: string, isActive: boolean) {
    await fetch(`/api/sources/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !isActive }),
    })
    fetchSources()
  }

  useEffect(() => {
    fetchSources()
  }, [])

  return (
    <div className="max-w-2xl space-y-8">
      <h2 className="text-lg font-semibold text-gray-900">Settings</h2>

      {/* Account */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Account
        </h3>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-700">
            Signed in as <span className="font-medium">{session?.user?.email}</span>
          </p>
        </div>
      </section>

      {/* Connections */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Connections
        </h3>
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">WhatsApp</p>
            <p className="text-xs text-gray-500 mt-1">
              Connected via the background service. Scan the QR code in your terminal
              when you start the service for the first time.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">Slack</p>
            <p className="text-xs text-gray-500 mt-1">
              Connected via the Slack Bot token in your background service .env file.
            </p>
          </div>
        </div>
      </section>

      {/* Watched Sources */}
      <section>
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Watched Sources
        </h3>

        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
          {sources.length === 0 && (
            <p className="text-sm text-gray-500 p-4">
              No sources yet. Add contacts or channels below.
            </p>
          )}
          {sources.map((src) => (
            <div key={src.id} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium text-gray-900">{src.displayName}</p>
                <p className="text-xs text-gray-400">
                  {src.source} · {src.externalId}
                </p>
              </div>
              <button
                onClick={() => toggleSource(src.id, src.isActive)}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  src.isActive
                    ? 'bg-gray-900 text-white hover:bg-gray-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {src.isActive ? 'Active' : 'Paused'}
              </button>
            </div>
          ))}
        </div>

        {/* Add new source */}
        <div className="mt-4 bg-white rounded-lg border border-gray-200 p-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-900">Add a Source</h4>
          <select
            value={newSource.source}
            onChange={(e) =>
              setNewSource({ ...newSource, source: e.target.value as 'whatsapp' | 'slack' })
            }
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            <option value="slack">Slack</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
          <input
            value={newSource.displayName}
            onChange={(e) => setNewSource({ ...newSource, displayName: e.target.value })}
            placeholder="Display name (e.g. Alice, #product-team)"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <input
            value={newSource.externalId}
            onChange={(e) => setNewSource({ ...newSource, externalId: e.target.value })}
            placeholder={
              newSource.source === 'slack'
                ? 'Slack user ID or channel ID (e.g. U0123ABCD)'
                : 'WhatsApp number with country code (e.g. 919876543210)'
            }
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
          />
          <button
            onClick={addSource}
            className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-700"
          >
            Add Source
          </button>
        </div>
      </section>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/app/\(app\)/settings/
git commit -m "feat: add settings screen with source management"
```

---

## Task 15: Deploy to Vercel and Railway

### Deploy Next.js to Vercel

**Step 1: Push all code to GitHub**

```bash
git push origin main
```

**Step 2: Deploy to Vercel**

1. Go to [vercel.com](https://vercel.com) → "Add New Project"
2. Import your GitHub repository
3. Vercel auto-detects Next.js — click "Deploy"
4. Once deployed, go to Project Settings → Environment Variables
5. Add all variables from your `.env`:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` → set to your Vercel URL (e.g. `https://death-to-notifications.vercel.app`)

**Step 3: Redeploy with environment variables**

In Vercel dashboard → Deployments → Redeploy.

### Deploy Background Service to Railway

**Step 1: Create a `Dockerfile` for the service**

Create `service/Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc

CMD ["node", "dist/index.js"]
```

**Step 2: Deploy to Railway**

1. Go to [railway.app](https://railway.app) → "New Project" → "Deploy from GitHub repo"
2. Select your repo, set the root directory to `service/`
3. Add environment variables:
   - `DATABASE_URL`
   - `DIRECT_URL`
   - `SLACK_BOT_TOKEN`
   - `SLACK_SIGNING_SECRET`
   - `PORT` → `3001`

**Step 3: Update Slack Event Subscriptions URL**

1. Get your Railway service URL (e.g. `https://death-to-notifications.up.railway.app`)
2. Go to your Slack App → Event Subscriptions → Request URL:
   `https://your-railway-url/slack/events`
3. Slack will send a verification request — Railway must be running for this to work

**Step 4: Verify end-to-end**

1. Go to your Vercel URL and log in
2. Add a Slack channel to your watched sources in Settings
3. Send a message in that Slack channel
4. Within 5 seconds, it should appear in your Inbox

---

## Done

You now have a working v1 of Death to Notifications:
- Unified inbox (WhatsApp + Slack) polling every 5 seconds
- Reply to messages from the app (flows back to the original channel)
- Convert messages to tracked tasks with RAG status
- Multi-user architecture ready to scale

**Next features to build (v2):**
- Calendar sync (create Google Calendar events from tasks with due dates)
- Email integration (Gmail OAuth)
- Auto-reply confirmation when task is created from a message
- Mobile app (React Native, same API)
