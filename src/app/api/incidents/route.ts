import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const VALID_STATUSES = ['investigating', 'identified', 'monitoring', 'resolved']

export async function GET(request: NextRequest) {
  try {
    const rateKey = getRateLimitKey(request, 'public:incidents')
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.publicRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const { searchParams } = new URL(request.url)

    const serviceId = searchParams.get('serviceId')
    const status = searchParams.get('status')
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 50, 1), 100)
    const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

    const where: Record<string, unknown> = {}

    if (serviceId) {
      where.serviceId = serviceId
    }
    if (status && VALID_STATUSES.includes(status)) {
      where.status = status
    }

    const [incidents, total] = await Promise.all([
      db.incident.findMany({
        where,
        include: {
          service: {
            select: { id: true, name: true },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.incident.count({ where }),
    ])

    return NextResponse.json({ incidents, total })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}