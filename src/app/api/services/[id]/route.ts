import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

// Whitelist of updatable fields to prevent mass assignment
const updateServiceSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  url: z.string().url('URL inválida').refine(
    (u) => u.startsWith('http://') || u.startsWith('https://'),
    'Apenas URLs HTTP/HTTPS são permitidas'
  ).optional(),
  method: z.enum(['GET', 'HEAD', 'POST']).optional(),
  timeout: z.number().min(5000).max(120000).optional(),
  interval: z.number().min(30).max(3600).optional(),
  active: z.boolean().optional(),
}).strict() // Reject any extra fields not in this schema

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const rateKey = getRateLimitKey(request, `mut:${user.userId}`)
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.authMutation)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const { id } = await params

    const existing = await db.service.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
    }

    const body = await request.json()

    const parsed = updateServiceSchema.safeParse({
      name: typeof body.name === 'string' ? body.name.trim() : body.name,
      description: typeof body.description === 'string' ? body.description.trim() : body.description,
      url: typeof body.url === 'string' ? body.url.trim() : body.url,
      method: body.method,
      timeout: body.timeout,
      interval: body.interval,
      active: body.active,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    // Explicitly build the update data from only allowed fields
    const updateData: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim()
    if (parsed.data.description !== undefined) updateData.description = parsed.data.description?.trim() ?? null
    if (parsed.data.url !== undefined) updateData.url = parsed.data.url.trim()
    if (parsed.data.method !== undefined) updateData.method = parsed.data.method
    if (parsed.data.timeout !== undefined) updateData.timeout = parsed.data.timeout
    if (parsed.data.interval !== undefined) updateData.interval = parsed.data.interval
    if (parsed.data.active !== undefined) updateData.active = parsed.data.active

    const updated = await db.service.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const rateKey = getRateLimitKey(request, `mut:${user.userId}`)
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.authMutation)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const { id } = await params

    const existing = await db.service.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Serviço não encontrado' }, { status: 404 })
    }

    await db.service.delete({ where: { id } })

    return NextResponse.json({ message: 'Serviço removido' })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}