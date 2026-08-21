import { demoSnapshot, delay } from '@/lib/mock-data'
import type {
  ClusterConnection,
  ClusterSnapshot,
  Deployment,
  KubeContextInfo,
  Namespace,
  Node,
  Pod,
  Service,
  StatefulSet,
} from '@/types/k8s'

export {
  loadConnection,
  saveConnection,
  clearConnection,
} from '@/lib/connection-storage'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(data.error || `HTTP ${res.status}`)
  }
  return data
}

function contextHeaders(connection: ClusterConnection): HeadersInit {
  if (!connection.context) return {}
  return { 'X-K8s-Context': connection.context }
}

function withContext(path: string, connection: ClusterConnection, namespace?: string): string {
  const url = new URL(path, window.location.origin)
  if (connection.context) url.searchParams.set('context', connection.context)
  if (namespace) url.searchParams.set('namespace', namespace)
  return url.pathname + url.search
}

export async function fetchKubeContexts(): Promise<{
  path: string
  contexts: KubeContextInfo[]
}> {
  return api('/api/kubeconfig/contexts')
}

export async function testConnection(connection: ClusterConnection): Promise<ClusterConnection> {
  if (connection.mode === 'demo') {
    await delay(300)
    return connection
  }

  if (connection.mode === 'kubeconfig') {
    if (!connection.context?.trim()) {
      throw new Error('Выберите context из kubeconfig')
    }
    const result = await api<{ context: string; server: string; ok: boolean }>('/api/connect', {
      method: 'POST',
      body: JSON.stringify({ context: connection.context }),
    })
    return {
      ...connection,
      name: result.context,
      host: result.server,
    }
  }

  if (!connection.host.trim()) {
    throw new Error('Укажите адрес API-сервера')
  }
  if (!connection.token.trim()) {
    throw new Error('Укажите Bearer-токен')
  }
  throw new Error(
    'Live по token пока не подключён. Используйте kubeconfig или Demo.',
  )
}

export async function fetchSnapshot(connection: ClusterConnection): Promise<ClusterSnapshot> {
  if (connection.mode === 'demo') {
    await delay()
    return structuredClone(demoSnapshot)
  }

  if (connection.mode === 'kubeconfig') {
    return api(withContext('/api/snapshot', connection), {
      headers: contextHeaders(connection),
    })
  }

  throw new Error('Режим не поддерживает загрузку ресурсов')
}

export async function listNamespaces(connection: ClusterConnection): Promise<Namespace[]> {
  if (connection.mode === 'demo') {
    return (await fetchSnapshot(connection)).namespaces
  }
  return api(withContext('/api/namespaces', connection), {
    headers: contextHeaders(connection),
  })
}

export async function listPods(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Pod[]> {
  if (connection.mode === 'demo') {
    const snap = await fetchSnapshot(connection)
    return namespace ? snap.pods.filter((p) => p.metadata.namespace === namespace) : snap.pods
  }
  return api(withContext('/api/pods', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listDeployments(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Deployment[]> {
  if (connection.mode === 'demo') {
    const snap = await fetchSnapshot(connection)
    return namespace
      ? snap.deployments.filter((d) => d.metadata.namespace === namespace)
      : snap.deployments
  }
  return api(withContext('/api/deployments', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listStatefulSets(
  connection: ClusterConnection,
  namespace?: string,
): Promise<StatefulSet[]> {
  if (connection.mode === 'demo') {
    const snap = await fetchSnapshot(connection)
    return namespace
      ? snap.statefulSets.filter((s) => s.metadata.namespace === namespace)
      : snap.statefulSets
  }
  return api(withContext('/api/statefulsets', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listServices(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Service[]> {
  if (connection.mode === 'demo') {
    const snap = await fetchSnapshot(connection)
    return namespace
      ? snap.services.filter((s) => s.metadata.namespace === namespace)
      : snap.services
  }
  return api(withContext('/api/services', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listNodes(connection: ClusterConnection): Promise<Node[]> {
  if (connection.mode === 'demo') {
    return (await fetchSnapshot(connection)).nodes
  }
  return api(withContext('/api/nodes', connection), {
    headers: contextHeaders(connection),
  })
}

export function resourceToYaml(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}
