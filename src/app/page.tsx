'use client'

import { useState, useSyncExternalStore } from 'react'
import { ThemeProvider } from 'next-themes'
import { StatusPage } from '@/components/status/StatusPage'
import { AdminPanel } from '@/components/admin/AdminPanel'
import { LoginDialog } from '@/components/admin/LoginDialog'

const emptySubscribe = () => () => {}

function useIsMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
}

function deleteAuthCookie() {
  // Use all the same flags as when the cookie was set to ensure deletion works
  document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict; Secure'
}

export default function HomePage() {
  const mounted = useIsMounted()
  const [view, setView] = useState<'public' | 'admin'>('public')
  const [user, setUser] = useState<{ id: string; username: string; mustChangePwd: boolean } | null>(null)
  const [showLogin, setShowLogin] = useState(false)

  const handleLogin = (userData: { id: string; username: string; mustChangePwd: boolean }) => {
    setUser(userData)
    setView('admin')
    setShowLogin(false)
  }

  const handleLogout = () => {
    deleteAuthCookie()
    setUser(null)
    setView('public')
  }

  if (!mounted) return null

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <div className="min-h-screen bg-background text-foreground">
        {view === 'public' ? (
          <StatusPage onAdminClick={() => setShowLogin(true)} />
        ) : (
          <AdminPanel user={user!} onLogout={handleLogout} />
        )}
        <LoginDialog
          open={showLogin}
          onOpenChange={setShowLogin}
          onLogin={handleLogin}
        />
      </div>
    </ThemeProvider>
  )
}