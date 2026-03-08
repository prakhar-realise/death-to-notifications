import * as dotenv from 'dotenv'
dotenv.config()

async function main() {
  console.log('Death to Notifications — background service starting...')
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✓ set' : '✗ missing')

  // WhatsApp and Slack stubs — implemented in Tasks 9 and 10
  console.log('Service ready. WhatsApp and Slack integrations coming next.')
}

main().catch(console.error)
