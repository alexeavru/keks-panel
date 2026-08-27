import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Columns2, X } from 'lucide-react'
import { useCluster } from '@/context/ClusterContext'
import { fetchConfigMapDetail, listConfigMaps, listNamespaces, saveConfigMapYaml } from '@/lib/k8s-client'
import { formatAge } from '@/lib/format'
import { SearchInput } from '@/components/SearchInput'
import { NamespaceFilter } from '@/components/NamespaceFilter'
import { PanelUser } from '@/components/PanelUser'
import type { ConfigMap, ConfigMapDetail } from '@/types/k8s'

type Tab = 'info' | 'yaml'

const tabs: { id: Tab; label: string }[] = [
  { id: 'info', label: 'Сведения' },
  { id: 'yaml', label: 'YAML' },
]

interface ConfigMapDetailsProps {
  configMap: ConfigMap
  onBack: () => void
  allowSplit?: boolean
  showUser?: boolean
  onCloseSplit?: () => void
}

function SecondConfigMapPicker({
  excludeUid,
  onSelect,
  onClose,
}: {
  excludeUid: string
  onSelect: (configMap: ConfigMap) => void
  onClose: () => void
}) {
  const { connection, namespace: clusterNs } = useCluster()
  const [items, setItems] = useState<ConfigMap[]>([])
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [filterNs, setFilterNs] = useState(clusterNs ?? '')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setFilterNs(clusterNs ?? '')
  }, [clusterNs])

  useEffect(() => {
    if (!connection) return
    let cancelled = false
    setLoading(true)
    void Promise.all([
      listConfigMaps(connection),
      listNamespaces(connection).catch(() => [] as { metadata: { name: string } }[]),
    ])
      .then(([all, nsItems]) => {
        if (cancelled) return
        const maps = all.filter((c) => c.metadata.uid !== excludeUid)
        setItems(maps)
        const fromList = nsItems.map((n) => n.metadata.name)
        const fromMaps = maps
          .map((c) => c.metadata.namespace)
          .filter((name): name is string => Boolean(name))
        setNamespaces([...new Set([...fromList, ...fromMaps])].sort())
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [connection, excludeUid])

  const rows = useMemo(() => {
    let list = filterNs ? items.filter((c) => c.metadata.namespace === filterNs) : items
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (c) =>
          c.metadata.name.toLowerCase().includes(q) ||
          (c.metadata.namespace ?? '').toLowerCase().includes(q),
      )
    }
    return list
  }, [items, filterNs, query])

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900">Второй ConfigMap</h1>
          <p className="mt-1 text-sm text-ink-500">Выбор ConfigMap</p>
        </div>
        <button
          type="button"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-300 bg-white text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
          title="Закрыть второе окно"
          aria-label="Закрыть второе окно"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-[180px] sm:max-w-[240px]">
          <NamespaceFilter namespaces={namespaces} value={filterNs} onChange={setFilterNs} />
        </div>
        <SearchInput value={query} onChange={setQuery} placeholder="Имя…" />
      </div>
      {loading ? (
        <p className="font-mono text-sm text-ink-500">Загрузка ConfigMap…</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-sm text-ink-500">Подходящих ConfigMap нет</p>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded border border-ink-200 bg-white/70">
          {rows.map((c) => {
            const keys = Object.keys(c.data).length + c.binaryDataKeys.length
            return (
              <li key={c.metadata.uid}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition hover:bg-leaf-500/[0.06]"
                  onClick={() => onSelect(c)}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-900">{c.metadata.name}</span>
                    <span className="font-mono text-[11px] text-ink-500">{c.metadata.namespace}</span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-ink-600">{keys} keys</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ConfigMapDetails({
  configMap,
  onBack,
  allowSplit = true,
  showUser = true,
  onCloseSplit,
}: ConfigMapDetailsProps) {
  const { connection } = useCluster()
  const [tab, setTab] = useState<Tab>('info')
  const [detail, setDetail] = useState<ConfigMapDetail | null>(null)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [yamlText, setYamlText] = useState('')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSaved, setYamlSaved] = useState(false)
  const [splitOpen, setSplitOpen] = useState(false)
  const [secondConfigMap, setSecondConfigMap] = useState<ConfigMap | null>(null)
  const detailRequestId = useRef(0)

  const ns = configMap.metadata.namespace ?? ''
  const name = configMap.metadata.name
  const info = detail?.info ?? configMap
  const dataKeys = Object.keys(info.data)
  const binaryKeys = info.binaryDataKeys

  useEffect(() => {
    setTab('info')
    setDetail(null)
    setDetailError(null)
    setYamlText('')
    setYamlDirty(false)
    setYamlSaving(false)
    setYamlError(null)
    setYamlSaved(false)
    setSplitOpen(false)
    setSecondConfigMap(null)
  }, [configMap.metadata.uid])

  const loadDetail = useCallback(
    async (silent = false) => {
      if (!connection || !ns || !name) return
      const requestId = ++detailRequestId.current
      if (!silent) {
        setDetailLoading(true)
        setDetailError(null)
      }
      try {
        const next = await fetchConfigMapDetail(connection, ns, name)
        if (requestId !== detailRequestId.current) return
        setDetail(next)
        setDetailError(null)
      } catch (err) {
        if (requestId !== detailRequestId.current) return
        if (!silent) {
          setDetailError(err instanceof Error ? err.message : 'Не удалось загрузить configmap')
        }
      } finally {
        if (requestId === detailRequestId.current && !silent) setDetailLoading(false)
      }
    },
    [connection, ns, name],
  )

  useEffect(() => {
    void loadDetail()
    const id = window.setInterval(() => void loadDetail(true), 5000)
    return () => {
      detailRequestId.current += 1
      window.clearInterval(id)
    }
  }, [loadDetail, configMap.metadata.uid])

  useEffect(() => {
    setDetail((prev) => {
      if (!prev || prev.info.metadata.uid !== configMap.metadata.uid) return prev
      return {
        ...prev,
        info: {
          ...prev.info,
          data: configMap.data,
          binaryDataKeys: configMap.binaryDataKeys,
          immutable: configMap.immutable ?? prev.info.immutable,
        },
      }
    })
  }, [configMap])

  useEffect(() => {
    if (!detail?.yaml || yamlDirty || yamlSaving) return
    setYamlText(detail.yaml)
  }, [detail?.yaml, yamlDirty, yamlSaving])

  const saveYaml = useCallback(async () => {
    if (!connection || !ns || !name || yamlSaving) return
    setYamlSaving(true)
    setYamlError(null)
    setYamlSaved(false)
    try {
      const next = await saveConfigMapYaml(connection, ns, name, yamlText)
      setDetail(next)
      setYamlText(next.yaml)
      setYamlDirty(false)
      setYamlSaved(true)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось сохранить YAML'
      setYamlError(
        message.startsWith('Некорректный YAML')
          ? `${message}. Нажмите Reload, чтобы загрузить исправленный YAML, и сохраните снова.`
          : message,
      )
    } finally {
      setYamlSaving(false)
    }
  }, [connection, ns, name, yamlText, yamlSaving])

  useEffect(() => {
    if (tab !== 'yaml') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        void saveYaml()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, saveYaml])

  const facts: { label: string; value: string }[] = [
    { label: 'Name', value: info.metadata.name },
    { label: 'Namespace', value: info.metadata.namespace ?? '—' },
    { label: 'Data', value: String(dataKeys.length) },
    { label: 'Binary data', value: String(binaryKeys.length) },
    { label: 'Immutable', value: info.immutable ? 'true' : 'false' },
    { label: 'Created', value: formatAge(info.metadata.creationTimestamp) },
  ]

  const pane = (
    <div>
      <nav className="mb-3 flex items-center gap-1.5 font-mono text-xs text-ink-500">
        <button
          type="button"
          className="text-leaf-600 underline-offset-2 hover:underline"
          onClick={onBack}
        >
          ConfigMaps
        </button>
        <ChevronRight className="h-3.5 w-3.5 text-ink-400" />
        <span>ConfigMap details</span>
      </nav>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate font-display text-3xl font-bold tracking-tight text-ink-900">
            {configMap.metadata.name}
          </h1>
          <p className="mt-1 font-mono text-sm text-ink-500">{configMap.metadata.namespace}</p>
        </div>
        {showUser ? (
          <PanelUser />
        ) : onCloseSplit ? (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-ink-300 bg-white text-ink-500 transition hover:bg-ink-50 hover:text-ink-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500"
            title="Закрыть второе окно"
            aria-label="Закрыть второе окно"
            onClick={onCloseSplit}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mb-6 flex items-end justify-between gap-2 border-b border-ink-200">
        <div className="flex gap-1">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`-mb-px border-b-2 px-3 py-2 text-base font-medium transition ${
                tab === item.id
                  ? 'border-leaf-600 text-ink-900'
                  : 'border-transparent text-ink-500 hover:text-ink-800'
              }`}
              onClick={() => {
                setTab(item.id)
                if (item.id === 'yaml' && !yamlDirty) void loadDetail()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        {allowSplit ? (
          <button
            type="button"
            className={`mb-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 ${
              splitOpen
                ? 'border-leaf-500/50 bg-leaf-400/10 text-leaf-700'
                : 'border-ink-300 bg-white text-ink-500 hover:bg-ink-50 hover:text-ink-800'
            }`}
            title={splitOpen ? 'Закрыть второе окно' : 'Открыть второе окно'}
            aria-label={splitOpen ? 'Закрыть второе окно' : 'Открыть второе окно'}
            aria-pressed={splitOpen}
            onClick={() => {
              if (splitOpen) {
                setSplitOpen(false)
                setSecondConfigMap(null)
              } else {
                setSplitOpen(true)
              }
            }}
          >
            <span className="relative inline-flex">
              <Columns2 className="h-4 w-4" />
              <span className="absolute -right-1.5 -top-1.5 font-mono text-[9px] font-bold leading-none">
                ±
              </span>
            </span>
          </button>
        ) : null}
      </div>

      {tab === 'info' && (
        <div className="space-y-6">
          {detailError && (
            <p className="rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {detailError}
            </p>
          )}
          <section className="surface px-5 py-4">
            <h2 className="mb-4 border-b border-ink-200/80 pb-3 font-display text-lg font-bold text-ink-900">
              ConfigMap details
            </h2>
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {facts.map((row) => (
                <div key={row.label} className="min-w-0 rounded-lg bg-ink-50 px-3.5 py-3">
                  <dt className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                    {row.label}
                  </dt>
                  <dd className="mt-1 break-all font-mono text-sm text-ink-900" title={row.value}>
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <h3 className="mb-2 font-display text-base font-bold text-ink-900">Data</h3>
            {dataKeys.length === 0 ? (
              <p className="font-mono text-sm text-ink-500">Ключей нет</p>
            ) : (
              <div className="space-y-3">
                {dataKeys.map((key) => (
                  <div key={key} className="overflow-hidden rounded border border-ink-200 bg-white/70">
                    <p className="border-b border-ink-100 bg-ink-50/80 px-3 py-2 font-mono text-xs font-medium text-ink-800">
                      {key}
                    </p>
                    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-800">
                      {info.data[key] || ' '}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </section>

          {binaryKeys.length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Binary data</h3>
              <div className="flex flex-wrap gap-1.5">
                {binaryKeys.map((key) => (
                  <span key={key} className="rounded bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-700">
                    {key}
                  </span>
                ))}
              </div>
            </section>
          )}

          {info.metadata.labels && Object.keys(info.metadata.labels).length > 0 && (
            <section>
              <h3 className="mb-2 font-display text-base font-bold text-ink-900">Labels</h3>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(info.metadata.labels).map(([k, v]) => (
                  <span key={k} className="rounded bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-700">
                    {k}={v}
                  </span>
                ))}
              </div>
            </section>
          )}

          {detailLoading && !detail && (
            <p className="font-mono text-sm text-ink-500">Загрузка сведений…</p>
          )}
        </div>
      )}

      {tab === 'yaml' && (
        <div>
          {detailError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {detailError}
            </p>
          )}
          {yamlError && (
            <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
              {yamlError}
            </p>
          )}
          {yamlSaved && !yamlDirty && (
            <p className="mb-3 rounded border border-leaf-500/30 bg-leaf-500/10 px-3 py-2 text-sm text-leaf-700">
              YAML сохранён в кластер
            </p>
          )}
          <div className="mb-3 flex items-center justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-8 min-w-[7.5rem] items-center justify-center rounded-lg border border-ink-300 bg-white px-3 text-sm font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={yamlSaving}
              onClick={() => {
                setYamlDirty(false)
                setYamlError(null)
                setYamlSaved(false)
                void loadDetail()
              }}
            >
              Reload
            </button>
            <button
              type="button"
              className="inline-flex h-8 min-w-[7.5rem] items-center justify-center rounded-lg border border-leaf-500/50 bg-leaf-400/5 px-3 text-sm font-medium text-leaf-600 transition hover:bg-leaf-400/10 hover:text-leaf-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-leaf-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={yamlSaving || !yamlText.trim()}
              onClick={() => void saveYaml()}
            >
              {yamlSaving ? 'Сохранение…' : 'Сохранить'}
            </button>
          </div>
          {detailLoading && !detail ? (
            <p className="font-mono text-sm text-ink-500">Загрузка YAML…</p>
          ) : (
            <textarea
              value={yamlText}
              spellCheck={false}
              onChange={(e) => {
                const next = e.target.value
                setYamlText(next)
                setYamlDirty(next !== (detail?.yaml ?? ''))
                setYamlSaved(false)
                setYamlError(null)
              }}
              className="min-h-[70vh] w-full resize-y rounded border border-ink-200 bg-ink-900 p-4 font-mono text-[13px] leading-relaxed text-white outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-500/20"
            />
          )}
        </div>
      )}
    </div>
  )

  if (allowSplit && splitOpen) {
    return (
      <div className="flex min-h-0 items-stretch gap-0">
        <div className="min-w-0 flex-1 overflow-auto pr-4">{pane}</div>
        <div className="w-px shrink-0 bg-ink-200" />
        <div className="min-w-0 flex-1 overflow-auto pl-4">
          {secondConfigMap ? (
            <ConfigMapDetails
              configMap={secondConfigMap}
              onBack={() => setSecondConfigMap(null)}
              allowSplit={false}
              showUser={false}
              onCloseSplit={() => {
                setSplitOpen(false)
                setSecondConfigMap(null)
              }}
            />
          ) : (
            <SecondConfigMapPicker
              excludeUid={configMap.metadata.uid}
              onSelect={setSecondConfigMap}
              onClose={() => {
                setSplitOpen(false)
                setSecondConfigMap(null)
              }}
            />
          )}
        </div>
      </div>
    )
  }

  return pane
}
