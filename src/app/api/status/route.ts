import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const rateKey = getRateLimitKey(request, 'public:status')
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.publicRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const now = new Date()

    const services = await db.service.findMany({
      where: { active: true },
      orderBy: { createdAt: 'desc' },
    })

    const activeIncidentsCount = await db.incident.count({
      where: { status: { not: 'resolved' } },
    })

    const activeMaintenances = await db.maintenance.findMany({
      where: {
        active: true,
        endsAt: { gt: now },
      },
      orderBy: { startsAt: 'asc' },
    })

    const servicesWithStatus = await Promise.all(
      services.map(async (service) => {
        const latestCheck = await db.checkHistory.findFirst({
          where: { serviceId: service.id },
          orderBy: { checkedAt: 'desc' },
        })

        let currentStatus: 'up' | 'degraded' | 'down' | 'unknown' = 'unknown'

        if (latestCheck) {
          const maxAge = service.interval * 2 * 1000
          const checkAge = now.getTime() - latestCheck.checkedAt.getTime()

          if (latestCheck.status === 'up' && checkAge <= maxAge) {
            if (latestCheck.latency && latestCheck.latency > 2000) {
              currentStatus = 'degraded'
            } else {
              currentStatus = 'up'
            }
          } else {
            currentStatus = 'down'
          }
        }

        // Strip internal URLs from public response
        return {
          id: service.id,
          name: service.name,
          currentStatus,
          latestCheck: latestCheck
            ? {
                status: latestCheck.status,
                statusCode: latestCheck.statusCode,
                latency: latestCheck.latency,
                checkedAt: latestCheck.checkedAt,
              }
            : null,
        }
      })
    )

    const statuses = servicesWithStatus.map((s) => s.currentStatus)
    let overallStatus: 'operational' | 'degraded' | 'outage' = 'operational'

    if (statuses.includes('down')) {
      overallStatus = 'outage'
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded'
    } else if (statuses.includes('unknown') && statuses.length > 0) {
      overallStatus = statuses.every((s) => s === 'unknown') ? 'operational' : 'degraded'
    }

    return NextResponse.json({
      services: servicesWithStatus,
      overallStatus,
      activeIncidents: activeIncidentsCount,
      activeMaintenances,
      lastUpdated: now.toISOString(),
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}