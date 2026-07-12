import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { checkService, CheckResult } from '@/lib/monitor'
import { computeAllDailyStats } from '@/lib/stats'
import { checkRateLimit, getRateLimitKey, RATE_LIMITS } from '@/lib/rate-limit'
import crypto from 'crypto'

export async function POST(request: NextRequest) {
  try {
    // Rate limit the cron endpoint
    const rateKey = getRateLimitKey(request, 'cron:monitor')
    const rateCheck = checkRateLimit(rateKey, RATE_LIMITS.cron)
    if (rateCheck.limited) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 })
    }

    // Verify cron secret - MUST be set, no fallback
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) {
      // Log security event but don't leak details
      console.error('[SECURITY] CRON_SECRET not configured - cron endpoint disabled')
      return NextResponse.json(
        { error: 'Endpoint desabilitado' },
        { status: 503 }
      )
    }

    // Use constant-time comparison to prevent timing attacks
    const authHeader = request.headers.get('CRON_SECRET') || ''
    const expectedHash = crypto.createHash('sha256').update(cronSecret).digest()
    const providedHash = crypto.createHash('sha256').update(authHeader).digest()

    if (!crypto.timingSafeEqual(expectedHash, providedHash)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all active services
    const services = await db.service.findMany({
      where: { active: true },
    })

    let checked = 0
    let upCount = 0
    let downCount = 0
    let incidentsCreated = 0

    for (const service of services) {
      try {
        const previousCheck = await db.checkHistory.findFirst({
          where: { serviceId: service.id },
          orderBy: { checkedAt: 'desc' },
        })

        const previousStatus = previousCheck?.status || null

        const result: CheckResult = await checkService(service)

        await db.checkHistory.create({
          data: {
            serviceId: service.id,
            checkedAt: new Date(),
            status: result.status,
            statusCode: result.statusCode,
            latency: result.latency,
            error: result.error,
          },
        })

        checked++

        if (result.status === 'up') {
          upCount++
        } else {
          downCount++
        }

        // Handle status transitions
        if (previousStatus === 'up' && result.status === 'down') {
          await db.incident.create({
            data: {
              serviceId: service.id,
              title: `[${service.name}] - Serviço fora do ar`,
              description: result.error || `Serviço retornou status ${result.statusCode || 'sem resposta'}`,
              status: 'investigating',
              startedAt: new Date(),
            },
          })
          incidentsCreated++
        }

        if (previousStatus === 'down' && result.status === 'up') {
          const openIncident = await db.incident.findFirst({
            where: {
              serviceId: service.id,
              status: { not: 'resolved' },
            },
            orderBy: { startedAt: 'desc' },
          })

          if (openIncident) {
            const endedAt = new Date()
            const duration = Math.round(
              (endedAt.getTime() - openIncident.startedAt.getTime()) / 1000
            )

            await db.incident.update({
              where: { id: openIncident.id },
              data: {
                status: 'resolved',
                endedAt,
                duration,
              },
            })
          }
        }
      } catch {
        checked++
        downCount++
      }
    }

    await computeAllDailyStats()

    return NextResponse.json({
      checked,
      up: upCount,
      down: downCount,
      incidents: incidentsCreated,
    })
  } catch {
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}