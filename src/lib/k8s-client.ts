import type {
  ClusterConnection,
  ClusterSnapshot,
  Deployment,
  KubeContextInfo,
  Namespace,
  Node,
  Pod,
  Service,
  Ingress,
  ConfigMap,
  Secret,
  PersistentVolume,
  PersistentVolumeClaim,
  StorageClass,
  StatefulSet,
  PodDetail,
  PodEvent,
  DeploymentDetail,
} from '@/types/k8s'

export {
  loadConnection,
  saveConnection,
  clearConnection,
} from '@/lib/connection-storage'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (res.status === 401 && !path.startsWith('/api/auth/')) {
    window.location.assign('/login')
    throw new Error(data.error || 'Требуется вход')
  }
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

export async function loginWithKubeconfig(context: string): Promise<{
  user: { sub: string; email: string; name: string; provider?: 'dex' | 'kubeconfig' }
  context: string
  server: string
}> {
  return api('/api/auth/kubeconfig', {
    method: 'POST',
    body: JSON.stringify({ context }),
  })
}

export async function testConnection(connection: ClusterConnection): Promise<ClusterConnection> {
  if (connection.mode === 'oidc') {
    const result = await api<{ context: string; server: string; user?: string; ok: boolean }>('/api/connect', {
      method: 'POST',
      body: JSON.stringify({ mode: 'oidc' }),
    })
    return {
      ...connection,
      name: result.user || connection.name,
      host: result.server,
      context: undefined,
    }
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
  throw new Error('Live по token пока не подключён. Используйте kubeconfig.')
}

export async function fetchSnapshot(connection: ClusterConnection): Promise<ClusterSnapshot> {
  if (connection.mode === 'kubeconfig' || connection.mode === 'oidc') {
    return api(withContext('/api/snapshot', connection), {
      headers: contextHeaders(connection),
    })
  }

  throw new Error('Режим не поддерживает загрузку ресурсов')
}

export async function listNamespaces(connection: ClusterConnection): Promise<Namespace[]> {
  return api(withContext('/api/namespaces', connection), {
    headers: contextHeaders(connection),
  })
}

export async function listPods(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Pod[]> {
  return api(withContext('/api/pods', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function fetchPodDetail(
  connection: ClusterConnection,
  namespace: string,
  name: string,
): Promise<PodDetail> {
  const path = `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  return api(withContext(path, connection), {
    headers: contextHeaders(connection),
  })
}

export async function savePodYaml(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  yaml: string,
): Promise<PodDetail> {
  const path = `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  return api(withContext(path, connection), {
    method: 'PUT',
    headers: contextHeaders(connection),
    body: JSON.stringify({ yaml }),
  })
}

export async function deletePod(
  connection: ClusterConnection,
  namespace: string,
  name: string,
): Promise<void> {
  const path = `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  await api(withContext(path, connection), {
    method: 'DELETE',
    headers: contextHeaders(connection),
  })
}

export async function fetchPodLogs(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  container?: string,
): Promise<{ logs: string; container: string; containers: string[] }> {
  const path = `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/logs`
  const url = new URL(withContext(path, connection), window.location.origin)
  if (container) url.searchParams.set('container', container)
  return api(url.pathname + url.search, {
    headers: contextHeaders(connection),
  })
}

export async function fetchPodEvents(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  uid?: string,
): Promise<PodEvent[]> {
  const path = `/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/events`
  const url = new URL(withContext(path, connection), window.location.origin)
  if (uid) url.searchParams.set('uid', uid)
  return api(url.pathname + url.search, {
    headers: contextHeaders(connection),
  })
}

export async function listDeployments(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Deployment[]> {
  return api(withContext('/api/deployments', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function fetchDeploymentDetail(
  connection: ClusterConnection,
  namespace: string,
  name: string,
): Promise<DeploymentDetail> {
  const path = `/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  return api(withContext(path, connection), {
    headers: contextHeaders(connection),
  })
}

export async function saveDeploymentYaml(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  yaml: string,
): Promise<DeploymentDetail> {
  const path = `/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`
  return api(withContext(path, connection), {
    method: 'PUT',
    headers: contextHeaders(connection),
    body: JSON.stringify({ yaml }),
  })
}

export async function fetchDeploymentEvents(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  uid?: string,
): Promise<PodEvent[]> {
  const path = `/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/events`
  const url = new URL(withContext(path, connection), window.location.origin)
  if (uid) url.searchParams.set('uid', uid)
  return api(url.pathname + url.search, {
    headers: contextHeaders(connection),
  })
}

export async function listDeploymentPods(
  connection: ClusterConnection,
  namespace: string,
  name: string,
): Promise<Pod[]> {
  const path = `/api/deployments/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/pods`
  return api(withContext(path, connection), {
    headers: contextHeaders(connection),
  })
}

export async function listStatefulSets(
  connection: ClusterConnection,
  namespace?: string,
): Promise<StatefulSet[]> {
  return api(withContext('/api/statefulsets', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listServices(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Service[]> {
  return api(withContext('/api/services', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listIngresses(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Ingress[]> {
  return api(withContext('/api/ingresses', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listConfigMaps(
  connection: ClusterConnection,
  namespace?: string,
): Promise<ConfigMap[]> {
  return api(withContext('/api/configmaps', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listSecrets(
  connection: ClusterConnection,
  namespace?: string,
): Promise<Secret[]> {
  return api(withContext('/api/secrets', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listPersistentVolumes(
  connection: ClusterConnection,
): Promise<PersistentVolume[]> {
  return api(withContext('/api/persistentvolumes', connection), {
    headers: contextHeaders(connection),
  })
}

export async function listPersistentVolumeClaims(
  connection: ClusterConnection,
  namespace?: string,
): Promise<PersistentVolumeClaim[]> {
  return api(withContext('/api/persistentvolumeclaims', connection, namespace), {
    headers: contextHeaders(connection),
  })
}

export async function listStorageClasses(
  connection: ClusterConnection,
): Promise<StorageClass[]> {
  return api(withContext('/api/storageclasses', connection), {
    headers: contextHeaders(connection),
  })
}

export async function listNodes(connection: ClusterConnection): Promise<Node[]> {
  return api(withContext('/api/nodes', connection), {
    headers: contextHeaders(connection),
  })
}

export function podExecWebSocketUrl(
  connection: ClusterConnection,
  namespace: string,
  name: string,
  container?: string,
  size?: { cols: number; rows: number },
): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(
    `${proto}//${window.location.host}/api/pods/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}/exec`,
  )
  if (connection.context) url.searchParams.set('context', connection.context)
  if (container) url.searchParams.set('container', container)
  if (size) {
    url.searchParams.set('cols', String(size.cols))
    url.searchParams.set('rows', String(size.rows))
  }
  return url.toString()
}

export function resourceToYaml(obj: unknown): string {
  return JSON.stringify(obj, null, 2)
}
