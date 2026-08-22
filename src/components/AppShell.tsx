import { useEffect, useState } from 'react'
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import {
  Box,
  Boxes,
  Cable,
  LayoutDashboard,
  LogOut,
  Network,
  Server,
  Database,
  FileCode,
  Layers,
} from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { useAuth } from '@/context/AuthContext'
import { listNamespaces } from '@/lib/k8s-client'
import { shortHost } from '@/lib/format'
import { NamespaceFilter } from '@/components/NamespaceFilter'

const nav = [
  { to: '/cluster', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/cluster/namespaces', label: 'Namespaces', icon: Layers },
  { to: '/cluster/pods', label: 'Pods', icon: Box },
  { to: '/cluster/deployments', label: 'Deployments', icon: Boxes },
  { to: '/cluster/statefulsets', label: 'StatefulSets', icon: Database },
  { to: '/cluster/services', label: 'Services', icon: Network },
  { to: '/cluster/configmaps', label: 'ConfigMaps', icon: FileCode },
  { to: '/cluster/nodes', label: 'Nodes', icon: Server },
]

export function AppShell() {
  const { connection, disconnect, namespace, setNamespace } = useCluster()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [namespaces, setNamespaces] = useState<string[]>([])

  useEffect(() => {
    if (!connection) return
    let cancelled = false
    void listNamespaces(connection)
      .then((items) => {
        if (cancelled) return
        setNamespaces(items.map((n) => n.metadata.name).sort())
      })
      .catch(() => {
        /* keep previous */
      })
    return () => {
      cancelled = true
    }
  }, [connection])

  if (!connection) {
    return <Navigate to="/connect" replace />
  }

  const handleDisconnect = () => {
    disconnect()
    navigate('/connect')
  }

  const handleLogout = async () => {
    disconnect()
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen bg-wash bg-grid">
        <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-ink-200/70 bg-white/80 px-4 py-5 backdrop-blur-md">
          <div className="mb-6 px-2">
            <p className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
              KEKS
            </p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              panel · 0.3.0
            </p>
          </div>

          <div className="mb-4 px-1">
            <p className="label mb-1.5 px-1">Namespace</p>
            <NamespaceFilter
              namespaces={namespaces}
              value={namespace}
              onChange={setNamespace}
            />
          </div>

          <nav className="flex flex-1 flex-col gap-1">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-ink-900 text-ink-50'
                      : 'text-ink-700 hover:bg-ink-100/80'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-4 space-y-3 border-t border-ink-200 pt-4">
            {user && (
              <p className="truncate px-1 font-mono text-[11px] text-ink-500" title={user.email || user.name}>
                {user.email || user.name}
              </p>
            )}
            <div className="rounded border border-ink-200 bg-white/70 px-3 py-3">
              <div className="mb-1 flex items-center gap-1.5 text-ink-500">
                <Cable className="h-3.5 w-3.5" />
                <span className="font-mono text-[10px] uppercase tracking-[0.12em]">
                  {connection.mode === 'demo'
                    ? 'demo'
                    : connection.mode === 'kubeconfig'
                      ? 'kubeconfig'
                      : 'live'}
                </span>
              </div>
              <p className="truncate text-sm font-semibold text-ink-900">{connection.name}</p>
              <p className="truncate font-mono text-[11px] text-ink-500">
                {connection.mode === 'demo'
                  ? 'локальный снимок'
                  : connection.host
                    ? shortHost(connection.host)
                    : connection.context ?? '—'}
              </p>
            </div>
            <button type="button" className="btn-ghost w-full justify-start" onClick={handleDisconnect}>
              <LogOut className="h-4 w-4" />
              Отключиться
            </button>
            <button type="button" className="btn-ghost w-full justify-start" onClick={() => void handleLogout()}>
              Выйти из Dex
            </button>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-6 py-8 sm:px-8">
          <Outlet />
        </main>
    </div>
  )
}
