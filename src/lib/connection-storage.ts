import type { ClusterConnection } from '@/types/k8s'

const STORAGE_KEY = 'keks.connection'

export function loadConnection(): ClusterConnection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ClusterConnection
    // migrate session → local
    localStorage.setItem(STORAGE_KEY, raw)
    return parsed
  } catch {
    return null
  }
}

export function saveConnection(connection: ClusterConnection): void {
  const raw = JSON.stringify(connection)
  localStorage.setItem(STORAGE_KEY, raw)
  sessionStorage.setItem(STORAGE_KEY, raw)
}

export function clearConnection(): void {
  localStorage.removeItem(STORAGE_KEY)
  sessionStorage.removeItem(STORAGE_KEY)
}
