import { X } from 'lucide-react'
import { resourceToYaml } from '@/lib/k8s-client'

interface ResourceDrawerProps {
  open: boolean
  title: string
  subtitle?: string
  resource: unknown | null
  onClose: () => void
}

export function ResourceDrawer({ open, title, subtitle, resource, onClose }: ResourceDrawerProps) {
  if (!open || !resource) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Закрыть"
        className="absolute inset-0 bg-ink-950/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-ink-200 bg-[#f7faf8] shadow-panel animate-in">
        <header className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-500">
              {subtitle ?? 'Resource'}
            </p>
            <h2 className="mt-1 truncate font-display text-xl font-bold text-ink-900">{title}</h2>
          </div>
          <button type="button" className="btn-ghost shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-auto p-5">
          <pre className="overflow-x-auto rounded-xl border border-ink-200 bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-leaf-400">
            {resourceToYaml(resource)}
          </pre>
        </div>
      </aside>
    </div>
  )
}
