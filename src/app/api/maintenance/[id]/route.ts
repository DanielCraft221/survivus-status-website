import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const updateMaintenanceSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  startsAt: z.string().datetime().optional(),
  endsAt: z.string().datetime().nullable().optional(),
  active: z.boolean().optional(),
}).strict() // Reject unknown fields

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

    const existing = await db.maintenance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Manutenção não encontrada' }, { status: 404 })
    }

    const body = await request.json()

    const parsed = updateMaintenanceSchema.safeParse({
      title: typeof body.title === 'string' ? body.title.trim() : body.title,
      description: typeof body.description === 'string' ? body.description.trim() : body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      active: body.active,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    // Explicitly build update data from only allowed fields
    const data: Record<string, unknown> = {}
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim()
    if (parsed.data.description !== undefined) data.description = parsed.data.description?.trim() ?? null
    if (parsed.data.startsAt !== undefined) data.startsAt = new Date(parsed.data.startsAt)
    if (parsed.data.endsAt !== undefined) data.endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
    if (parsed.data.active !== undefined) data.active = parsed.data.active

    const updated = await db.maintenance.update({
      where: { id },
      data,
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

    const existing = await db.maintenance.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Manutenção não encontrada' }, { status: 404 })
    }

    await db.maintenance.delete({ where: { id } })

    return NextResponse.json({ message: 'Manutenção removida' })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}