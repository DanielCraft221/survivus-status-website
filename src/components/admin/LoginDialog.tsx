'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Lock, Eye, EyeOff, KeyRound } from 'lucide-react'

interface LoginDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onLogin: (user: { id: string; username: string; mustChangePwd: boolean }) => void
}

export function LoginDialog({ open, onOpenChange, onLogin }: LoginDialogProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Change password state
  const [mustChange, setMustChange] = useState(false)
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [changeLoading, setChangeLoading] = useState(false)
  const [changeError, setChangeError] = useState<string | null>(null)

  const resetAndClose = () => {
    setUsername('')
    setPassword('')
    setError(null)
    setMustChange(false)
    setCurrentPwd('')
    setNewPwd('')
    setConfirmPwd('')
    setChangeError(null)
    onOpenChange(false)
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Credenciais inválidas')
        return
      }

      if (data.user?.mustChangePwd) {
        setMustChange(true)
        return
      }

      onLogin(data.user)
      resetAndClose()
    } catch {
      setError('Erro de conexão. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const getToken = (): string | null => {
    const match = document.cookie.split(';').find(c => c.trim().startsWith('token='))
    return match ? match.trim().split('=')[1] || null : null
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangeError(null)

    if (newPwd.length < 8) {
      setChangeError('Nova senha deve ter no mínimo 8 caracteres.')
      return
    }
    if (newPwd !== confirmPwd) {
      setChangeError('As senhas não coincidem.')
      return
    }

    setChangeLoading(true)

    try {
      const token = getToken()
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      })

      const data = await res.json()

      if (!res.ok) {
        setChangeError(data.error || 'Erro ao alterar senha.')
        return
      }

      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: newPwd }),
      })

      const loginData = await loginRes.json()
      if (loginRes.ok && loginData.user) {
        onLogin(loginData.user)
        resetAndClose()
      } else {
        setChangeError('Senha alterada. Faça login novamente.')
        setMustChange(false)
        setPassword('')
      }
    } catch {
      setChangeError('Erro de conexão. Tente novamente.')
    } finally {
      setChangeLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="sm:max-w-md">
        {!mustChange ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                  <Lock className="h-4 w-4 text-primary-foreground" />
                </div>
                Acesso Administrativo
              </DialogTitle>
              <DialogDescription>
                Insira suas credenciais para acessar o painel de administração.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleLogin} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="username">Usuário</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading || !username || !password}>
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Entrando...
                  </span>
                ) : (
                  'Entrar'
                )}
              </Button>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-white">
                  <KeyRound className="h-4 w-4" />
                </div>
                Alterar Senha
              </DialogTitle>
              <DialogDescription>
                Você precisa alterar sua senha antes de continuar.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleChangePassword} className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label htmlFor="currentPwd">Senha Atual</Label>
                <Input
                  id="currentPwd"
                  type="password"
                  placeholder="••••••••"
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="newPwd">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPwd"
                    type={showNewPwd ? 'text' : 'password'}
                    placeholder="Mínimo 8 caracteres"
                    value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)}
                    required
                    minLength={8}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd(!showNewPwd)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPwd">Confirmar Nova Senha</Label>
                <Input
                  id="confirmPwd"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  required
                />
              </div>

              {changeError && (
                <p className="text-sm text-red-500 dark:text-red-400">{changeError}</p>
              )}

              <Button type="submit" className="w-full" disabled={changeLoading || !currentPwd || !newPwd || !confirmPwd}>
                {changeLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Alterando...
                  </span>
                ) : (
                  'Alterar Senha'
                )}
              </Button>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}