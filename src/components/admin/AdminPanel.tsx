'use client'

import { useState, useEffect, useSyncExternalStore, useCallback } from 'react'
import { useTheme } from 'next-themes'
import { motion, AnimatePresence } from 'framer-motion'
import { format, formatDistanceToNow, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  Activity, Sun, Moon, LogOut, Plus, Pencil, Trash2, Server,
  AlertTriangle, Wrench, Clock, BarChart3, CheckCircle, XCircle,
  ArrowUpRight, Search,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RechartsTooltip,
} from 'recharts'
import { useApi } from '@/hooks/use-api'

interface AdminUser {
  id: string
  username: string
  mustChangePwd: boolean
}

interface AdminPanelProps {
  user: AdminUser
  onLogout: () => void
}

interface ServiceItem {
  id: string
  name: string
  description: string | null
  url: string
  method: string
  timeout: number
  interval: number
  active: boolean
  createdAt: string
  updatedAt: string
  latestCheck: { status: string; statusCode: number | null; latency: number | null; checkedAt: string } | null
  availability90d: number
  avgLatency: number
}

interface IncidentItem {
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

interface MaintenanceItem {
  id: string
  title: string
  description: string | null
  startsAt: string
  endsAt: string | null
  active: boolean
}

interface HistoryCheck {
  id: string
  serviceId: string
  checkedAt: string
  status: string
  statusCode: number | null
  latency: number | null
  error: string | null
}

interface StatsOverview {
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
    dailyStats: Array<{ date: string; availability: number }>
  }>
}

const STATUS_COLORS = ['#10b981', '#f59e0b', '#ef4444']

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ======================== DASHBOARD TAB ========================
function DashboardTab() {
  const api = useApi()
  const [stats, setStats] = useState<StatsOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/stats')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (!cancelled) setStats(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const barData = (stats?.perService || []).map(s => ({
    name: s.name.length > 15 ? s.name.slice(0, 15) + '…' : s.name,
    fullName: s.name,
    latency: s.avgLatency24h,
  }))

  const pieData = [
    { name: 'Online', value: stats?.online || 0, color: '#10b981' },
    { name: 'Offline', value: stats?.offline || 0, color: '#ef4444' },
  ]

  if (!stats && loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-12" /></CardContent></Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total de Serviços</p>
            <p className="text-2xl font-bold mt-1">{stats?.totalServices || 0}</p>
          </CardContent>
        </Card>
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Online</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">{stats?.online || 0}</p>
          </CardContent>
        </Card>
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Offline</p>
            <p className="text-2xl font-bold text-red-500 mt-1">{stats?.offline || 0}</p>
          </CardContent>
        </Card>
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Disponibilidade</p>
            <p className="text-2xl font-bold text-emerald-500 mt-1">{stats ? `${stats.overallAvailability.toFixed(1)}%` : '—'}</p>
          </CardContent>
        </Card>
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Incidentes Ativos</p>
            <p className="text-2xl font-bold text-amber-500 mt-1">{stats?.activeIncidents || 0}</p>
          </CardContent>
        </Card>
        <Card className="group hover:shadow-md transition-shadow">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Latência Média</p>
            <p className="text-2xl font-bold mt-1">{stats?.averageLatency || 0}ms</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              Latência por Serviço (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {barData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} label={{ value: 'ms', position: 'insideTopLeft', offset: -5, fontSize: 10, fill: 'var(--muted-foreground)' }} />
                    <RechartsTooltip
                      formatter={(value: number, _name: string, props: { payload: { fullName: string } }) => [`${value}ms`, props.payload.fullName]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    <Bar dataKey="latency" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados disponíveis</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              Distribuição Up/Down
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats && stats.totalServices > 0 ? (
              <div className="h-64 flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip contentStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute flex flex-col items-center gap-1">
                  <span className="text-2xl font-bold">{stats.totalServices}</span>
                  <span className="text-xs text-muted-foreground">serviços</span>
                </div>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">Sem dados disponíveis</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ======================== SERVICES TAB ========================
function ServicesTab() {
  const api = useApi()
  const [services, setServices] = useState<ServiceItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadServices = async () => {
    setLoading(true)
    const data = await api.get('/api/services')
    if (data) setServices(data)
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/services')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (!cancelled) setServices(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingService, setEditingService] = useState<ServiceItem | null>(null)
  const [formName, setFormName] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formUrl, setFormUrl] = useState('')
  const [formMethod, setFormMethod] = useState('GET')
  const [formTimeout, setFormTimeout] = useState('30000')
  const [formInterval, setFormInterval] = useState('60')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null)



  const openCreate = () => {
    setEditingService(null)
    setFormName('')
    setFormDesc('')
    setFormUrl('')
    setFormMethod('GET')
    setFormTimeout('30000')
    setFormInterval('60')
    setFormErrors({})
    setDialogOpen(true)
  }

  const openEdit = (svc: ServiceItem) => {
    setEditingService(svc)
    setFormName(svc.name)
    setFormDesc(svc.description || '')
    setFormUrl(svc.url)
    setFormMethod(svc.method)
    setFormTimeout(String(svc.timeout))
    setFormInterval(String(svc.interval))
    setFormErrors({})
    setDialogOpen(true)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formName.trim()) errors.name = 'Nome é obrigatório'
    try { new URL(formUrl) } catch { errors.url = 'URL inválida' }
    const timeout = Number(formTimeout)
    if (isNaN(timeout) || timeout < 5000 || timeout > 120000) errors.timeout = 'Timeout entre 5000 e 120000ms'
    const interval = Number(formInterval)
    if (isNaN(interval) || interval < 30 || interval > 3600) errors.interval = 'Intervalo entre 30 e 3600 segundos'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return
    setSaving(true)

    const body = {
      name: formName.trim(),
      description: formDesc.trim() || undefined,
      url: formUrl.trim(),
      method: formMethod,
      timeout: Number(formTimeout),
      interval: Number(formInterval),
    }

    let result
    if (editingService) {
      result = await api.put(`/api/services/${editingService.id}`, body)
      if (result) {
        toast.success('Serviço atualizado com sucesso')
        setDialogOpen(false)
        loadServices()
      } else {
        toast.error(api.error || 'Erro ao atualizar serviço')
      }
    } else {
      result = await api.post('/api/services', body)
      if (result) {
        toast.success('Serviço criado com sucesso')
        setDialogOpen(false)
        loadServices()
      } else {
        toast.error(api.error || 'Erro ao criar serviço')
      }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const result = await api.del(`/api/services/${deleteId}`)
    if (result) {
      toast.success('Serviço removido com sucesso')
      loadServices()
    } else {
      toast.error(api.error || 'Erro ao remover serviço')
    }
    setDeleteId(null)
  }

  const toggleActive = async (svc: ServiceItem) => {
    const result = await api.put(`/api/services/${svc.id}`, { active: !svc.active })
    if (result) {
      toast.success(svc.active ? 'Serviço desativado' : 'Serviço ativado')
      fetchServices()
    } else {
      toast.error(api.error || 'Erro ao alterar status')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Serviços</h2>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Serviço
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : services.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Server className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum serviço cadastrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead className="hidden md:table-cell">URL</TableHead>
                    <TableHead className="hidden sm:table-cell">Método</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Intervalo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map(svc => (
                    <TableRow key={svc.id}>
                      <TableCell className="font-medium max-w-[200px] truncate">{svc.name}</TableCell>
                      <TableCell className="hidden md:table-cell max-w-[250px] truncate text-muted-foreground text-xs">{svc.url}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="secondary" className="text-[10px] font-mono">{svc.method}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={svc.active}
                          onCheckedChange={() => toggleActive(svc)}
                        />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">{svc.interval}s</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(svc)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteId(svc.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingService ? 'Editar Serviço' : 'Novo Serviço'}</DialogTitle>
            <DialogDescription>
              {editingService ? 'Altere as informações do serviço.' : 'Preencha os dados para monitorar um novo serviço.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="svc-name">Nome *</Label>
              <Input id="svc-name" value={formName} onChange={e => setFormName(e.target.value)} placeholder="Meu Serviço" />
              {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="svc-desc">Descrição</Label>
              <Textarea id="svc-desc" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Descrição opcional do serviço..." rows={2} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="svc-url">URL *</Label>
              <Input id="svc-url" value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://exemplo.com/health" />
              {formErrors.url && <p className="text-xs text-red-500">{formErrors.url}</p>}
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Método</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="HEAD">HEAD</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="svc-timeout">Timeout (ms)</Label>
                <Input id="svc-timeout" type="number" value={formTimeout} onChange={e => setFormTimeout(e.target.value)} />
                {formErrors.timeout && <p className="text-xs text-red-500">{formErrors.timeout}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="svc-interval">Intervalo (s)</Label>
                <Input id="svc-interval" type="number" value={formInterval} onChange={e => setFormInterval(e.target.value)} />
                {formErrors.interval && <p className="text-xs text-red-500">{formErrors.interval}</p>}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editingService ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover este serviço? Esta ação não pode ser desfeita e todos os dados associados serão perdidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ======================== INCIDENTS TAB ========================
function IncidentsTab() {
  const api = useApi()
  const [incidents, setIncidents] = useState<IncidentItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadIncidents = async () => {
    setLoading(true)
    const data = await api.get('/api/incidents?limit=100')
    if (data) setIncidents(data.incidents || [])
    setLoading(false)
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/incidents?limit=100')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (!cancelled) setIncidents(data.incidents || []) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const updateStatus = async (id: string, status: string) => {
    const result = await api.put(`/api/incidents/${id}`, { status })
    if (result) {
      toast.success('Status atualizado')
      loadIncidents()
    } else {
      toast.error(api.error || 'Erro ao atualizar')
    }
  }

  const statusOptions = [
    { value: 'investigating', label: 'Investigando', color: 'text-red-500' },
    { value: 'identified', label: 'Identificado', color: 'text-amber-500' },
    { value: 'monitoring', label: 'Monitorando', color: 'text-blue-500' },
    { value: 'resolved', label: 'Resolvido', color: 'text-emerald-500' },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Incidentes</h2>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : incidents.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-emerald-500 opacity-60" />
              <p className="text-sm">Nenhum incidente registrado.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead className="hidden sm:table-cell">Serviço</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Início</TableHead>
                    <TableHead className="hidden lg:table-cell">Duração</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map(inc => {
                    const statusOpt = statusOptions.find(o => o.value === inc.status)
                    return (
                      <TableRow key={inc.id}>
                        <TableCell className="font-medium max-w-[200px] truncate">{inc.title}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">{inc.service?.name || '—'}</TableCell>
                        <TableCell>
                          <Select value={inc.status} onValueChange={v => updateStatus(inc.id, v)}>
                            <SelectTrigger className={`h-7 w-[130px] text-xs ${statusOpt?.color || ''}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {statusOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value} className={opt.color}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                          {format(parseISO(inc.startedAt), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-xs">
                          {inc.endedAt ? formatDuration(inc.duration) : 'Em andamento'}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ======================== MAINTENANCE TAB ========================
function MaintenanceTab() {
  const api = useApi()
  const [items, setItems] = useState<MaintenanceItem[]>([])
  const [loading, setLoading] = useState(true)

  const loadItems = async () => {
    setLoading(true)
    const data = await api.get('/api/maintenance')
    if (data) setItems(data)
    setLoading(false)
  }

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MaintenanceItem | null>(null)
  const [formTitle, setFormTitle] = useState('')
  const [formDesc, setFormDesc] = useState('')
  const [formStarts, setFormStarts] = useState('')
  const [formEnds, setFormEnds] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const [deleteId, setDeleteId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/maintenance')
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then(data => { if (!cancelled) setItems(data) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const toLocalDatetime = (isoStr: string) => {
    const d = new Date(isoStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const openCreate = () => {
    setEditing(null)
    setFormTitle('')
    setFormDesc('')
    const now = new Date()
    const later = new Date(now.getTime() + 3600000)
    setFormStarts(toLocalDatetime(now.toISOString()))
    setFormEnds(toLocalDatetime(later.toISOString()))
    setFormErrors({})
    setDialogOpen(true)
  }

  const openEdit = (m: MaintenanceItem) => {
    setEditing(m)
    setFormTitle(m.title)
    setFormDesc(m.description || '')
    setFormStarts(toLocalDatetime(m.startsAt))
    setFormEnds(m.endsAt ? toLocalDatetime(m.endsAt) : '')
    setFormErrors({})
    setDialogOpen(true)
  }

  const validateForm = () => {
    const errors: Record<string, string> = {}
    if (!formTitle.trim()) errors.title = 'Título é obrigatório'
    if (!formStarts) errors.startsAt = 'Data de início é obrigatória'
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSave = async () => {
    if (!validateForm()) return
    setSaving(true)

    const body = {
      title: formTitle.trim(),
      description: formDesc.trim() || undefined,
      startsAt: new Date(formStarts).toISOString(),
      endsAt: formEnds ? new Date(formEnds).toISOString() : null,
    }

    let result
    if (editing) {
      result = await api.put(`/api/maintenance/${editing.id}`, body)
      if (result) {
        toast.success('Manutenção atualizada')
        setDialogOpen(false)
        loadItems()
      }
    } else {
      result = await api.post('/api/maintenance', body)
      if (result) {
        toast.success('Manutenção criada')
        setDialogOpen(false)
        loadItems()
      }
    }
    if (!result) toast.error(api.error || 'Erro ao salvar')
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!deleteId) return
    const result = await api.del(`/api/maintenance/${deleteId}`)
    if (result) {
      toast.success('Manutenção removida')
      loadItems()
    } else {
      toast.error(api.error || 'Erro ao remover')
    }
    setDeleteId(null)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Manutenções</h2>
        <Button size="sm" onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Manutenção
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Wrench className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhuma manutenção programada.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {items.map(m => {
                const now = new Date()
                const isActive = m.active && new Date(m.startsAt) <= now && (!m.endsAt || new Date(m.endsAt) > now)
                const isUpcoming = new Date(m.startsAt) > now
                return (
                  <div key={m.id} className="p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors">
                    <div className={`mt-1 h-3 w-3 rounded-full shrink-0 ${isActive ? 'bg-blue-500 animate-pulse' : isUpcoming ? 'bg-amber-500' : 'bg-slate-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="font-medium text-sm">{m.title}</p>
                        <Badge variant="outline" className={`text-[10px] h-5 ${isActive ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20' : isUpcoming ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'}`}>
                          {isActive ? 'Em andamento' : isUpcoming ? 'Agendada' : 'Finalizada'}
                        </Badge>
                      </div>
                      {m.description && <p className="text-xs text-muted-foreground mb-1 line-clamp-2">{m.description}</p>}
                      <p className="text-xs text-muted-foreground">
                        <span>{format(parseISO(m.startsAt), "dd/MM/yyyy 'às' HH:mm")}</span>
                        {m.endsAt && <span> → {format(parseISO(m.endsAt), "dd/MM/yyyy 'às' HH:mm")}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600" onClick={() => setDeleteId(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Manutenção' : 'Nova Manutenção'}</DialogTitle>
            <DialogDescription>Informe o período e descrição da manutenção.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="mnt-title">Título *</Label>
              <Input id="mnt-title" value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="Manutenção no servidor X" />
              {formErrors.title && <p className="text-xs text-red-500">{formErrors.title}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="mnt-desc">Descrição</Label>
              <Textarea id="mnt-desc" value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Detalhes da manutenção..." rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mnt-start">Início *</Label>
                <Input id="mnt-start" type="datetime-local" value={formStarts} onChange={e => setFormStarts(e.target.value)} />
                {formErrors.startsAt && <p className="text-xs text-red-500">{formErrors.startsAt}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="mnt-end">Fim (opcional)</Label>
                <Input id="mnt-end" type="datetime-local" value={formEnds} onChange={e => setFormEnds(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>Tem certeza que deseja remover esta manutenção?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ======================== HISTORY TAB ========================
function HistoryTab() {
  const api = useApi()
  const [services, setServices] = useState<ServiceItem[]>([])
  const [selectedService, setSelectedService] = useState('')
  const [period, setPeriod] = useState('24h')
  const [checks, setChecks] = useState<HistoryCheck[]>([])
  const [loading, setLoading] = useState(false)
  const [stats, setStats] = useState<{ total: number; up: number; down: number; avgLatency: number; availability: number } | null>(null)

  useEffect(() => {
    const load = async () => {
      const data = await api.get('/api/services')
      if (data && data.length > 0) {
        setServices(data)
        setSelectedService(data[0].id)
      }
    }
    load()
  }, [api])

  useEffect(() => {
    if (!selectedService) return
    const load = async () => {
      setLoading(true)
      const data = await api.get(`/api/history?serviceId=${selectedService}&period=${period}`)
      if (data) {
        setChecks(data.checks || [])
        setStats(data.stats || null)
      }
      setLoading(false)
    }
    load()
  }, [selectedService, period, api])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <h2 className="text-lg font-semibold">Histórico</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedService} onValueChange={setSelectedService}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="Selecione um serviço" />
            </SelectTrigger>
            <SelectContent>
              {services.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg border border-border overflow-hidden">
            {['24h', '7d', '30d', '90d'].map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:bg-muted'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats summary */}
      {stats && !loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-lg font-bold">{stats.total}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponível</p>
            <p className="text-lg font-bold text-emerald-500">{stats.up}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Indisponível</p>
            <p className="text-lg font-bold text-red-500">{stats.down}</p>
          </Card>
          <Card className="p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Disponibilidade</p>
            <p className="text-lg font-bold text-emerald-500">{stats.availability.toFixed(1)}%</p>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : checks.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Clock className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum registro encontrado.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Horário</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden sm:table-cell">Código</TableHead>
                    <TableHead className="hidden md:table-cell">Latência</TableHead>
                    <TableHead className="hidden lg:table-cell">Erro</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checks.slice().reverse().map(check => (
                    <TableRow key={check.id}>
                      <TableCell className="text-xs font-mono">
                        {format(parseISO(check.checkedAt), "dd/MM/yyyy HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        {check.status === 'up' ? (
                          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                            <CheckCircle className="h-3 w-3 mr-1" /> Up
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20 text-[10px]">
                            <XCircle className="h-3 w-3 mr-1" /> Down
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">{check.statusCode || '—'}</TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">{check.latency ? `${check.latency}ms` : '—'}</TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-red-400 max-w-[200px] truncate">{check.error || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ======================== MAIN ADMIN PANEL ========================
export function AdminPanel({ user, onLogout }: AdminPanelProps) {
  const { theme, setTheme } = useTheme()

  const emptySubscribe = () => () => {}
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)

  const [activeTab, setActiveTab] = useState('dashboard')

  if (!mounted) return null

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10">
              <Activity className="h-5 w-5 text-emerald-500" />
            </div>
            <span className="text-lg font-semibold tracking-tight hidden sm:inline">StatusPage</span>
            <Badge variant="outline" className="text-[10px] font-mono hidden sm:inline-flex">Admin</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="h-9 w-9"
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>

            <Separator orientation="vertical" className="h-6 mx-1" />

            <div className="flex items-center gap-2 mr-2">
              <div className="h-7 w-7 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{user.username.charAt(0).toUpperCase()}</span>
              </div>
              <span className="text-sm font-medium hidden md:inline">{user.username}</span>
            </div>

            <Button variant="outline" size="sm" onClick={onLogout} className="h-9 gap-2 text-red-500 hover:text-red-600 border-red-500/20 hover:bg-red-500/5">
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="border-b border-border/40 bg-background/50 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto py-2 -mb-px scrollbar-none">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
              { id: 'services', label: 'Serviços', icon: Server },
              { id: 'incidents', label: 'Incidentes', icon: AlertTriangle },
              { id: 'maintenance', label: 'Manutenções', icon: Wrench },
              { id: 'history', label: 'Histórico', icon: Clock },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <DashboardTab />}
            {activeTab === 'services' && <ServicesTab />}
            {activeTab === 'incidents' && <IncidentsTab />}
            {activeTab === 'maintenance' && <MaintenanceTab />}
            {activeTab === 'history' && <HistoryTab />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/40 bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Activity className="h-3 w-3" />
            StatusPage Monitor
          </p>
          <p className="text-xs text-muted-foreground">Painel Administrativo</p>
        </div>
      </footer>
    </div>
  )
}