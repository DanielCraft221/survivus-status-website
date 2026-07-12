/**
 * Monitoring module - performs health checks on services via HTTP.
 * Includes SSRF protection: only http/https schemes allowed, private IPs blocked,
 * and redirect following is disabled to prevent SSRF amplification.
 */

import { URL } from 'url'

export interface CheckResult {
  status: 'up' | 'down'
  statusCode: number | null
  latency: number
  error: string | null
}

/**
 * Check if a parsed URL resolves to a private/internal IP address.
 * Blocks RFC 1918 ranges, loopback, link-local, and IPv6 equivalents.
 */
function isPrivateIP(hostname: string): boolean {
  // Strip brackets from IPv6 addresses
  const cleanHost = hostname.replace(/^\[|\]$/g, '')

  // Block localhost and common hostnames that resolve internally
  const blockedHostnames = [
    'localhost',
    'localhost.localdomain',
    'ip6-localhost',
    'ip6-loopback',
  ]
  if (blockedHostnames.includes(cleanHost.toLowerCase())) {
    return true
  }

  // Check IPv4
  const ipv4Match = cleanHost.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b, c, d] = ipv4Match.map(Number)
    const ip = (a << 24) | (b << 16) | (c << 8) | d

    // 127.0.0.0/8 - Loopback
    if ((ip & 0xff000000) === 0x7f000000) return true
    // 10.0.0.0/8 - Private (Class A)
    if ((ip & 0xff000000) === 0x0a000000) return true
    // 172.16.0.0/12 - Private (Class B)
    if ((ip & 0xfff00000) === 0xac100000) return true
    // 192.168.0.0/16 - Private (Class C)
    if ((ip & 0xffff0000) === 0xc0a80000) return true
    // 169.254.0.0/16 - Link-local
    if ((ip & 0xffff0000) === 0xa9fe0000) return true
    // 0.0.0.0/8 - Current network
    if ((ip & 0xff000000) === 0x00000000) return true
    // 224.0.0.0/4 - Multicast
    if ((ip & 0xf0000000) === 0xe0000000) return true
    // 255.255.255.255/32 - Broadcast
    if (ip === 0xffffffff) return true
    // 100.64.0.0/10 - Carrier-grade NAT
    if ((ip & 0xffc00000) === 0x64400000) return true
    // 198.18.0.0/15 - Benchmark testing
    if ((ip & 0xfffe0000) === 0xc6120000) return true

    return false
  }

  // Check IPv6
  // For IPv6 we do a best-effort check using the expanded form
  const ipv6Patterns = [
    /^::$/,                          // Unspecified
    /^::1$/,                         // Loopback
    /^fe80:/i,                       // Link-local
    /^fc[0-9a-f]{2}:/i,              // Unique local (fc00::/7)
    /^fd[0-9a-f]{2}:/i,              // Unique local (fc00::/7)
    /^ff[0-9a-f]{2}:/i,              // Multicast
    /^::ffff:127\./i,                // IPv4-mapped loopback
    /^::ffff:10\./i,                 // IPv4-mapped private
    /^::ffff:172\.(1[6-9]|2\d|3[01])\./i, // IPv4-mapped private
    /^::ffff:192\.168\./i,           // IPv4-mapped private
    /^::ffff:169\.254\./i,           // IPv4-mapped link-local
  ]

  for (const pattern of ipv6Patterns) {
    if (pattern.test(cleanHost)) return true
  }

  return false
}

/**
 * Validate a URL for safety before fetching.
 * Returns null if safe, or an error message if not.
 */
function validateUrl(rawUrl: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return 'URL inválida'
  }

  // Only allow http and https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return `Protocolo não permitido: ${parsed.protocol}. Use http:// ou https://`
  }

  // Check for private/internal IPs in hostname
  if (isPrivateIP(parsed.hostname)) {
    return 'Endereços IP privados ou internos não são permitidos'
  }

  // Block URLs with credentials (http://user:pass@host)
  if (parsed.username || parsed.password) {
    return 'URLs com credenciais embutidas não são permitidas'
  }

  return null
}

/**
 * Perform an HTTP health check against a service endpoint.
 *
 * @param service - The service configuration to check
 * @returns A CheckResult with status, statusCode, latency, and optional error
 */
export async function checkService(service: {
  url: string
  method: string
  timeout: number
}): Promise<CheckResult> {
  const { url, method, timeout } = service
  const effectiveTimeout = timeout > 0 ? timeout : 30000

  // SSRF Protection: Validate URL before fetching
  const urlError = validateUrl(url)
  if (urlError) {
    return {
      status: 'down',
      statusCode: null,
      latency: 0,
      error: urlError,
    }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout)

  const startTime = Date.now()

  try {
    const httpMethod = (method || 'GET').toUpperCase()
    const validMethods = ['GET', 'HEAD', 'POST']
    const fetchMethod = validMethods.includes(httpMethod) ? httpMethod : 'GET'

    const response = await fetch(url, {
      method: fetchMethod,
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects to prevent SSRF amplification
      headers: {
        'User-Agent': 'StatusPageMonitor/1.0',
        'Accept': '*/*',
      },
    })

    const endTime = Date.now()
    const latency = endTime - startTime
    const statusCode = response.status

    // Handle redirects manually - only follow if target is safe
    if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.get('location')) {
      const redirectUrl = response.headers.get('location')!
      const fullRedirectUrl = new URL(redirectUrl, url).href

      // Validate redirect target
      const redirectError = validateUrl(fullRedirectUrl)
      if (redirectError) {
        return {
          status: 'down',
          statusCode,
          latency,
          error: `Redirecionamento bloqueado: ${redirectError}`,
        }
      }

      // Follow one redirect safely
      const redirectController = new AbortController()
      const redirectTimeoutId = setTimeout(() => redirectController.abort(), effectiveTimeout)
      try {
        const redirectResponse = await fetch(fullRedirectUrl, {
          method: fetchMethod === 'POST' ? 'GET' : fetchMethod, // Most redirects convert to GET
          signal: redirectController.signal,
          redirect: 'manual',
          headers: {
            'User-Agent': 'StatusPageMonitor/1.0',
            'Accept': '*/*',
          },
        })
        const redirectEnd = Date.now()
        const redirectLatency = redirectEnd - startTime

        if (redirectResponse.status >= 400) {
          return {
            status: 'down',
            statusCode: redirectResponse.status,
            latency: redirectLatency,
            error: `HTTP ${redirectResponse.status} ${redirectResponse.statusText}`,
          }
        }

        return {
          status: 'up',
          statusCode: redirectResponse.status,
          latency: redirectLatency,
          error: null,
        }
      } catch (err: unknown) {
        const redirectEnd = Date.now()
        const redirectLatency = redirectEnd - startTime
        const errMsg = err instanceof Error
          ? (err.name === 'AbortError' ? `Request timed out after ${effectiveTimeout}ms` : err.message)
          : 'Unknown error'
        return {
          status: 'down',
          statusCode: null,
          latency: redirectLatency,
          error: errMsg,
        }
      } finally {
        clearTimeout(redirectTimeoutId)
      }
    }

    if (statusCode >= 400) {
      return {
        status: 'down',
        statusCode,
        latency,
        error: `HTTP ${statusCode} ${response.statusText}`,
      }
    }

    return {
      status: 'up',
      statusCode,
      latency,
      error: null,
    }
  } catch (err: unknown) {
    const endTime = Date.now()
    const latency = endTime - startTime

    let errorMessage: string

    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        errorMessage = `Request timed out after ${effectiveTimeout}ms`
      } else {
        errorMessage = err.message || 'Unknown error'
      }
    } else {
      errorMessage = 'Unknown error occurred during health check'
    }

    return {
      status: 'down',
      statusCode: null,
      latency,
      error: errorMessage,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}