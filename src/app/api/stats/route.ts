import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAvgLatency, getAvailability } from '@/lib/stats'
import { getAuthUser } from '@/lib/auth'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const rateKey = getRateLimitKey(request, `read:${user.userId}`)
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.authRead)
    if (rateCheck.limited) {
      return NextResponse.json(
        { error: 'Muitas requisições. Tente novamente mais tarde.' },
        { status: 429 }
      )
    }

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

    const services = await db.service.findMany({
      where: { active: true },
    })

    const serviceStatuses = await Promise.all(
      services.map(async (service) => {
        const latestCheck = await db.checkHistory.findFirst({
          where: { serviceId: service.id },
          orderBy: { checkedAt: 'desc' },
        })

        const isUp = latestCheck
          ? latestCheck.status === 'up' &&
            (Date.now() - latestCheck.checkedAt.getTime()) <= service.interval * 2 * 1000
          : false

        return {
          serviceId: service.id,
          name: service.name,
          isUp,
        }
      })
    )

    const onlineCount = serviceStatuses.filter((s) => s.isUp).length
    const offlineCount = serviceStatuses.length - onlineCount

    const availabilities = await Promise.all(
      services.map((s) => getAvailability(s.id, 90))
    )
    const overallAvailability = availabilities.length > 0
      ? Number((availabilities.reduce((sum, a) => sum + a, 0) / availabilities.length).toFixed(2))
      : 100

    const latencies = await Promise.all(
      services.map((s) => getAvgLatency(s.id, 24))
    )
    const averageLatency = latencies.length > 0
      ? Math.round(latencies.reduce((sum, l) => sum + l, 0) / latencies.length)
      : 0

    const activeIncidents = await db.incident.count({
      where: { status: { not: 'resolved' } },
    })

    const perService = await Promise.all(
      services.map(async (service) => {
        const dailyStats = await db.dailyStats.findMany({
          where: {
            serviceId: service.id,
            date: { gte: ninetyDaysAgo.toISOString().split('T')[0] },
          },
          orderBy: { date: 'asc' },
        })

        return {
          serviceId: service.id,
          name: service.name,
          availability90d: await getAvailability(service.id, 90),
          avgLatency24h: await getAvgLatency(service.id, 24),
          dailyStats,
        }
      })
    )

    return NextResponse.json({
      totalServices: services.length,
      online: onlineCount,
      offline: offlineCount,
      overallAvailability,
      activeIncidents,
      averageLatency,
      perService,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}