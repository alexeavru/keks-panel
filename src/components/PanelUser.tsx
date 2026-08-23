import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, LogOut, User } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCluster } from '@/context/ClusterContext'

export function PanelUser() {
  const { user, logout } = useAuth()
  const { disconnect } = useCluster()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null
  const label = user.email || user.name || user.sub

  const handleLogout = async () => {
    setOpen(false)
    disconnect()
    await logout()
    navigate('/login')
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        className="inline-flex max-w-[280px] items-center gap-2 rounded-lg px-2 py-1 text-left transition hover:bg-ink-100/80"
        onClick={() => setOpen((v) => !v)}
      >
        <User className="h-4 w-4 shrink-0 text-ink-500" />
        <span className="truncate font-mono text-base text-ink-700">{label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1 min-w-full overflow-hidden rounded border border-ink-200 bg-white py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 px-3.5 py-2 text-left text-sm text-ink-700 hover:bg-ink-50"
            onClick={() => void handleLogout()}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}
