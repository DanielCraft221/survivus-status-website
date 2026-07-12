import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser, comparePassword, hashPassword } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual é obrigatória').max(1000),
  newPassword: z
    .string()
    .min(8, 'Nova senha deve ter no mínimo 8 caracteres')
    .max(128, 'Nova senha muito longa')
    .regex(/[A-Z]/, 'Nova senha deve conter ao menos uma letra maiúscula')
    .regex(/[a-z]/, 'Nova senha deve conter ao menos uma letra minúscula')
    .regex(/[0-9]/, 'Nova senha deve conter ao menos um número'),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    // Rate limit per-user
    const rateKey = getRateLimitKey(request, `chgpwd:${user.userId}`)
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.passwordChange)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente mais tarde.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        }
      )
    }

    const body = await request.json()

    const parsed = changePasswordSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = parsed.data

    // Prevent password reuse (new must differ from current)
    if (currentPassword === newPassword) {
      return NextResponse.json(
        { error: 'A nova senha deve ser diferente da senha atual' },
        { status: 400 }
      )
    }

    // Get current user with password hash
    const dbUser = await db.user.findUnique({ where: { id: user.userId } })
    if (!dbUser) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })
    }

    // Verify current password
    const valid = await comparePassword(currentPassword, dbUser.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Senha atual incorreta' },
        { status: 400 }
      )
    }

    // Hash new password and update
    const hashedPassword = await hashPassword(newPassword)
    await db.user.update({
      where: { id: user.userId },
      data: {
        passwordHash: hashedPassword,
        mustChangePwd: false,
      },
    })

    return NextResponse.json({ message: 'Senha alterada com sucesso' })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}