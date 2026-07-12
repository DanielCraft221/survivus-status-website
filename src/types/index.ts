// ==========================================
// Status Page Monitoring System - Type Definitions
// ==========================================

/** Matches the Prisma Service model */
export interface Service {
  id: string
  name: string
  description: string | null
  url: string
  method: string
  timeout: number
  interval: number
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/** Matches the Prisma CheckHistory model */
export interface CheckHistory {
  id: string
  serviceId: string
  checkedAt: Date
  status: string
  statusCode: number | null
  latency: number | null
  error: string | null
  duration: number | null
  createdAt: Date
}

/** Matches the Prisma Incident model */
export interface Incident {
  id: string
  serviceId: string
  title: string
  description: string | null
  startedAt: Date
  endedAt: Date | null
  duration: number | null
  status: string
  createdAt: Date
  updatedAt: Date
}

/** Matches the Prisma Maintenance model */
export interface Maintenance {
  id: string
  title: string
  description: string | null
  startsAt: Date
  endsAt: Date | null
  active: boolean
  createdAt: Date
  updatedAt: Date
}

/** Matches the Prisma DailyStats model */
export interface DailyStats {
  id: string
  serviceId: string
  date: string
  uptime: number
  downtime: number
  availability: number
  avgResponseTime: number
  totalChecks: number
  totalFailures: number
  createdAt: Date
  updatedAt: Date
}

/** Extends Service with computed status fields */
export interface ServiceWithStats extends Service {
  currentStatus: 'up' | 'degraded' | 'down'
  availability90d: number
  avgLatency: number
  uptime24h: number
  uptime7d: number
  uptime30d: number
  uptime90d: number
}

/** Extends Incident with service name */
export interface IncidentWithService extends Incident {
  serviceName: string
}

/** Generic API response wrapper */
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

/** Login request body */
export interface LoginRequest {
  username: string
  password: string
}

/** Login response body */
export interface LoginResponse {
  token: string
  user: {
    id: string
    username: string
    mustChangePwd: boolean
  }
}

/** Overview statistics for the dashboard */
export interface StatsOverview {
  totalServices: number
  onlineServices: number
  offlineServices: number
  overallAvailability: number
  activeIncidents: number
  avgLatency: number
}