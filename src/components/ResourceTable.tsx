import { useMemo, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

export interface Column<T> {
  key: string
  header: ReactNode
  className?: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => number | undefined
}

interface ResourceTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
  empty?: string
  loading?: boolean
}

type SortDir = 'asc' | 'desc'

export function ResourceTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  empty = 'Нет ресурсов',
  loading,
}: ResourceTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sortValue) return rows
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = col.sortValue!(a)
      const bv = col.sortValue!(b)
      const aMissing = av == null || !Number.isFinite(av)
      const bMissing = bv == null || !Number.isFinite(bv)
      if (aMissing && bMissing) return 0
      if (aMissing) return 1
      if (bMissing) return -1
      const diff = av - bv
      return sort.dir === 'asc' ? diff : -diff
    })
    return copy
  }, [rows, columns, sort])

  const toggleSort = (key: string) => {
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'desc' }
      if (prev.dir === 'desc') return { key, dir: 'asc' }
      return null
    })
  }

  if (loading) {
    return (
      <div className="surface overflow-hidden">
        <div className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-ink-100/80" />
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="surface flex min-h-[220px] items-center justify-center p-8">
        <p className="font-mono text-sm text-ink-500">{empty}</p>
      </div>
    )
  }

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink-200/80 bg-ink-50/70">
              {columns.map((col) => {
                const sortable = Boolean(col.sortValue)
                const active = sort?.key === col.key
                return (
                  <th
                    key={col.key}
                    className={`px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500 ${col.className ?? ''}`}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        className={`inline-flex items-center gap-0.5 uppercase tracking-[0.1em] ${
                          active ? 'text-ink-800' : 'hover:text-ink-700'
                        }`}
                        onClick={() => toggleSort(col.key)}
                      >
                        {col.header}
                        {active ? (
                          sort.dir === 'desc' ? (
                            <ChevronDown className="h-3.5 w-3.5" />
                          ) : (
                            <ChevronUp className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 opacity-30" />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-ink-100 last:border-0 ${
                  onRowClick
                    ? 'cursor-pointer transition hover:bg-leaf-500/[0.06]'
                    : ''
                } ${rowClassName?.(row) ?? ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className={`px-4 py-3 align-middle ${col.className ?? ''}`}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
