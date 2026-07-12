import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

const VALID_PERIODS = ['24h', '7d', '30d', '90d']

function getStartDate(period: string): Date {
  const now = new Date()
  switch (period) {
    case '24h':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  }
}

export async function GET(request: NextRequest) {
  try {
    const rateKey = getRateLimitKey(request, 'public:history')
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.publicRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const { searchParams } = new URL(request.url)

    const serviceId = searchParams.get('serviceId')
    if (!serviceId || serviceId.length > 50) {
      return NextResponse.json(
        { error: 'serviceId é obrigatório' },
        { status: 400 }
      )
    }

    const period = searchParams.get('period') || '24h'
    if (!VALID_PERIODS.includes(period)) {
      return NextResponse.json(
        { error: 'Período inválido. Use: 24h, 7d, 30d, 90d' },
        { status: 400 }
      )
    }

    const startDate = getStartDate(period)

    const checks = await db.checkHistory.findMany({
      where: {
        serviceId,
        checkedAt: { gte: startDate },
      },
      orderBy: { checkedAt: 'asc' },
    })

    const total = checks.length
    const up = checks.filter((c) => c.status === 'up').length
    const down = total - up

    const latencies = checks
      .filter((c) => c.latency !== null)
      .map((c) => c.latency as number)
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
      : 0

    const availability = total > 0 ? Number(((up / total) * 100).toFixed(2)) : 100

    return NextResponse.json({
      checks,
      serviceId,
      period,
      stats: {
        total,
        up,
        down,
        avgLatency,
        availability,
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}