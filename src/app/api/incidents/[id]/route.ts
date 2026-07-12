import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

// Strict schema to prevent mass assignment - only these fields are updatable
const updateIncidentSchema = z.object({
  status: z.enum(['investigating', 'identified', 'monitoring', 'resolved']).optional(),
  title: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).nullable().optional(),
  endedAt: z.string().datetime().nullable().optional(),
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

    const existing = await db.incident.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Incidente não encontrado' }, { status: 404 })
    }

    const body = await request.json()

    const parsed = updateIncidentSchema.safeParse({
      title: typeof body.title === 'string' ? body.title.trim() : body.title,
      description: typeof body.description === 'string' ? body.description.trim() : body.description,
      status: body.status,
      endedAt: body.endedAt,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    const data: Record<string, unknown> = {}

    // Explicitly build update data from only allowed fields
    if (parsed.data.status !== undefined) data.status = parsed.data.status
    if (parsed.data.title !== undefined) data.title = parsed.data.title.trim()
    if (parsed.data.description !== undefined) data.description = parsed.data.description?.trim() ?? null

    // If status is resolved and no endedAt provided, set it to now
    if (parsed.data.status === 'resolved' && !parsed.data.endedAt) {
      data.endedAt = new Date()
    } else if (parsed.data.endedAt !== undefined) {
      data.endedAt = new Date(parsed.data.endedAt)
    }

    // Calculate duration if we have both startedAt and endedAt
    const endedAtValue = data.endedAt ?? existing.endedAt
    if (endedAtValue) {
      const startedAt = existing.startedAt.getTime()
      const ended = new Date(endedAtValue as Date).getTime()
      data.duration = Math.round((ended - startedAt) / 1000)
    }

    const updated = await db.incident.update({
      where: { id },
      data,
      include: {
        service: {
          select: { id: true, name: true },
        },
      },
    })

    return NextResponse.json(updated)
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}