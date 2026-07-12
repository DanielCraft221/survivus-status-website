'use client'
import { useState, useCallback } from 'react'

export function useApi() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const get = useCallback(async (url: string) => {
    setLoading(true); setError(null)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Erro ${res.status}`)
      return await res.json()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      return null
    } finally { setLoading(false) }
  }, [])

  const post = useCallback(async (url: string, body?: unknown) => {
    setLoading(true); setError(null)
    try {
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      return null
    } finally { setLoading(false) }
  }, [])

  const put = useCallback(async (url: string, body?: unknown) => {
    setLoading(true); setError(null)
    try {
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      return null
    } finally { setLoading(false) }
  }, [])

  const del = useCallback(async (url: string) => {
    setLoading(true); setError(null)
    try {
      const token = document.cookie.split(';').find(c => c.trim().startsWith('token='))?.split('=')[1]
      const res = await fetch(url, {
        method: 'DELETE',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Erro ${res.status}`)
      return data
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro desconhecido')
      return null
    } finally { setLoading(false) }
  }, [])

  return { loading, error, get, post, put, del }
}