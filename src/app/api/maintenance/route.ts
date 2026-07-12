import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const createMaintenanceSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().max(5000).optional(),
  startsAt: z.string().datetime('Formato de data inválido'),
  endsAt: z.string().datetime('Formato de data inválido').nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const rateKey = getRateLimitKey(request, 'public:maintenance')
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.publicRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const now = new Date()

    const maintenances = await db.maintenance.findMany({
      where: {
        OR: [
          { endsAt: { gt: now } },
          { active: true },
        ],
      },
      orderBy: { startsAt: 'asc' },
    })

    return NextResponse.json(maintenances)
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json()

    const parsed = createMaintenanceSchema.safeParse({
      title: typeof body.title === 'string' ? body.title.trim() : body.title,
      description: typeof body.description === 'string' ? body.description.trim() : body.description,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    const maintenance = await db.maintenance.create({
      data: {
        title: parsed.data.title.trim(),
        description: parsed.data.description?.trim() || null,
        startsAt: new Date(parsed.data.startsAt),
        endsAt: parsed.data.endsAt ? new Date(parsed.data.endsAt) : null,
      },
    })

    return NextResponse.json(maintenance, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}