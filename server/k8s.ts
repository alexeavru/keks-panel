import {
  AppsV1Api,
  CoreV1Api,
  KubeConfig,
  Metrics,
  type PodMetric,
  type V1Deployment,
  type V1Namespace,
  type V1Node,
  type V1Pod,
  type V1StatefulSet,
  type V1ResourceRequirements,
  type V1Service,
} from '@kubernetes/client-node'
import { homedir } from 'node:os'
import { join } from 'node:path'

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
  core: CoreV1Api
  apps: AppsV1Api
  metrics: Metrics
  server: string
  context: string
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
    core: kc.makeApiClient(CoreV1Api),
    apps: kc.makeApiClient(AppsV1Api),
    metrics: new Metrics(kc),
    server: cluster.server,
    context: contextName,
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

export function mapDeployment(dep: V1Deployment) {
  const matchLabels = dep.spec?.selector?.matchLabels ?? {}
  const selector = Object.entries(matchLabels)
    .map(([k, v]) => `${k}=${v}`)
    .join(',')

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
  const { core, apps, metrics, server, context } = getApis(contextName)

  const [nsRes, podRes, depRes, stsRes, svcRes, nodeRes, usageMap] = await Promise.all([
    core.listNamespace(),
    core.listPodForAllNamespaces(),
    apps.listDeploymentForAllNamespaces(),
    apps.listStatefulSetForAllNamespaces(),
    core.listServiceForAllNamespaces(),
    core.listNode(),
    loadPodUsageMap(metrics),
  ])

  return {
    context,
    server,
    namespaces: (nsRes.items ?? []).map(mapNamespace),
    pods: (podRes.items ?? []).map((p) =>
      mapPod(p, usageMap.get(podKey(p.metadata?.namespace, p.metadata?.name))),
    ),
    deployments: (depRes.items ?? []).map(mapDeployment),
    statefulSets: (stsRes.items ?? []).map(mapStatefulSet),
    services: (svcRes.items ?? []).map(mapService),
    nodes: (nodeRes.items ?? []).map(mapNode),
  }
}

export async function testContext(contextName: string) {
  const { core, server, context } = getApis(contextName)
  await core.listNamespace()
  return { context, server, ok: true as const }
}
