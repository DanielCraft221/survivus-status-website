import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthUser } from '@/lib/auth'
import { getAvailability, getAvgLatency } from '@/lib/stats'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const createServiceSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  url: z.string().url('URL inválida').refine(
    (u) => u.startsWith('http://') || u.startsWith('https://'),
    'Apenas URLs HTTP/HTTPS são permitidas'
  ),
  method: z.enum(['GET', 'HEAD', 'POST']),
  timeout: z.number().min(5000).max(120000),
  interval: z.number().min(30).max(3600),
})

export async function GET(_request: NextRequest) {
  try {
    const user = await getAuthUser(_request)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const rateKey = getRateLimitKey(_request, `read:${user.userId}`)
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.authRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const services = await db.service.findMany({
      orderBy: { createdAt: 'desc' },
    })

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const enrichedServices = await Promise.all(
      services.map(async (service) => {
        const latestCheck = await db.checkHistory.findFirst({
          where: { serviceId: service.id },
          orderBy: { checkedAt: 'desc' },
        })

        const dailyStats = await db.dailyStats.findMany({
          where: {
            serviceId: service.id,
            date: { gte: ninetyDaysAgo.toISOString().split('T')[0] },
          },
        })

        let availability90d = 100
        if (dailyStats.length > 0) {
          const totalAvail = dailyStats.reduce((sum, s) => sum + s.availability, 0)
          availability90d = Number((totalAvail / dailyStats.length).toFixed(2))
        }

        const avgLatency = await getAvgLatency(service.id, 24)

        return {
          ...service,
          latestCheck: latestCheck || null,
          availability90d,
          avgLatency,
        }
      })
    )

    return NextResponse.json(enrichedServices)
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

    const parsed = createServiceSchema.safeParse({
      name: typeof body.name === 'string' ? body.name.trim() : body.name,
      description: typeof body.description === 'string' ? body.description.trim() : body.description,
      url: typeof body.url === 'string' ? body.url.trim() : body.url,
      method: body.method,
      timeout: body.timeout,
      interval: body.interval,
    })

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Dados inválidos' },
        { status: 400 }
      )
    }

    const service = await db.service.create({
      data: {
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        url: parsed.data.url.trim(),
        method: parsed.data.method,
        timeout: parsed.data.timeout,
        interval: parsed.data.interval,
      },
    })

    return NextResponse.json(service, { status: 201 })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}