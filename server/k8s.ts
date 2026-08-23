import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  Metrics,
  NetworkingV1Api,
  StorageV1Api,
  type PodMetric,
  type V1Deployment,
  type V1Ingress,
  type V1Namespace,
  type V1Node,
  type V1Pod,
  type V1ContainerStatus,
  type V1StatefulSet,
  type V1ResourceRequirements,
  type V1Service,
  type V1ConfigMap,
  type V1Secret,
  type V1PersistentVolume,
  type V1PersistentVolumeClaim,
  type V1StorageClass,
} from '@kubernetes/client-node'
import { homedir } from 'node:os'
import { join } from 'node:path'
import https from 'node:https'
import type { RequestOptions } from 'node:https'

export interface KubeContextInfo {
  name: string
  cluster: string
  user: string
  namespace?: string
  server?: string
  current: boolean
}

export function kubeconfigPath(): string {
  return process.env.KUBECONFIG?.split(':')[0] || join(homedir(), '.kube', 'config')
}

export function loadKubeConfig(): KubeConfig {
  const kc = new KubeConfig()
  const path = kubeconfigPath()
  try {
    kc.loadFromFile(path)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(`Не удалось прочитать kubeconfig (${path}): ${message}`)
  }
  return kc
}

export function listContexts(): { path: string; contexts: KubeContextInfo[] } {
  const kc = loadKubeConfig()
  const current = kc.getCurrentContext()
  const clusters = new Map(kc.clusters.map((c) => [c.name, c]))

  const contexts: KubeContextInfo[] = kc.contexts.map((ctx) => {
    const cluster = clusters.get(ctx.cluster)
    return {
      name: ctx.name,
      cluster: ctx.cluster,
      user: ctx.user,
      namespace: ctx.namespace,
      server: cluster?.server,
      current: ctx.name === current,
    }
  })

  contexts.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name))

  return { path: kubeconfigPath(), contexts }
}

export function getApis(contextName: string): {
  kc: KubeConfig
  core: CoreV1Api
  apps: AppsV1Api
  net: NetworkingV1Api
  storage: StorageV1Api
  metrics: Metrics
  server: string
  context: string
  clusterName: string
  user: string
  namespace?: string
} {
  const kc = loadKubeConfig()
  const ctx = kc.contexts.find((c) => c.name === contextName)
  if (!ctx) {
    throw new Error(`Контекст «${contextName}» не найден в kubeconfig`)
  }

  kc.setCurrentContext(contextName)
  const cluster = kc.getCurrentCluster()
  if (!cluster?.server) {
    throw new Error(`У контекста «${contextName}» нет server URL`)
  }

  return {
    kc,
    core: kc.makeApiClient(CoreV1Api),
    apps: kc.makeApiClient(AppsV1Api),
    net: kc.makeApiClient(NetworkingV1Api),
    storage: kc.makeApiClient(StorageV1Api),
    metrics: new Metrics(kc),
    server: cluster.server,
    context: contextName,
    clusterName: cluster.name,
    user: kc.getCurrentUser()?.name ?? ctx.user,
    namespace: ctx.namespace,
  }
}

async function readClusterVersion(
  kc: KubeConfig,
  server: string,
): Promise<{ version: string; platform?: string }> {
  const base = server.endsWith('/') ? server : `${server}/`
  const url = new URL('version', base)
  const opts: RequestOptions = {
    protocol: url.protocol,
    hostname: url.hostname,
    port: url.port || undefined,
    path: `${url.pathname}${url.search}`,
    method: 'GET',
  }
  try {
    await kc.applyToHTTPSOptions(opts)
    const body = await new Promise<string>((resolve, reject) => {
      const req = https.request(opts, (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      })
      req.on('error', reject)
      req.end()
    })
    const json = JSON.parse(body) as { gitVersion?: string; platform?: string }
    return {
      version: json.gitVersion || '—',
      platform: json.platform,
    }
  } catch {
    return { version: '—' }
  }
}

function meta(obj: {
  metadata?: {
    name?: string
    namespace?: string
    uid?: string
    creationTimestamp?: Date | string
    labels?: Record<string, string>
    annotations?: Record<string, string>
  }
}) {
  const m = obj.metadata ?? {}
  const ts = m.creationTimestamp
  return {
    name: m.name ?? '',
    namespace: m.namespace,
    uid: m.uid ?? `${m.namespace ?? 'cluster'}/${m.name ?? 'unknown'}`,
    creationTimestamp:
      ts instanceof Date ? ts.toISOString() : typeof ts === 'string' ? ts : new Date().toISOString(),
    labels: m.labels,
    annotations: m.annotations,
  }
}

export function mapNamespace(ns: V1Namespace) {
  return {
    kind: 'Namespace' as const,
    metadata: meta(ns),
    status: {
      phase: (ns.status?.phase === 'Terminating' ? 'Terminating' : 'Active') as
        | 'Active'
        | 'Terminating',
    },
  }
}

export function mapPod(pod: V1Pod, usage?: { cpuMillis?: number; memoryBytes?: number }) {
  const containerStatuses = pod.status?.containerStatuses ?? []
  const restarts = containerStatuses.reduce((sum, c) => sum + (c.restartCount ?? 0), 0)
  const readyCount = containerStatuses.filter((c) => c.ready).length
  const total = Math.max(containerStatuses.length, pod.spec?.containers?.length ?? 0)
  const ready = total > 0 ? readyCount === total : false
  const phase = (pod.status?.phase ?? 'Unknown') as
    | 'Pending'
    | 'Running'
    | 'Succeeded'
    | 'Failed'
    | 'Unknown'

  const requests = sumContainerResources(pod.spec?.containers ?? [])

  return {
    kind: 'Pod' as const,
    metadata: meta(pod),
    spec: {
      nodeName: pod.spec?.nodeName,
      containers: (pod.spec?.containers ?? []).map((c) => ({
        name: c.name,
        image: c.image ?? '',
      })),
    },
    status: {
      phase,
      state: podState(pod),
      podIP: pod.status?.podIP,
      ready,
      readyCount,
      containerCount: total,
      restarts,
      cpuUsage: usage ? formatCpuMillis(usage.cpuMillis ?? 0, true) : undefined,
      cpuMillis: usage?.cpuMillis,
      cpuRequest: formatCpuMillis(requests.cpuRequest),
      cpuLimit: formatCpuMillis(requests.cpuLimit),
      memoryUsage: usage ? formatMemoryBytes(usage.memoryBytes ?? 0, true) : undefined,
      memoryMi: usage ? usage.memoryBytes / 1024 ** 2 : undefined,
      memoryRequest: formatMemoryBytes(requests.memoryRequest),
      memoryLimit: formatMemoryBytes(requests.memoryLimit),
    },
  }
}

function podKey(namespace: string | undefined, name: string | undefined): string {
  return `${namespace ?? ''}/${name ?? ''}`
}

function cpuToMillis(q?: string): number | undefined {
  if (!q) return undefined
  const s = q.trim()
  if (s.endsWith('n')) {
    const n = Number(s.slice(0, -1))
    return Number.isFinite(n) ? n / 1_000_000 : undefined
  }
  if (s.endsWith('u')) {
    const n = Number(s.slice(0, -1))
    return Number.isFinite(n) ? n / 1_000 : undefined
  }
  if (s.endsWith('m')) {
    const n = Number(s.slice(0, -1))
    return Number.isFinite(n) ? n : undefined
  }
  const n = Number(s)
  return Number.isFinite(n) ? n * 1000 : undefined
}

function memoryToBytes(q?: string): number | undefined {
  if (!q) return undefined
  const m = q.trim().match(/^([0-9]*\.?[0-9]+)([A-Za-z]+)?$/)
  if (!m) return undefined
  const n = Number(m[1])
  if (!Number.isFinite(n)) return undefined
  const unit = m[2] ?? ''
  const mul: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    k: 1000,
    K: 1000,
    M: 1e6,
    G: 1e9,
    T: 1e12,
    P: 1e15,
  }
  return n * (mul[unit] ?? 1)
}

function formatCpuMillis(millis?: number, allowZero = false): string | undefined {
  if (millis == null || !Number.isFinite(millis)) return undefined
  if (millis <= 0) return allowZero ? '0m' : undefined
  if (millis < 1000) return `${Math.round(millis)}m`
  const cores = millis / 1000
  return Number.isInteger(cores) ? String(cores) : cores.toFixed(2)
}

function formatMemoryBytes(bytes?: number, allowZero = false): string | undefined {
  if (bytes == null || !Number.isFinite(bytes)) return undefined
  const mi = bytes / 1024 ** 2
  if (mi <= 0) return allowZero ? '0Mi' : undefined
  if (mi < 1) return `${mi.toFixed(1)}Mi`
  return `${Math.round(mi)}Mi`
}

function addQty(a: number | undefined, b: number | undefined): number | undefined {
  if (a == null && b == null) return undefined
  return (a ?? 0) + (b ?? 0)
}

function sumContainerResources(containers: { resources?: V1ResourceRequirements }[]) {
  let cpuRequest: number | undefined
  let cpuLimit: number | undefined
  let memoryRequest: number | undefined
  let memoryLimit: number | undefined
  for (const c of containers) {
    cpuRequest = addQty(cpuRequest, cpuToMillis(c.resources?.requests?.cpu))
    cpuLimit = addQty(cpuLimit, cpuToMillis(c.resources?.limits?.cpu))
    memoryRequest = addQty(memoryRequest, memoryToBytes(c.resources?.requests?.memory))
    memoryLimit = addQty(memoryLimit, memoryToBytes(c.resources?.limits?.memory))
  }
  return { cpuRequest, cpuLimit, memoryRequest, memoryLimit }
}

function usageFromMetrics(items: PodMetric[]): Map<string, { cpuMillis: number; memoryBytes: number }> {
  const map = new Map<string, { cpuMillis: number; memoryBytes: number }>()
  for (const item of items) {
    let cpu = 0
    let mem = 0
    for (const c of item.containers ?? []) {
      cpu += cpuToMillis(c.usage?.cpu) ?? 0
      mem += memoryToBytes(c.usage?.memory) ?? 0
    }
    map.set(podKey(item.metadata?.namespace, item.metadata?.name), {
      cpuMillis: cpu,
      memoryBytes: mem,
    })
  }
  return map
}

async function loadPodUsageMap(metrics: Metrics, namespace?: string) {
  try {
    const list = await metrics.getPodMetrics(namespace || undefined)
    return usageFromMetrics(list.items ?? [])
  } catch {
    return new Map<string, { cpuMillis: number; memoryBytes: number }>()
  }
}

export async function listMappedPods(contextName: string, namespace?: string) {
  const { core, metrics } = getApis(contextName)
  const [podRes, usageMap] = await Promise.all([
    namespace
      ? core.listNamespacedPod({ namespace })
      : core.listPodForAllNamespaces(),
    loadPodUsageMap(metrics, namespace),
  ])
  return (podRes.items ?? []).map((p) =>
    mapPod(p, usageMap.get(podKey(p.metadata?.namespace, p.metadata?.name))),
  )
}

export async function deletePod(contextName: string, namespace: string, name: string) {
  const { core } = getApis(contextName)
  await core.deleteNamespacedPod({ name, namespace })
}

function k8sErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'body' in err) {
    let body = (err as { body: unknown }).body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        if (body.trim()) return body
      }
    }
    if (body && typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
  }
  return err instanceof Error ? err.message : String(err)
}

const YAML_STRING_KEYS = new Set(['resourceVersion', 'uid'])

function stringifyLabelMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue
    out[k] = v === null ? '' : String(v)
  }
  return out
}

function coerceYamlTypes(value: unknown, key?: string): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => coerceYamlTypes(item))
  if (value && typeof value === 'object') {
    if (key === 'labels' || key === 'annotations') return stringifyLabelMap(value)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = coerceYamlTypes(v, k)
    }
    return out
  }
  if (key === 'status' && typeof value === 'boolean') return value ? 'True' : 'False'
  if (key && YAML_STRING_KEYS.has(key) && typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  return value
}

export async function applyPodYaml(
  contextName: string,
  namespace: string,
  name: string,
  yaml: string,
) {
  const { load } = await import('js-yaml')
  let parsed: unknown
  try {
    parsed = coerceYamlTypes(load(yaml))
  } catch (err) {
    throw new Error(`Некорректный YAML: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML должен содержать объект Pod')
  }
  const body = parsed as V1Pod
  const kind = (body as { kind?: string }).kind
  if (kind && kind !== 'Pod') {
    throw new Error(`Ожидался kind: Pod, получен ${kind}`)
  }
  const metaName = body.metadata?.name
  const metaNs = body.metadata?.namespace
  if (metaName && metaName !== name) {
    throw new Error(`Имя в YAML (${metaName}) не совпадает с подом ${name}`)
  }
  if (metaNs && metaNs !== namespace) {
    throw new Error(`Namespace в YAML (${metaNs}) не совпадает с ${namespace}`)
  }
  body.apiVersion = body.apiVersion || 'v1'
  body.kind = 'Pod'
  body.metadata = {
    ...body.metadata,
    name,
    namespace,
  }
  if (body.metadata && 'managedFields' in body.metadata) {
    delete (body.metadata as { managedFields?: unknown }).managedFields
  }

  const { core } = getApis(contextName)
  try {
    await core.replaceNamespacedPod({ name, namespace, body })
  } catch (err) {
    throw new Error(k8sErrorMessage(err))
  }
  return getPodDetail(contextName, namespace, name)
}

export async function applyDeploymentYaml(
  contextName: string,
  namespace: string,
  name: string,
  yaml: string,
) {
  const { load } = await import('js-yaml')
  let parsed: unknown
  try {
    parsed = coerceYamlTypes(load(yaml))
  } catch (err) {
    throw new Error(`Некорректный YAML: ${err instanceof Error ? err.message : String(err)}`)
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('YAML должен содержать объект Deployment')
  }
  const body = parsed as V1Deployment
  const kind = (body as { kind?: string }).kind
  if (kind && kind !== 'Deployment') {
    throw new Error(`Ожидался kind: Deployment, получен ${kind}`)
  }
  const metaName = body.metadata?.name
  const metaNs = body.metadata?.namespace
  if (metaName && metaName !== name) {
    throw new Error(`Имя в YAML (${metaName}) не совпадает с deployment ${name}`)
  }
  if (metaNs && metaNs !== namespace) {
    throw new Error(`Namespace в YAML (${metaNs}) не совпадает с ${namespace}`)
  }
  body.apiVersion = body.apiVersion || 'apps/v1'
  body.kind = 'Deployment'
  body.metadata = {
    ...body.metadata,
    name,
    namespace,
  }
  if (body.metadata && 'managedFields' in body.metadata) {
    delete (body.metadata as { managedFields?: unknown }).managedFields
  }

  const { apps } = getApis(contextName)
  try {
    await apps.replaceNamespacedDeployment({ name, namespace, body })
  } catch (err) {
    throw new Error(k8sErrorMessage(err))
  }
  return getDeploymentDetail(contextName, namespace, name)
}

function containerState(status?: V1ContainerStatus): string {
  if (!status?.state) return 'Unknown'
  if (status.state.running) return 'Running'
  if (status.state.waiting) return status.state.waiting.reason || 'Waiting'
  if (status.state.terminated) return status.state.terminated.reason || 'Terminated'
  return 'Unknown'
}

function podState(pod: V1Pod): string {
  if (pod.metadata?.deletionTimestamp) return 'Terminating'

  const initStatuses = pod.status?.initContainerStatuses ?? []
  const initTotal = pod.spec?.initContainers?.length ?? initStatuses.length
  for (let i = 0; i < initStatuses.length; i++) {
    const state = initStatuses[i].state
    if (state?.terminated && (state.terminated.exitCode ?? 0) === 0) continue
    if (state?.terminated) {
      return state.terminated.reason
        ? `Init:${state.terminated.reason}`
        : `Init:ExitCode:${state.terminated.exitCode ?? 0}`
    }
    if (state?.waiting?.reason && state.waiting.reason !== 'PodInitializing') {
      return `Init:${state.waiting.reason}`
    }
    return `Init:${i}/${initTotal}`
  }

  let reason = pod.status?.reason || pod.status?.phase || 'Unknown'
  let hasRunning = false
  const statuses = pod.status?.containerStatuses ?? []
  for (let i = statuses.length - 1; i >= 0; i--) {
    const state = statuses[i].state
    if (state?.waiting?.reason) reason = state.waiting.reason
    else if (state?.terminated?.reason) reason = state.terminated.reason
    else if (state?.terminated) reason = `ExitCode:${state.terminated.exitCode ?? 0}`
    else if (state?.running && statuses[i].ready) hasRunning = true
  }

  if (reason === 'Completed' && hasRunning) {
    const ready = (pod.status?.conditions ?? []).some(
      (c) => c.type === 'Ready' && c.status === 'True',
    )
    return ready ? 'Running' : 'NotReady'
  }

  return reason
}

function mapContainer(
  name: string,
  image: string,
  status: V1ContainerStatus | undefined,
  init: boolean,
) {
  return {
    name,
    image,
    ready: status?.ready ?? false,
    restarts: status?.restartCount ?? 0,
    state: containerState(status),
    init,
  }
}

function toYaml(value: unknown, indent = 0): string {
  const pad = '  '.repeat(indent)
  if (value === null || value === undefined) return `${pad}null`
  if (typeof value === 'string') {
    if (value.includes('\n')) {
      return [`${pad}|`, ...value.split('\n').map((line) => `${pad}  ${line}`)].join('\n')
    }
    if (
      value === '' ||
      /[:#{}[\],&*!|>'%@`]/.test(value) ||
      /^\s|\s$/.test(value) ||
      /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value) ||
      /^(?:[Tt]rue|[Ff]alse|[Yy]es|[Nn]o|[Oo]n|[Oo]ff|[Nn]ull|~)$/.test(value)
    ) {
      return `${pad}${JSON.stringify(value)}`
    }
    return `${pad}${value}`
  }
  if (typeof value === 'number' || typeof value === 'boolean') return `${pad}${value}`
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
          const inner = toYaml(item, indent + 1)
          const [first, ...rest] = inner.split('\n')
          const firstLine = first.replace(/^\s+/, '')
          return [`${pad}- ${firstLine}`, ...rest].join('\n')
        }
        const inner = toYaml(item, 0).trim()
        return `${pad}- ${inner}`
      })
      .join('\n')
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined)
    if (entries.length === 0) return `${pad}{}`
    return entries
      .map(([key, val]) => {
        if (val !== null && typeof val === 'object') {
          return `${pad}${key}:\n${toYaml(val, indent + 1)}`
        }
        return `${pad}${key}: ${toYaml(val, 0).trim()}`
      })
      .join('\n')
  }
  return `${pad}${String(value)}`
}

function sanitizeManifest(obj: unknown): unknown {
  const raw = JSON.parse(JSON.stringify(obj)) as {
    metadata?: Record<string, unknown>
  }
  if (raw.metadata) delete raw.metadata.managedFields
  return raw
}

export async function getPodDetail(contextName: string, namespace: string, name: string) {
  const { core, metrics } = getApis(contextName)
  const pod = await core.readNamespacedPod({ name, namespace })
  const usageMap = await loadPodUsageMap(metrics, namespace)
  const mapped = mapPod(pod, usageMap.get(podKey(namespace, name)))
  const statuses = new Map((pod.status?.containerStatuses ?? []).map((s) => [s.name, s]))
  const initStatuses = new Map((pod.status?.initContainerStatuses ?? []).map((s) => [s.name, s]))

  const containers = [
    ...(pod.spec?.initContainers ?? []).map((c) =>
      mapContainer(c.name, c.image ?? '', initStatuses.get(c.name), true),
    ),
    ...(pod.spec?.containers ?? []).map((c) =>
      mapContainer(c.name, c.image ?? '', statuses.get(c.name), false),
    ),
  ]

  const start = pod.status?.startTime
  const startTime =
    start instanceof Date ? start.toISOString() : typeof start === 'string' ? start : undefined

  return {
    info: {
      ...mapped,
      spec: {
        ...mapped.spec,
        serviceAccount: pod.spec?.serviceAccountName,
        restartPolicy: pod.spec?.restartPolicy,
        qosClass: pod.status?.qosClass,
      },
      status: {
        ...mapped.status,
        hostIP: pod.status?.hostIP,
        startTime,
        qosClass: pod.status?.qosClass,
      },
      containers,
      conditions: (pod.status?.conditions ?? []).map((c) => ({
        type: c.type ?? '',
        status: c.status ?? '',
        reason: c.reason,
        message: c.message,
      })),
      volumes: (pod.spec?.volumes ?? []).map((v) => v.name),
    },
    yaml: `${toYaml(sanitizeManifest(pod))}\n`,
  }
}

export async function getPodLogs(
  contextName: string,
  namespace: string,
  name: string,
  container?: string,
) {
  const { core } = getApis(contextName)
  const pod = await core.readNamespacedPod({ name, namespace })
  const names = [
    ...(pod.spec?.initContainers ?? []).map((c) => c.name),
    ...(pod.spec?.containers ?? []).map((c) => c.name),
  ]
  const selected = container && names.includes(container) ? container : names[0]
  if (!selected) {
    return { logs: '', container: '', containers: names }
  }
  try {
    const logs = await core.readNamespacedPodLog({
      name,
      namespace,
      container: selected,
      timestamps: true,
      tailLines: 500,
    })
    return { logs: logs || '', container: selected, containers: names }
  } catch {
    return { logs: '', container: selected, containers: names }
  }
}

function eventIso(value?: Date | string): string | undefined {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export async function getPodEvents(
  contextName: string,
  namespace: string,
  name: string,
  uid?: string,
) {
  const { core } = getApis(contextName)
  const selector = [
    'involvedObject.kind=Pod',
    `involvedObject.name=${name}`,
    uid ? `involvedObject.uid=${uid}` : '',
  ]
    .filter(Boolean)
    .join(',')
  const result = await core.listNamespacedEvent({
    namespace,
    fieldSelector: selector,
  })
  const items = (result.items ?? []).map((ev) => {
    const last =
      eventIso(ev.lastTimestamp) ??
      eventIso(ev.eventTime) ??
      eventIso(ev.firstTimestamp) ??
      eventIso(ev.metadata?.creationTimestamp)
    const first = eventIso(ev.firstTimestamp) ?? eventIso(ev.eventTime)
    const source = [ev.source?.component, ev.source?.host].filter(Boolean).join(' ')
    return {
      uid: ev.metadata?.uid ?? `${ev.reason ?? 'event'}:${last ?? ''}:${ev.message ?? ''}`,
      type: ev.type ?? 'Normal',
      reason: ev.reason ?? '—',
      message: ev.message ?? '',
      count: ev.count ?? ev.series?.count ?? 1,
      firstTimestamp: first,
      lastTimestamp: last,
      source: source || ev.reportingComponent || '—',
    }
  })
  items.sort((a, b) => {
    const at = a.lastTimestamp ? Date.parse(a.lastTimestamp) : 0
    const bt = b.lastTimestamp ? Date.parse(b.lastTimestamp) : 0
    return bt - at
  })
  return items
}

function labelSelectorString(sel?: {
  matchLabels?: Record<string, string>
  matchExpressions?: { key?: string; operator?: string; values?: string[] }[]
}): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(sel?.matchLabels ?? {})) {
    parts.push(`${k}=${v}`)
  }
  for (const expr of sel?.matchExpressions ?? []) {
    if (!expr.key || !expr.operator) continue
    const values = (expr.values ?? []).join(',')
    if (expr.operator === 'In') parts.push(`${expr.key} in (${values})`)
    else if (expr.operator === 'NotIn') parts.push(`${expr.key} notin (${values})`)
    else if (expr.operator === 'Exists') parts.push(expr.key)
    else if (expr.operator === 'DoesNotExist') parts.push(`!${expr.key}`)
  }
  return parts.join(',')
}

function mapDeploymentDetail(dep: V1Deployment) {
  const mapped = mapDeployment(dep)
  const strategy = dep.spec?.strategy
  let strategyText = strategy?.type ?? 'RollingUpdate'
  const rolling = strategy?.rollingUpdate
  if (rolling) {
    const surge = rolling.maxSurge == null ? '25%' : String(rolling.maxSurge)
    const unavailable = rolling.maxUnavailable == null ? '25%' : String(rolling.maxUnavailable)
    strategyText = `RollingUpdate (maxSurge ${surge}, maxUnavailable ${unavailable})`
  }
  const template = dep.spec?.template?.spec
  const containers = [
    ...(template?.initContainers ?? []).map((c) => ({
      name: `${c.name} (init)`,
      image: c.image ?? '',
    })),
    ...(template?.containers ?? []).map((c) => ({
      name: c.name,
      image: c.image ?? '',
    })),
  ]
  return {
    ...mapped,
    spec: {
      ...mapped.spec,
      selector: labelSelectorString(dep.spec?.selector) || mapped.spec.selector,
      strategy: strategyText,
      minReadySeconds: dep.spec?.minReadySeconds,
      revisionHistoryLimit: dep.spec?.revisionHistoryLimit,
      progressDeadlineSeconds: dep.spec?.progressDeadlineSeconds,
    },
    status: {
      ...mapped.status,
      replicas: dep.status?.replicas ?? 0,
      unavailableReplicas: dep.status?.unavailableReplicas ?? 0,
      observedGeneration: dep.status?.observedGeneration,
    },
    containers,
    conditions: (dep.status?.conditions ?? []).map((c) => ({
      type: c.type ?? '',
      status: c.status ?? '',
      reason: c.reason,
      message: c.message,
    })),
  }
}

export async function getDeploymentDetail(contextName: string, namespace: string, name: string) {
  const { apps } = getApis(contextName)
  const dep = await apps.readNamespacedDeployment({ name, namespace })
  return {
    info: mapDeploymentDetail(dep),
    yaml: `${toYaml(sanitizeManifest(dep))}\n`,
  }
}

export async function getDeploymentEvents(
  contextName: string,
  namespace: string,
  name: string,
  uid?: string,
) {
  const { core } = getApis(contextName)
  const selector = [
    'involvedObject.kind=Deployment',
    `involvedObject.name=${name}`,
    uid ? `involvedObject.uid=${uid}` : '',
  ]
    .filter(Boolean)
    .join(',')
  const result = await core.listNamespacedEvent({
    namespace,
    fieldSelector: selector,
  })
  const items = (result.items ?? []).map((ev) => {
    const last =
      eventIso(ev.lastTimestamp) ??
      eventIso(ev.eventTime) ??
      eventIso(ev.firstTimestamp) ??
      eventIso(ev.metadata?.creationTimestamp)
    const first = eventIso(ev.firstTimestamp) ?? eventIso(ev.eventTime)
    const source = [ev.source?.component, ev.source?.host].filter(Boolean).join(' ')
    return {
      uid: ev.metadata?.uid ?? `${ev.reason ?? 'event'}:${last ?? ''}:${ev.message ?? ''}`,
      type: ev.type ?? 'Normal',
      reason: ev.reason ?? '—',
      message: ev.message ?? '',
      count: ev.count ?? ev.series?.count ?? 1,
      firstTimestamp: first,
      lastTimestamp: last,
      source: source || ev.reportingComponent || '—',
    }
  })
  items.sort((a, b) => {
    const at = a.lastTimestamp ? Date.parse(a.lastTimestamp) : 0
    const bt = b.lastTimestamp ? Date.parse(b.lastTimestamp) : 0
    return bt - at
  })
  return items
}

export async function listDeploymentPods(contextName: string, namespace: string, name: string) {
  const { apps, core, metrics } = getApis(contextName)
  const dep = await apps.readNamespacedDeployment({ name, namespace })
  const selector = labelSelectorString(dep.spec?.selector)
  if (!selector) return []
  const [podRes, usageMap] = await Promise.all([
    core.listNamespacedPod({ namespace, labelSelector: selector }),
    loadPodUsageMap(metrics, namespace),
  ])
  return (podRes.items ?? []).map((p) =>
    mapPod(p, usageMap.get(podKey(p.metadata?.namespace, p.metadata?.name))),
  )
}

export function mapDeployment(dep: V1Deployment) {
  const selector = labelSelectorString(dep.spec?.selector)

  return {
    kind: 'Deployment' as const,
    metadata: meta(dep),
    spec: {
      replicas: dep.spec?.replicas ?? 0,
      selector: selector || '—',
    },
    status: {
      readyReplicas: dep.status?.readyReplicas ?? 0,
      availableReplicas: dep.status?.availableReplicas ?? 0,
      updatedReplicas: dep.status?.updatedReplicas ?? 0,
    },
  }
}

export function mapStatefulSet(sts: V1StatefulSet) {
  const matchLabels = sts.spec?.selector?.matchLabels ?? {}
  const selector = Object.entries(matchLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')

  return {
    kind: 'StatefulSet' as const,
    metadata: meta(sts),
    spec: {
      replicas: sts.spec?.replicas ?? 0,
      serviceName: sts.spec?.serviceName ?? '',
      selector: selector || '—',
    },
    status: {
      readyReplicas: sts.status?.readyReplicas ?? 0,
      currentReplicas: sts.status?.currentReplicas ?? 0,
      updatedReplicas: sts.status?.updatedReplicas ?? 0,
    },
  }
}

export function mapService(svc: V1Service) {
  return {
    kind: 'Service' as const,
    metadata: meta(svc),
    spec: {
      type: (svc.spec?.type ?? 'ClusterIP') as
        | 'ClusterIP'
        | 'NodePort'
        | 'LoadBalancer'
        | 'ExternalName',
      clusterIP: svc.spec?.clusterIP ?? '',
      ports: (svc.spec?.ports ?? []).map((p) => ({
        name: p.name,
        port: p.port,
        targetPort: p.targetPort ?? p.port,
        protocol: p.protocol ?? 'TCP',
        nodePort: p.nodePort,
      })),
    },
  }
}

export function mapIngress(ing: V1Ingress) {
  const hosts = [
    ...new Set(
      (ing.spec?.rules ?? [])
        .map((rule) => rule.host?.trim())
        .filter((host): host is string => Boolean(host)),
    ),
  ]
  const addresses = (ing.status?.loadBalancer?.ingress ?? [])
    .map((item) => item.ip || item.hostname)
    .filter((value): value is string => Boolean(value))

  return {
    kind: 'Ingress' as const,
    metadata: meta(ing),
    spec: {
      className:
        ing.spec?.ingressClassName ||
        ing.metadata?.annotations?.['kubernetes.io/ingress.class'] ||
        '—',
      hosts,
      tls: (ing.spec?.tls?.length ?? 0) > 0,
    },
    status: {
      address: addresses.join(', ') || '—',
    },
  }
}

export function mapConfigMap(cm: V1ConfigMap) {
  return {
    kind: 'ConfigMap' as const,
    metadata: meta(cm),
    data: cm.data ?? {},
    binaryDataKeys: Object.keys(cm.binaryData ?? {}),
  }
}

export function mapSecret(secret: V1Secret) {
  const keys = [
    ...Object.keys(secret.data ?? {}),
    ...Object.keys(secret.stringData ?? {}),
  ]
  return {
    kind: 'Secret' as const,
    metadata: meta(secret),
    type: secret.type ?? 'Opaque',
    dataKeys: [...new Set(keys)],
  }
}

function shortAccessModes(modes?: string[]): string {
  const names: Record<string, string> = {
    ReadWriteOnce: 'RWO',
    ReadOnlyMany: 'ROX',
    ReadWriteMany: 'RWX',
    ReadWriteOncePod: 'RWOP',
  }
  const list = (modes ?? []).map((m) => names[m] ?? m)
  return list.length ? list.join(', ') : '—'
}

export function mapPersistentVolume(pv: V1PersistentVolume) {
  const claim = pv.spec?.claimRef
  return {
    kind: 'PersistentVolume' as const,
    metadata: meta(pv),
    spec: {
      capacity: pv.spec?.capacity?.storage ?? '—',
      accessModes: shortAccessModes(pv.spec?.accessModes),
      reclaimPolicy: pv.spec?.persistentVolumeReclaimPolicy ?? '—',
      storageClass: pv.spec?.storageClassName || '—',
      volumeMode: pv.spec?.volumeMode ?? 'Filesystem',
      claim: claim?.name
        ? `${claim.namespace ?? 'default'}/${claim.name}`
        : '—',
    },
    status: {
      phase: pv.status?.phase ?? 'Unknown',
    },
  }
}

export function mapPersistentVolumeClaim(pvc: V1PersistentVolumeClaim) {
  return {
    kind: 'PersistentVolumeClaim' as const,
    metadata: meta(pvc),
    spec: {
      volumeName: pvc.spec?.volumeName || '—',
      storageClass:
        pvc.spec?.storageClassName ||
        pvc.metadata?.annotations?.['volume.beta.kubernetes.io/storage-class'] ||
        '—',
      accessModes: shortAccessModes(pvc.spec?.accessModes),
      volumeMode: pvc.spec?.volumeMode ?? 'Filesystem',
    },
    status: {
      phase: pvc.status?.phase ?? 'Unknown',
      capacity:
        pvc.status?.capacity?.storage ||
        pvc.spec?.resources?.requests?.storage ||
        '—',
    },
  }
}

export function mapStorageClass(sc: V1StorageClass) {
  const annotations = sc.metadata?.annotations ?? {}
  const isDefault =
    annotations['storageclass.kubernetes.io/is-default-class'] === 'true' ||
    annotations['storageclass.beta.kubernetes.io/is-default-class'] === 'true'
  return {
    kind: 'StorageClass' as const,
    metadata: meta(sc),
    spec: {
      provisioner: sc.provisioner ?? '—',
      reclaimPolicy: sc.reclaimPolicy ?? 'Delete',
      volumeBindingMode: sc.volumeBindingMode ?? 'Immediate',
      allowVolumeExpansion: sc.allowVolumeExpansion ?? false,
      isDefault,
    },
  }
}

export function mapNode(node: V1Node) {
  const labels = node.metadata?.labels ?? {}
  const roles = Object.keys(labels)
    .filter((k) => k.startsWith('node-role.kubernetes.io/'))
    .map((k) => k.replace('node-role.kubernetes.io/', '') || 'node')
  if (roles.length === 0) roles.push('worker')

  const ready =
    node.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false

  return {
    kind: 'Node' as const,
    metadata: meta(node),
    status: {
      ready,
      roles,
      version: node.status?.nodeInfo?.kubeletVersion ?? '—',
      cpu: node.status?.capacity?.cpu ?? '—',
      memory: node.status?.capacity?.memory ?? '—',
      allocatableCpu: node.status?.allocatable?.cpu ?? '—',
      allocatableMemory: node.status?.allocatable?.memory ?? '—',
    },
  }
}

export async function fetchSnapshot(contextName: string) {
  const { kc, core, apps, net, storage, metrics, server, context, clusterName, user, namespace } =
    getApis(contextName)

  const [
    nsRes,
    podRes,
    depRes,
    stsRes,
    svcRes,
    ingRes,
    cmRes,
    secretRes,
    pvRes,
    pvcRes,
    scRes,
    nodeRes,
    usageMap,
    version,
  ] = await Promise.all([
    core.listNamespace(),
    core.listPodForAllNamespaces(),
    apps.listDeploymentForAllNamespaces(),
    apps.listStatefulSetForAllNamespaces(),
    core.listServiceForAllNamespaces(),
    net.listIngressForAllNamespaces(),
    core.listConfigMapForAllNamespaces(),
    core.listSecretForAllNamespaces(),
    core.listPersistentVolume(),
    core.listPersistentVolumeClaimForAllNamespaces(),
    storage.listStorageClass(),
    core.listNode(),
    loadPodUsageMap(metrics),
    readClusterVersion(kc, server),
  ])

  const nodes = (nodeRes.items ?? []).map(mapNode)
  const fallbackVersion = nodes.find((n) => n.status.version)?.status.version

  return {
    context,
    server,
    info: {
      name: clusterName,
      context,
      server,
      user,
      namespace,
      version: version.version !== '—' ? version.version : fallbackVersion ?? '—',
      platform: version.platform,
    },
    namespaces: (nsRes.items ?? []).map(mapNamespace),
    pods: (podRes.items ?? []).map((p) =>
      mapPod(p, usageMap.get(podKey(p.metadata?.namespace, p.metadata?.name))),
    ),
    deployments: (depRes.items ?? []).map(mapDeployment),
    statefulSets: (stsRes.items ?? []).map(mapStatefulSet),
    services: (svcRes.items ?? []).map(mapService),
    ingresses: (ingRes.items ?? []).map(mapIngress),
    configMaps: (cmRes.items ?? []).map(mapConfigMap),
    secrets: (secretRes.items ?? []).map(mapSecret),
    persistentVolumes: (pvRes.items ?? []).map(mapPersistentVolume),
    persistentVolumeClaims: (pvcRes.items ?? []).map(mapPersistentVolumeClaim),
    storageClasses: (scRes.items ?? []).map(mapStorageClass),
    nodes,
  }
}

export async function testContext(contextName: string) {
  const { core, server, context } = getApis(contextName)
  await core.listNamespace()
  return { context, server, ok: true as const }
}
