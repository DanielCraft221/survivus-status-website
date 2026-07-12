import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser, signToken, comparePassword } from '@/lib/auth'
import { checkRateLimit, clearRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').max(100),
  password: z.string().min(1, 'Password is required').max(1000),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    const parsed = loginSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    const { username, password } = parsed.data
    const ip = getRateLimitKey(request)
    const rateLimitKey = `${ip}:${username.trim().toLowerCase()}`

    // Check rate limit
    const rateCheck = checkRateLimit(rateLimitKey, RATE_LIMITS.login)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas tentativas. Tente novamente mais tarde.' },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil(rateCheck.retryAfterMs / 1000)) },
        }
      )
    }

    // Find user
    const user = await db.user.findUnique({ where: { username: username.trim() } })
    if (!user) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    // Compare password
    const valid = await comparePassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      )
    }

    // Clear rate limit on successful login
    clearRateLimit(rateLimitKey)

    // Create JWT token
    const token = await signToken({
      userId: user.id,
      username: user.username,
    })

    const response = NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        mustChangePwd: user.mustChangePwd,
      },
    })

    // Set cookie with strict security
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 86400,
    })

    return response
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}