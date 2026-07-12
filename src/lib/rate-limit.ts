/**
 * Centralized rate limiter using an in-memory sliding window.
 *
 * NOTE: In-memory rate limiting is per-process and resets on server restart.
 * For production multi-instance deployments, use Redis or a dedicated rate-limiting service.
 * This implementation is suitable for single-instance / development deployments.
 */

interface RateLimitEntry {
  count: number
  firstAttempt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// Cleanup stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL = 5 * 60 * 1000
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.firstAttempt > entry.windowMs) {
      rateLimitMap.delete(key)
    }
  }
}, CLEANUP_INTERVAL)

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

/**
 * Check if a request is rate limited for the given key.
 * If rate limited, returns a NextResponse with 429 status.
 * If not, records the attempt and returns null.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): { limited: boolean; retryAfterMs: number } {
  const now = Date.now()
  const entry = rateLimitMap.get(key)

  if (!entry) {
    rateLimitMap.set(key, { count: 1, firstAttempt: now })
    return { limited: false, retryAfterMs: 0 }
  }

  if (now - entry.firstAttempt > config.windowMs) {
    // Window expired, reset
    rateLimitMap.set(key, { count: 1, firstAttempt: now })
    return { limited: false, retryAfterMs: 0 }
  }

  if (entry.count >= config.maxRequests) {
    const retryAfterMs = config.windowMs - (now - entry.firstAttempt)
    return { limited: true, retryAfterMs }
  }

  entry.count++
  return { limited: false, retryAfterMs: 0 }
}

/**
 * Predefined rate limit configs for different endpoint types.
 */
export const RATE_LIMITS = {
  /** Login: 5 attempts per 15 minutes */
  login: { maxRequests: 5, windowMs: 15 * 60 * 1000 },
  /** Password change: 3 attempts per 15 minutes */
  passwordChange: { maxRequests: 3, windowMs: 15 * 60 * 1000 },
  /** Authenticated mutations (create/update/delete): 60 per minute */
  authMutation: { maxRequests: 60, windowMs: 60 * 1000 },
  /** Authenticated reads: 120 per minute */
  authRead: { maxRequests: 120, windowMs: 60 * 1000 },
  /** Public read endpoints: 30 per minute */
  publicRead: { maxRequests: 30, windowMs: 60 * 1000 },
  /** Cron endpoint: 10 per minute */
  cron: { maxRequests: 10, windowMs: 60 * 1000 },
} as const

/**
 * Extract a rate-limit key from the request (IP-based).
 * Uses X-Forwarded-For > X-Real-IP > fallback.
 */
export function getRateLimitKey(request: Request, suffix?: string): string {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  return suffix ? `${ip}:${suffix}` : ip
}

/**
 * Clear rate limit entries for a given key (e.g., after successful login).
 */
export function clearRateLimit(key: string): void {
  rateLimitMap.delete(key)
}