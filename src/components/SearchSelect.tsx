import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

interface SearchSelectProps {
  value: string
  options: string[]
  onChange: (value: string) => void
  placeholder?: string
  emptyOption?: { value: string; label: string }
  disabled?: boolean
  searchPlaceholder?: string
  ariaLabel?: string
  menuClassName?: string
  className?: string
  searchable?: boolean
}

export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = 'Выберите…',
  emptyOption,
  disabled = false,
  searchPlaceholder = 'Имя…',
  ariaLabel,
  menuClassName = 'w-full',
  className = '',
  searchable = true,
}: SearchSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const list =
    value && !options.includes(value) && value !== emptyOption?.value
      ? [value, ...options]
      : options

  const prefix = query.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!prefix) return list
    return list.filter((item) => item.toLowerCase().startsWith(prefix))
  }, [list, prefix])

  const isEmpty = emptyOption ? value === emptyOption.value : !value
  const label = isEmpty ? emptyOption?.label ?? placeholder : value

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
    const id = window.requestAnimationFrame(() => {
      if (searchable) inputRef.current?.focus()
    })
    return () => {
      window.cancelAnimationFrame(id)
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, searchable])

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const toggle = () => {
    if (disabled) return
    setOpen((v) => {
      if (v) setQuery('')
      return !v
    })
  }

  return (
    <div ref={rootRef} className={`relative w-full min-w-[160px] ${className}`}>
      {ariaLabel && <span className="sr-only">{ariaLabel}</span>}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className="field flex items-center justify-between gap-2 bg-white pr-2.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
        onClick={toggle}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-500 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && !disabled && (
        <div
          className={`absolute z-50 mt-1 flex flex-col overflow-hidden rounded border border-ink-200 bg-white shadow-lg ${menuClassName}`}
        >
          {searchable && (
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
                    else if (!prefix && emptyOption) choose(emptyOption.value)
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full rounded-md border border-ink-200 bg-white py-1.5 pl-8 pr-2 font-mono text-sm text-ink-900 outline-none placeholder:text-ink-400 focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20"
              />
            </div>
          )}
          <ul role="listbox" className="max-h-[calc(10*2.5rem+0.75rem)] overflow-auto py-1.5">
            {!prefix && emptyOption && (
              <li>
                <button
                  type="button"
                  role="option"
                  aria-selected={isEmpty}
                  className={`flex h-10 w-full items-center justify-between gap-2 px-3.5 text-left font-mono text-sm hover:bg-ink-50 ${
                    isEmpty ? 'text-ink-900' : 'text-ink-700'
                  }`}
                  onClick={() => choose(emptyOption.value)}
                >
                  <span className="truncate">{emptyOption.label}</span>
                  {isEmpty && <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" />}
                </button>
              </li>
            )}
            {filtered.map((item) => (
              <li key={item}>
                <button
                  type="button"
                  role="option"
                  aria-selected={value === item}
                  className={`flex h-10 w-full items-center justify-between gap-2 px-3.5 text-left font-mono text-sm hover:bg-ink-50 ${
                    value === item ? 'text-ink-900' : 'text-ink-700'
                  }`}
                  onClick={() => choose(item)}
                >
                  <span className="truncate">{item}</span>
                  {value === item && <Check className="h-3.5 w-3.5 shrink-0 text-leaf-600" />}
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
