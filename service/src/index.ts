import * as dotenv from 'dotenv'
dotenv.config()

import { startWhatsApp } from './whatsapp.js'
import { startSlack } from './slack.js'

async function main() {
  console.log('Death to Notifications — background service starting...')
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ set' : '✗ missing')

  await Promise.all([
    startWhatsApp(),
    startSlack(),
  ])
}

main().catch(console.error)
