import {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
  type ReactNode,
} from 'react'
import {
  clearConnection,
  loadConnection,
  saveConnection,
  testConnection,
} from '@/lib/k8s-client'
import type { ClusterConnection } from '@/types/k8s'

const NS_KEY = 'keks.namespace'

function loadNamespace(): string {
  try {
    return localStorage.getItem(NS_KEY) ?? sessionStorage.getItem(NS_KEY) ?? ''
  } catch {
    return ''
  }
}

function persistNamespace(ns: string) {
  try {
    if (ns) {
      localStorage.setItem(NS_KEY, ns)
      sessionStorage.setItem(NS_KEY, ns)
    } else {
      localStorage.removeItem(NS_KEY)
      sessionStorage.removeItem(NS_KEY)
    }
  } catch {
    // ignore
  }
}

interface ClusterContextValue {
  connection: ClusterConnection | null
  connecting: boolean
  error: string | null
  namespace: string
  setNamespace: (namespace: string) => void
  connect: (input: Omit<ClusterConnection, 'connectedAt'>) => Promise<void>
  disconnect: () => void
}

const ClusterContext = createContext<ClusterContextValue | null>(null)

export function ClusterProvider({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<ClusterConnection | null>(() => loadConnection())
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [namespace, setNamespaceState] = useState<string>(() => loadNamespace())

  const setNamespace = useCallback((next: string) => {
    setNamespaceState(next)
    persistNamespace(next)
  }, [])

  const connect = useCallback(async (input: Omit<ClusterConnection, 'connectedAt'>) => {
    setConnecting(true)
    setError(null)
    try {
      const draft: ClusterConnection = {
        ...input,
        connectedAt: new Date().toISOString(),
      }
      const next = await testConnection(draft)
      next.connectedAt = draft.connectedAt
      saveConnection(next)
      setConnection(next)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось подключиться'
      setError(message)
      throw err
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    clearConnection()
    persistNamespace('')
    setConnection(null)
    setNamespaceState('')
    setError(null)
  }, [])

  const value = useMemo(
    () => ({
      connection,
      connecting,
      error,
      namespace,
      setNamespace,
      connect,
      disconnect,
    }),
    [connection, connecting, error, namespace, setNamespace, connect, disconnect],
  )

  return <ClusterContext.Provider value={value}>{children}</ClusterContext.Provider>
}

export function useCluster() {
  const ctx = useContext(ClusterContext)
  if (!ctx) throw new Error('useCluster must be used within ClusterProvider')
  return ctx
}
