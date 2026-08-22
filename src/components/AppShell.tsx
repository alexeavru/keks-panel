import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  Boxes,
  Cable,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Network,
  Server,
  Layers,
  type LucideIcon,
} from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { useAuth } from '@/context/AuthContext'
import { listNamespaces } from '@/lib/k8s-client'
import { shortHost } from '@/lib/format'
import { NamespaceFilter } from '@/components/NamespaceFilter'

const topNav = [
  { to: '/cluster', label: 'Обзор', icon: LayoutDashboard, end: true },
  { to: '/cluster/namespaces', label: 'Namespaces', icon: Layers },
]

const workloadNav = [
  { to: '/cluster/pods', label: 'Pods' },
  { to: '/cluster/deployments', label: 'Deployments' },
  { to: '/cluster/statefulsets', label: 'StatefulSets' },
  { to: '/cluster/configmaps', label: 'ConfigMaps' },
]

const networkingNav = [
  { to: '/cluster/services', label: 'Services' },
  { to: '/cluster/ingresses', label: 'Ingresses' },
]

const bottomNav = [{ to: '/cluster/nodes', label: 'Nodes', icon: Server }]

const WORKLOAD_KEY = 'keks.nav.workload'
const NETWORKING_KEY = 'keks.nav.networking'

function loadNavOpen(key: string): boolean {
  try {
    const saved = localStorage.getItem(key)
    if (saved === '0') return false
    if (saved === '1') return true
  } catch {
    /* ignore */
  }
  return true
}

function persistNavOpen(key: string, open: boolean) {
  try {
    localStorage.setItem(key, open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function navClass(isActive: boolean) {
  return `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-ink-900 text-ink-50' : 'text-ink-700 hover:bg-ink-100/80'
  }`
}

function childNavClass(isActive: boolean) {
  return `flex items-center rounded-lg px-3 py-2 text-sm font-medium transition ${
    isActive ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-700 hover:bg-white/70'
  }`
}

function SidebarLink({
  to,
  end,
  className,
  children,
}: {
  to: string
  end?: boolean
  className: (props: { isActive: boolean }) => string
  children: ReactNode
}) {
  const location = useLocation()
  const navigate = useNavigate()
  return (
    <NavLink
      to={to}
      end={end}
      className={className}
      onClick={(e) => {
        if (location.pathname !== to) return
        e.preventDefault()
        navigate(to, { replace: true, state: { reset: Date.now() } })
      }}
    >
      {children}
    </NavLink>
  )
}

function NavGroup({
  title,
  icon: Icon,
  open,
  onToggle,
  items,
}: {
  title: string
  icon: LucideIcon
  open: boolean
  onToggle: () => void
  items: { to: string; label: string }[]
}) {
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-medium text-ink-900 shadow-sm"
        onClick={onToggle}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 opacity-80" />
          {title}
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? '' : '-rotate-90'}`}
        />
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-0.5 pl-3">
          {items.map(({ to, label }) => (
            <SidebarLink key={to} to={to} className={({ isActive }) => childNavClass(isActive)}>
              {label}
            </SidebarLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function AppShell() {
  const { connection, disconnect, namespace, setNamespace } = useCluster()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [workloadOpen, setWorkloadOpen] = useState(() => loadNavOpen(WORKLOAD_KEY))
  const [networkingOpen, setNetworkingOpen] = useState(() => loadNavOpen(NETWORKING_KEY))

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

  const toggleWorkload = () => {
    setWorkloadOpen((open) => {
      const next = !open
      persistNavOpen(WORKLOAD_KEY, next)
      return next
    })
  }

  const toggleNetworking = () => {
    setNetworkingOpen((open) => {
      const next = !open
      persistNavOpen(NETWORKING_KEY, next)
      return next
    })
  }

  return (
    <div className="flex min-h-screen bg-ink-50 bg-tri-grid">
        <aside className="sticky top-0 flex h-screen w-[240px] shrink-0 flex-col border-r border-ink-200/70 bg-white/80 px-4 py-5 backdrop-blur-md">
          <div className="mb-6 px-2">
            <p className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
              KEKS
            </p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-500">
              panel · 0.3.1
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

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {topNav.map(({ to, label, icon: Icon, end }) => (
              <SidebarLink key={to} to={to} end={end} className={({ isActive }) => navClass(isActive)}>
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </SidebarLink>
            ))}

            <NavGroup
              title="Workload"
              icon={Boxes}
              open={workloadOpen}
              onToggle={toggleWorkload}
              items={workloadNav}
            />

            <NavGroup
              title="Networking"
              icon={Network}
              open={networkingOpen}
              onToggle={toggleNetworking}
              items={networkingNav}
            />

            {bottomNav.map(({ to, label, icon: Icon }) => (
              <SidebarLink key={to} to={to} className={({ isActive }) => navClass(isActive)}>
                <Icon className="h-4 w-4 shrink-0 opacity-80" />
                {label}
              </SidebarLink>
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
                  {connection.mode === 'kubeconfig' ? 'kubeconfig' : 'live'}
                </span>
              </div>
              <p className="truncate text-sm font-semibold text-ink-900">{connection.name}</p>
              <p className="truncate font-mono text-[11px] text-ink-500">
                {connection.host ? shortHost(connection.host) : connection.context ?? '—'}
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
