import type { ReactNode } from 'react'
import { PanelUser } from '@/components/PanelUser'

interface PageHeaderProps {
  title: string
  description?: string
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-ink-500">{description}</p> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <PanelUser />
      </div>
    </div>
  )
}
