import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/Sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar />
      <main style={{
        flex: 1,
        background: 'var(--color-bg)',
        overflowY: 'auto',
        padding: 'var(--space-8)',
      }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  )
}
