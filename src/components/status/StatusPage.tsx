'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow, subDays, startOfDay, eachDayOfInterval, getDay, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  Activity, CheckCircle, AlertTriangle, XCircle, Clock,
  Sun, Moon, Lock, ChevronDown, Server, Wifi, WifiOff,
  Wrench, RefreshCw, ArrowUpRight,
} from 'lucide-react'
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface StatusService {
  id: string
  name: string
  url: string
  currentStatus: 'up' | 'degraded' | 'down' | 'unknown'
  latestCheck: {
    status: string
    statusCode: number | null
    latency: number | null
    checkedAt: string
  } | null
}

interface StatusIncident {
  id: string
  serviceId: string
  service: { id: string; name: string }
  title: string
  description: string | null
  startedAt: string
  endedAt: string | null
  duration: number | null
  status: string
}

interface StatusMaintenance {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  active: boolean
}

interface StatsData {
  totalServices: number
  online: number
  offline: number
  overallAvailability: number
  activeIncidents: number
  averageLatency: number
  perService: Array<{
    serviceId: string
    name: string
    availability90d: number
    avgLatency24h: number
    dailyStats: Array<{
      date: string
      availability: number
    }>
  }>
}

interface StatusData {
  services: StatusService[]
  overallStatus: 'operational' | 'degraded' | 'outage'
  activeIncidents: number
  activeMaintenances: StatusMaintenance[]
  lastUpdated: string
}

interface IncidentsData {
  incidents: StatusIncident[]
  total: number
}

interface HistoryPoint {
  checkedAt: string
  latency: number | null
  status: string
}

function getUptimeColor(availability: number | null, isDark: boolean): string {
  if (availability === null) return isDark ? 'bg-slate-700' : 'bg-slate-200'
  if (availability >= 99) return isDark ? 'bg-emerald-700' : 'bg-emerald-500'
  if (availability >= 95) return isDark ? 'bg-emerald-600/70' : 'bg-emerald-400'
  if (availability >= 90) return isDark ? 'bg-yellow-600/70' : 'bg-yellow-400'
  return isDark ? 'bg-red-600/70' : 'bg-red-400'
}

function getStatusConfig(status: string) {
  switch (status) {
    case 'operational':
    case 'up':
      return {
        icon: CheckCircle,
        color: 'text-emerald-500',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20',
        label: 'Operacional',
        dot: 'bg-emerald-500',
      }
    case 'degraded':
      return {
        icon: AlertTriangle,
        color: 'text-amber-500',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20',
        label: 'Degradado',
        dot: 'bg-amber-500',
      }
    case 'outage':
    case 'down':
      return {
        icon: XCircle,
        color: 'text-red-500',
        bg: 'bg-red-500/10',
        border: 'border-red-500/20',
        label: 'Interrupção',
        dot: 'bg-red-500',
      }
    default:
      return {
        icon: Clock,
        color: 'text-slate-400',
        bg: 'bg-slate-500/10',
        border: 'border-slate-500/20',
        label: 'Desconhecido',
        dot: 'bg-slate-400',
      }
  }
}

function getIncidentStatusConfig(status: string) {
  switch (status) {
    case 'investigating':
      return { label: 'Investigando', variant: 'destructive' as const }
    case 'identified':
      return { label: 'Identificado', variant: 'default' as const, className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20 hover:bg-amber-500/25' }
    case 'monitoring':
      return { label: 'Monitorando', variant: 'default' as const, className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20 hover:bg-blue-500/25' }
    case 'resolved':
      return { label: 'Resolvido', variant: 'default' as const, className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/25' }
    default:
      return { label: status, variant: 'secondary' as const }
  }
}

const DAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export function StatusPage({ onAdminClick }: { onAdminClick: () => void }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [statusData, setStatusData] = useState<StatusData | null>(null)
  const [incidentsData, setIncidentsData] = useState<IncidentsData | null>(null)
  const [statsData, setStatsData] = useState<StatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number>(0)
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set())
  const [serviceHistory, setServiceHistory] = useState<Record<string, HistoryPoint[]>>({})
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set())

  useEffect(() => { setMounted(true) }, [])

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, incidentsRes, statsRes] = await Promise.all([
        fetch('/api/status'),
        fetch('/api/incidents?limit=50'),
        fetch('/api/stats'),
      ])

      if (statusRes.ok) {
        const data = await statusRes.json()
        setStatusData(data)
        setLastUpdated(Date.now())
      }
      if (incidentsRes.ok) {
        const data = await incidentsRes.json()
        setIncidentsData(data)
      }
      if (statsRes.ok) {
        const data = await statsRes.json()
        setStatsData(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000)
    return () => clearInterval(interval)
  }, [fetchData])

  const toggleService = async (serviceId: string) => {
    const next = new Set(expandedServices)
    if (next.has(serviceId)) {
      next.delete(serviceId)
      setExpandedServices(next)
    } else {
      next.add(serviceId)
      setExpandedServices(next)
      if (!serviceHistory[serviceId]) {
        setHistoryLoading(prev => new Set(prev).add(serviceId))
        try {
          const res = await fetch(`/api/history?serviceId=${serviceId}&period=24h`)
          if (res.ok) {
            const data = await res.json()
            setServiceHistory(prev => ({
              ...prev,
              [serviceId]: data.checks || [],
            }))
          }
        } catch {
          // silently fail
        } finally {
          setHistoryLoading(prev => {
            const n = new Set(prev)
            n.delete(serviceId)
            return n
          })
        }
      }
    }
  }

  const secondsAgo = Math.floor((Date.now() - lastUpdated) / 1000)
  const isDark = theme === 'dark'

  // Compute uptime grid data (90 days)
  const uptimeGrid = (() => {
    if (!statsData) return { days: [], monthLabels: [] }
    const today = startOfDay(new Date())
    const ninetyAgo = subDays(today, 89)
    const days = eachDayOfInterval({ start: ninetyAgo, end: today })

    // Build map of date -> average availability across all services
    const dateAvailMap: Record<string, { sum: number; count: number }> = {}
    for (const svc of statsData.perService) {
      for (const ds of svc.dailyStats) {
        if (!dateAvailMap[ds.date]) {
          dateAvailMap[ds.date] = { sum: 0, count: 0 }
        }
        dateAvailMap[ds.date].sum += ds.availability
        dateAvailMap[ds.date].count += 1
      }
    }

    const gridDays = days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const entry = dateAvailMap[dateStr]
      const availability = entry ? Number((entry.sum / entry.count).toFixed(2)) : (statsData.perService.length > 0 ? 100 : null)
      return {
        date: dateStr,
        dayOfWeek: getDay(day),
        availability,
        day: day.getDate(),
        month: format(day, 'MMM', { locale: ptBR }),
      }
    })

    // Compute month labels for top row
    const monthLabels: { label: string; col: number }[] = []
    let lastMonth = ''
    gridDays.forEach((d, i) => {
      if (d.month !== lastMonth) {
        monthLabels.push({ label: d.month, col: i })
        lastMonth = d.month
      }
    })

    return { days: gridDays, monthLabels }
  })()

  if (!mounted) return null

  const overallConfig = statusData ? getStatusConfig(statusData.overallStatus) : getStatusConfig('unknown')

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen flex flex-col bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
                <Activity className="h-5 w-5 text-emerald-500" />
              </div>
              <span className="text-lg font-semibold tracking-tight">StatusPage</span>
            </div>

            <div className="flex items-center gap-2">
              {statusData && !loading && (
                <Badge
                  variant="outline"
                  className={`${overallConfig.border} ${overallConfig.bg} ${overallConfig.color} font-medium gap-1.5 px-3 py-1 text-xs sm:text-sm`}
                >
                  <span className={`h-2 w-2 rounded-full ${overallConfig.dot} animate-pulse`} />
                  {overallConfig.label}
                </Badge>
              )}

              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-9 w-9"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                <span className="sr-only">Alternar tema</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={onAdminClick}
                className="h-9 gap-2 text-xs sm:text-sm"
              >
                <Lock className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Admin</span>
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
          {/* Maintenance Banner */}
          <AnimatePresence>
            {statusData?.activeMaintenances && statusData.activeMaintenances.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <Card className="border-blue-500/30 bg-blue-500/5">
                  <CardContent className="flex items-start gap-3 p-4">
                    <Wrench className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                        Manutenção Programada
                      </p>
                      {statusData.activeMaintenances.map(m => (
                        <p key={m.id} className="text-xs text-muted-foreground truncate">
                          {m.title} — {format(parseISO(m.startsAt), "dd/MM 'às' HH:mm", { locale: ptBR })}
                          {m.endsAt ? ` até ${format(parseISO(m.endsAt), "dd/MM 'às' HH:mm", { locale: ptBR })}` : ''}
                        </p>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-4"
          >
            <div className="flex justify-center">
              {loading ? (
                <Skeleton className="h-16 w-16 rounded-2xl" />
              ) : (
                <div className={`flex h-16 w-16 items-center justify-center rounded-2xl ${overallConfig.bg} transition-colors duration-500`}>
                  <overallConfig.icon className={`h-8 w-8 ${overallConfig.color} transition-colors duration-500`} />
                </div>
              )}
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
                {loading ? (
                  <Skeleton className="h-9 w-64 mx-auto" />
                ) : (
                  <span className={overallConfig.color}>
                    {overallConfig.label}
                  </span>
                )}
              </h1>
              {loading ? (
                <Skeleton className="h-4 w-48 mx-auto" />
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Todos os sistemas estão operando normalmente.
                </p>
              )}
            </div>
          </motion.div>

          {/* Summary Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-3 gap-4"
          >
            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-4 w-24 mb-2" />
                    <Skeleton className="h-8 w-16" />
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Serviços Operacionais</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-emerald-500">
                        {statusData?.services.filter(s => s.currentStatus === 'up').length || 0}
                      </span>
                      <span className="text-lg text-muted-foreground">/</span>
                      <span className="text-lg text-muted-foreground">
                        {statusData?.services.length || 0}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Disponibilidade Geral</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-2xl font-bold text-emerald-500">
                        {statsData ? `${statsData.overallAvailability.toFixed(1)}%` : '100%'}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="group hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Incidentes Ativos</p>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className={`text-2xl font-bold ${(statusData?.activeIncidents || 0) > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                        {statusData?.activeIncidents || 0}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </motion.div>

          {/* Uptime Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  Disponibilidade — Últimos 90 dias
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                {loading ? (
                  <Skeleton className="h-24 w-full rounded-lg" />
                ) : (
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      {/* Month labels */}
                      <div className="flex gap-0.5 mb-1.5 ml-8">
                        {uptimeGrid.monthLabels.map((m, i) => {
                          const next = uptimeGrid.monthLabels[i + 1]
                          const span = next ? next.col - m.col : uptimeGrid.days.length - m.col
                          return (
                            <div
                              key={m.label + m.col}
                              style={{ width: `${span * 14 + (span - 1) * 4}px` }}
                              className="text-[10px] text-muted-foreground font-medium truncate"
                            >
                              {m.label}
                            </div>
                          )
                        })}
                      </div>

                      <div className="flex gap-0">
                        {/* Day labels column */}
                        <div className="flex flex-col gap-0 shrink-0 w-7">
                          {[1, 3, 5].map(dow => (
                            <div key={dow} style={{ height: '14px', marginBottom: '4px' }} className="flex items-center">
                              <span className="text-[10px] text-muted-foreground leading-none">
                                {DAY_LABELS[dow]}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Grid */}
                        <div className="flex flex-wrap gap-[4px]">
                          {uptimeGrid.days.map(day => {
                            const showLabel = day.dayOfWeek === 1 || day.dayOfWeek === 3 || day.dayOfWeek === 5
                            const color = getUptimeColor(day.availability, isDark)
                            return (
                              <Tooltip key={day.date}>
                                <TooltipTrigger asChild>
                                  <div
                                    className={`h-[14px] w-[14px] rounded-[3px] cursor-default transition-transform hover:scale-125 ${color} ${
                                      !showLabel ? 'invisible' : ''
                                    }`}
                                  />
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-medium">{format(parseISO(day.date), "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
                                  <p>
                                    {day.availability !== null ? `${day.availability.toFixed(1)}% disponível` : 'Sem dados'}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            )
                          })}
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="flex items-center gap-4 mt-4 ml-8">
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded-[2px] ${getUptimeColor(100, isDark)}`} />
                          <span className="text-[10px] text-muted-foreground">&gt;99%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded-[2px] ${getUptimeColor(97, isDark)}`} />
                          <span className="text-[10px] text-muted-foreground">95-99%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded-[2px] ${getUptimeColor(92, isDark)}`} />
                          <span className="text-[10px] text-muted-foreground">90-95%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded-[2px] ${getUptimeColor(85, isDark)}`} />
                          <span className="text-[10px] text-muted-foreground">&lt;90%</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className={`h-3 w-3 rounded-[2px] ${getUptimeColor(null, isDark)}`} />
                          <span className="text-[10px] text-muted-foreground">Sem dados</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Services List */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="space-y-3"
          >
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              Serviços Monitorados
            </h2>

            {loading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-center gap-4">
                    <Skeleton className="h-3 w-3 rounded-full" />
                    <Skeleton className="h-5 w-40" />
                    <Skeleton className="h-4 w-20 ml-auto" />
                  </CardContent>
                </Card>
              ))
            ) : statusData?.services.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Server className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">Nenhum serviço monitorado.</p>
                </CardContent>
              </Card>
            ) : (
              statusData?.services.map(service => {
                const config = getStatusConfig(service.currentStatus)
                const isExpanded = expandedServices.has(service.id)
                const svcStats = statsData?.perService.find(s => s.serviceId === service.id)
                const history = serviceHistory[service.id] || []
                const chartData = history.map((h: HistoryPoint) => ({
                  time: format(parseISO(h.checkedAt), 'HH:mm'),
                  latency: h.latency || 0,
                  status: h.status,
                }))

                return (
                  <Card key={service.id} className="overflow-hidden">
                    <Collapsible open={isExpanded} onOpenChange={() => toggleService(service.id)}>
                      <CollapsibleTrigger asChild>
                        <button className="w-full text-left hover:bg-muted/30 transition-colors">
                          <CardContent className="p-4 flex items-center gap-3 sm:gap-4">
                            <span className={`h-3 w-3 rounded-full shrink-0 ${config.dot}`} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{service.name}</p>
                              <p className="text-xs text-muted-foreground truncate hidden sm:block">{service.url}</p>
                            </div>
                            <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
                              {service.latestCheck?.latency != null && (
                                <span className="flex items-center gap-1">
                                  <ArrowUpRight className="h-3 w-3" />
                                  {service.latestCheck.latency}ms
                                </span>
                              )}
                              {svcStats && (
                                <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                  {svcStats.availability90d.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <Badge
                              variant="outline"
                              className={`${config.border} ${config.bg} ${config.color} text-[11px] font-medium shrink-0`}
                            >
                              {config.label}
                            </Badge>
                            <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                          </CardContent>
                        </button>
                      </CollapsibleTrigger>

                      <AnimatePresence>
                        {isExpanded && (
                          <CollapsibleContent forceMount>
                            <motion.div
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="border-t border-border/50 px-4 py-4">
                                {/* Mobile stats */}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mb-4 sm:hidden">
                                  {service.latestCheck?.latency != null && (
                                    <span className="flex items-center gap-1">
                                      <ArrowUpRight className="h-3 w-3" />
                                      {service.latestCheck.latency}ms
                                    </span>
                                  )}
                                  {svcStats && (
                                    <span className="font-medium text-emerald-600 dark:text-emerald-400">
                                      {svcStats.availability90d.toFixed(1)}% em 90 dias
                                    </span>
                                  )}
                                </div>

                                {/* Response Time Chart */}
                                {historyLoading.has(service.id) ? (
                                  <Skeleton className="h-48 w-full rounded-lg" />
                                ) : chartData.length > 0 ? (
                                  <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                      <LineChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                                        <XAxis
                                          dataKey="time"
                                          tick={{ fontSize: 10 }}
                                          className="text-muted-foreground"
                                          interval="preserveStartEnd"
                                        />
                                        <YAxis
                                          tick={{ fontSize: 10 }}
                                          className="text-muted-foreground"
                                          label={{ value: 'ms', position: 'insideTopLeft', offset: -5, fontSize: 10, fill: 'var(--muted-foreground)' }}
                                          width={35}
                                        />
                                        <ReferenceLine y={1000} stroke="var(--amber-500)" strokeDasharray="3 3" strokeOpacity={0.5} />
                                        <Line
                                          type="monotone"
                                          dataKey="latency"
                                          stroke="var(--emerald-500)"
                                          strokeWidth={2}
                                          dot={false}
                                          activeDot={{ r: 4, strokeWidth: 0 }}
                                        />
                                      </LineChart>
                                    </ResponsiveContainer>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground text-center py-8">
                                    Nenhum dado de histórico disponível.
                                  </p>
                                )}
                              </div>
                            </motion.div>
                          </CollapsibleContent>
                        )}
                      </AnimatePresence>
                    </Collapsible>
                  </Card>
                )
              })
            )}
          </motion.div>

          {/* Incidents Timeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="space-y-4"
          >
            <h2 className="text-base font-semibold flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
              Incidentes Recentes
            </h2>

            {loading ? (
              Array.from({ length: 2 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4 flex items-start gap-3">
                    <Skeleton className="h-3 w-3 rounded-full mt-1.5" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-48" />
                      <Skeleton className="h-3 w-32" />
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : incidentsData && incidentsData.incidents.length > 0 ? (
              <div className="relative space-y-0">
                {/* Active Incidents */}
                {incidentsData.incidents.filter(i => i.status !== 'resolved').length > 0 && (
                  <div className="space-y-3 mb-6">
                    <p className="text-xs font-medium text-red-500 uppercase tracking-wider">
                      Incidentes Ativos ({incidentsData.incidents.filter(i => i.status !== 'resolved').length})
                    </p>
                    {incidentsData.incidents
                      .filter(i => i.status !== 'resolved')
                      .map(incident => {
                        const sConfig = getIncidentStatusConfig(incident.status)
                        return (
                          <Card key={incident.id} className="border-red-500/20 bg-red-500/5">
                            <CardContent className="p-4 flex items-start gap-3">
                              <span className="h-3 w-3 rounded-full bg-red-500 mt-1.5 shrink-0 animate-pulse" />
                              <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                  <p className="font-medium text-sm">{incident.title}</p>
                                  <Badge variant="destructive" className="text-[10px] h-5">
                                    {sConfig.label}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  {incident.service?.name} · {formatDistanceToNow(parseISO(incident.startedAt), { addSuffix: true, locale: ptBR })}
                                </p>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                  </div>
                )}

                {/* Resolved Incidents */}
                {incidentsData.incidents.filter(i => i.status === 'resolved').length > 0 && (
                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Resolvidos Recentes
                    </p>
                    {incidentsData.incidents
                      .filter(i => i.status === 'resolved')
                      .slice(0, 10)
                      .map(incident => (
                        <Card key={incident.id} className="group hover:shadow-sm transition-shadow">
                          <CardContent className="p-4 flex items-start gap-3">
                            <span className="h-3 w-3 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-1">
                                <p className="font-medium text-sm text-muted-foreground group-hover:text-foreground transition-colors">{incident.title}</p>
                                <Badge
                                  variant="outline"
                                  className="text-[10px] h-5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                >
                                  Resolvido
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {incident.service?.name} · {formatDistanceToNow(parseISO(incident.startedAt), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
                  <p className="text-sm">Nenhum incidente registrado.</p>
                </CardContent>
              </Card>
            )}
          </motion.div>
        </main>

        {/* Footer */}
        <footer className="mt-auto border-t border-border/40 bg-muted/30">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              StatusPage Monitor
            </p>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {lastUpdated > 0 && (
                <>
                  <RefreshCw className="h-3 w-3" />
                  Atualizado automaticamente · {secondsAgo < 60 ? `há ${secondsAgo}s` : formatDistanceToNow(lastUpdated, { addSuffix: true, locale: ptBR })}
                </>
              )}
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  )
}