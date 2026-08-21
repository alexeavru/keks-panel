import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

interface NamespaceFilterProps {
  namespaces: string[]
  value: string
  onChange: (value: string) => void
}

export function NamespaceFilter({ namespaces, value, onChange }: NamespaceFilterProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const options =
    value && !namespaces.includes(value) ? [value, ...namespaces] : namespaces

  const label = value || 'Все namespaces'
  const prefix = query.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!prefix) return options
    return options.filter((ns) => ns.toLowerCase().startsWith(prefix))
  }, [options, prefix])

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
    const id = window.requestAnimationFrame(() => inputRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const toggle = () => {
    setOpen((v) => {
      if (v) setQuery('')
      return !v
    })
  }

  return (
    <div ref={rootRef} className="relative w-full min-w-[160px]">
      <span className="sr-only">Namespace</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        className="field flex items-center justify-between gap-2 bg-white pr-2.5 text-left"
        onClick={toggle}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 flex w-[220px] flex-col overflow-hidden rounded-lg border border-ink-200 bg-white shadow-lg">
          <div className="relative shrink-0 border-b border-ink-100 px-2 py-2">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-400" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (filtered.length === 1) choose(filtered[0])
                  else if (!prefix) choose('')
                }
              }}
              placeholder="Имя…"
              className="w-full rounded-md border border-ink-200 bg-white py-1.5 pl-8 pr-2 font-mono text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20"
            />
          </div>
          <ul role="listbox" className="max-h-[calc(10*2.5rem+0.75rem)] overflow-auto py-1.5">
            {!prefix && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className={`flex h-10 w-full items-center justify-between gap-2 px-3.5 text-left font-mono text-sm hover:bg-ink-50 ${
                    !value ? 'text-ink-900' : 'text-ink-700'
                  }`}
                  onClick={() => choose('')}
                >
                  <span className="truncate">Все namespaces</span>
                  {!value && <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" />}
                </button>
              </li>
            )}
            {filtered.map((ns) => (
              <li key={ns}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ns}
                  className={`flex h-10 w-full items-center justify-between gap-2 px-3.5 text-left font-mono text-sm hover:bg-ink-50 ${
                    value === ns ? 'text-ink-900' : 'text-ink-700'
                  }`}
                  onClick={() => choose(ns)}
                >
                  <span className="truncate">{ns}</span>
                  {value === ns && <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" />}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3.5 py-2.5 font-mono text-sm text-ink-400">Ничего не найдено</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
