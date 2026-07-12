/**
 * Statistics calculation utilities for the status page monitoring system.
 */

import { db } from '@/lib/db'

interface BaseCheck {
  status: string
}

interface CheckWithTime {
  status: string
  checkedAt: string
}

interface CheckWithLatency {
  latency: number | null
}

/**
 * Get availability for a service over a given number of hours.
 * Queries the database directly.
 */
export async function getAvailability(serviceId: string, hours: number): Promise<number> {
  const since = new Date()
  since.setHours(since.getHours() - hours)

  const checks = await db.checkHistory.findMany({
    where: { serviceId, checkedAt: { gte: since } },
    select: { status: true },
  })

  return calculateAvailability(checks)
}

/**
 * Get average latency for a service over a given number of hours.
 * Queries the database directly.
 */
export async function getAvgLatency(serviceId: string, hours: number): Promise<number> {
  const since = new Date()
  since.setHours(since.getHours() - hours)

  const checks = await db.checkHistory.findMany({
    where: { serviceId, checkedAt: { gte: since } },
    select: { latency: true },
  })

  return calculateAvgLatency(checks)
}

/**
 * Compute and upsert daily stats for all services for today.
 * Called by the cron monitor after running all checks.
 */
export async function computeAllDailyStats(): Promise<void> {
  const services = await db.service.findMany({ select: { id: true } })
  const today = new Date().toISOString().split('T')[0]
  const startOfDay = new Date(today)
  const now = new Date()

  for (const service of services) {
    const checks = await db.checkHistory.findMany({
      where: {
        serviceId: service.id,
        checkedAt: { gte: startOfDay, lt: now },
      },
    })

    if (checks.length === 0) continue

    const upCount = checks.filter((c) => c.status === 'up').length
    const downCount = checks.length - upCount
    const availability = (upCount / checks.length) * 100
    const periodMs = now.getTime() - startOfDay.getTime()
    const uptime = calculateUptime(
      checks.map((c) => ({ status: c.status, checkedAt: c.checkedAt.toISOString() })),
      periodMs
    )
    const downtime = calculateDowntime(
      checks.map((c) => ({ status: c.status, checkedAt: c.checkedAt.toISOString() })),
      periodMs
    )
    const avgResponseTime = calculateAvgLatency(
      checks.map((c) => ({ latency: c.latency }))
    )

    await db.dailyStats.upsert({
      where: {
        serviceId_date: {
          serviceId: service.id,
          date: today,
        },
      },
      update: {
        uptime,
        downtime,
        availability,
        avgResponseTime,
        totalChecks: checks.length,
        totalFailures: downCount,
      },
      create: {
        serviceId: service.id,
        date: today,
        uptime,
        downtime,
        availability,
        avgResponseTime,
        totalChecks: checks.length,
        totalFailures: downCount,
      },
    })
  }
}

/**
 * Calculate the availability percentage from a list of check results.
 * Availability = (number of successful checks / total checks) * 100
 *
 * @param checks - Array of check objects with a status field
 * @returns Availability percentage from 0 to 100
 */
export function calculateAvailability(checks: BaseCheck[]): number {
  if (checks.length === 0) return 100

  const successCount = checks.filter((c) => c.status === 'up').length
  return (successCount / checks.length) * 100
}

/**
 * Calculate the average latency from a list of check results.
 * Skips entries with null latency.
 *
 * @param checks - Array of check objects with a latency field
 * @returns Average latency in milliseconds
 */
export function calculateAvgLatency(checks: CheckWithLatency[]): number {
  const validChecks = checks.filter((c) => c.latency !== null && c.latency !== undefined)
  if (validChecks.length === 0) return 0

  const totalLatency = validChecks.reduce((sum, c) => sum + (c.latency as number), 0)
  return totalLatency / validChecks.length
}

/**
 * Calculate total uptime in seconds for a given period.
 * Uptime is the sum of time intervals where the service was 'up'.
 *
 * @param checks - Array of check objects sorted by checkedAt (ascending)
 * @param periodMs - The total period length in milliseconds
 * @returns Uptime in seconds
 */
export function calculateUptime(checks: CheckWithTime[], periodMs: number): number {
  if (checks.length === 0) return periodMs / 1000

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  )

  const now = Date.now()
  const periodStart = now - periodMs
  let uptimeMs = 0

  for (let i = 0; i < sorted.length; i++) {
    const checkTime = new Date(sorted[i].checkedAt).getTime()

    // Only consider checks within the period
    if (checkTime < periodStart) continue

    if (sorted[i].status === 'up') {
      // The end of this "up" interval is either the next check or now
      let intervalEndMs: number
      if (i + 1 < sorted.length) {
        intervalEndMs = new Date(sorted[i + 1].checkedAt).getTime()
      } else {
        intervalEndMs = now
      }

      const intervalMs = Math.max(0, intervalEndMs - checkTime)
      uptimeMs += intervalMs
    }
  }

  // If no checks were within the period, assume full uptime
  if (sorted.every((c) => new Date(c.checkedAt).getTime() < periodStart)) {
    return periodMs / 1000
  }

  return uptimeMs / 1000
}

/**
 * Calculate total downtime in seconds for a given period.
 * Downtime is the sum of time intervals where the service was 'down'.
 *
 * @param checks - Array of check objects sorted by checkedAt (ascending)
 * @param periodMs - The total period length in milliseconds
 * @returns Downtime in seconds
 */
export function calculateDowntime(checks: CheckWithTime[], periodMs: number): number {
  if (checks.length === 0) return 0

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  )

  const now = Date.now()
  const periodStart = now - periodMs
  let downtimeMs = 0

  for (let i = 0; i < sorted.length; i++) {
    const checkTime = new Date(sorted[i].checkedAt).getTime()

    // Only consider checks within the period
    if (checkTime < periodStart) continue

    if (sorted[i].status !== 'up') {
      // The end of this "down" interval is either the next check or now
      let intervalEndMs: number
      if (i + 1 < sorted.length) {
        intervalEndMs = new Date(sorted[i + 1].checkedAt).getTime()
      } else {
        intervalEndMs = now
      }

      const intervalMs = Math.max(0, intervalEndMs - checkTime)
      downtimeMs += intervalMs
    }
  }

  return downtimeMs / 1000
}

interface StreakResult {
  duration: number
  start: Date
  end: Date
}

/**
 * Find the longest consecutive streak of 'up' status.
 *
 * @param checks - Array of check objects with status and timestamp
 * @returns An object with the duration in ms, start date, and end date of the longest up streak
 */
export function getMaxUptimeStreak(checks: CheckWithTime[]): StreakResult {
  const defaultResult: StreakResult = {
    duration: 0,
    start: new Date(),
    end: new Date(),
  }

  if (checks.length === 0) return defaultResult

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  )

  let maxDuration = 0
  let maxStart = new Date(sorted[0].checkedAt)
  let maxEnd = new Date(sorted[0].checkedAt)

  let currentStart: Date | null = null
  let currentEnd: Date | null = null

  for (const check of sorted) {
    if (check.status === 'up') {
      if (currentStart === null) {
        currentStart = new Date(check.checkedAt)
      }
      currentEnd = new Date(check.checkedAt)
    } else {
      if (currentStart !== null && currentEnd !== null) {
        const duration = currentEnd.getTime() - currentStart.getTime()
        if (duration > maxDuration) {
          maxDuration = duration
          maxStart = currentStart
          maxEnd = currentEnd
        }
      }
      currentStart = null
      currentEnd = null
    }
  }

  // Check the last streak
  if (currentStart !== null && currentEnd !== null) {
    const duration = currentEnd.getTime() - currentStart.getTime()
    if (duration > maxDuration) {
      maxDuration = duration
      maxStart = currentStart
      maxEnd = currentEnd
    }
  }

  return {
    duration: maxDuration,
    start: maxStart,
    end: maxEnd,
  }
}

/**
 * Find the longest consecutive streak of 'down' status.
 *
 * @param checks - Array of check objects with status and timestamp
 * @returns An object with the duration in ms, start date, and end date of the longest down streak
 */
export function getMaxDowntimeStreak(checks: CheckWithTime[]): StreakResult {
  const defaultResult: StreakResult = {
    duration: 0,
    start: new Date(),
    end: new Date(),
  }

  if (checks.length === 0) return defaultResult

  const sorted = [...checks].sort(
    (a, b) => new Date(a.checkedAt).getTime() - new Date(b.checkedAt).getTime()
  )

  let maxDuration = 0
  let maxStart = new Date(sorted[0].checkedAt)
  let maxEnd = new Date(sorted[0].checkedAt)

  let currentStart: Date | null = null
  let currentEnd: Date | null = null

  for (const check of sorted) {
    if (check.status !== 'up') {
      if (currentStart === null) {
        currentStart = new Date(check.checkedAt)
      }
      currentEnd = new Date(check.checkedAt)
    } else {
      if (currentStart !== null && currentEnd !== null) {
        const duration = currentEnd.getTime() - currentStart.getTime()
        if (duration > maxDuration) {
          maxDuration = duration
          maxStart = currentStart
          maxEnd = currentEnd
        }
      }
      currentStart = null
      currentEnd = null
    }
  }

  // Check the last streak
  if (currentStart !== null && currentEnd !== null) {
    const duration = currentEnd.getTime() - currentStart.getTime()
    if (duration > maxDuration) {
      maxDuration = duration
      maxStart = currentStart
      maxEnd = currentEnd
    }
  }

  return {
    duration: maxDuration,
    start: maxStart,
    end: maxEnd,
  }
}