import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const passwordHash = await bcrypt.hash('changeme123', 12)

  const user = await prisma.user.upsert({
    where: { email: 'admin@deathtono.app' },
    update: {},
    create: {
      email: 'admin@deathtono.app',
      passwordHash,
    },
  })

  console.log('Seeded user:', user.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
