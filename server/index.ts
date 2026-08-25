import { createServer } from 'node:http'
import cors from 'cors'
import express from 'express'
import {
  fetchSnapshot,
  getApis,
  kubeconfigPath,
  listContexts,
  mapDeployment,
  mapReplicaSet,
  mapStatefulSet,
  mapNamespace,
  mapNode,
  mapService,
  mapIngress,
  mapConfigMap,
  mapSecret,
  mapPersistentVolume,
  mapPersistentVolumeClaim,
  mapStorageClass,
  listMappedPods,
  getPodDetail,
  getPodLogs,
  getPodEvents,
  deletePod,
  applyPodYaml,
  getDeploymentDetail,
  applyDeploymentYaml,
  getDeploymentEvents,
  listDeploymentPods,
  listDeploymentReplicaSets,
  getReplicaSetDetail,
  applyReplicaSetYaml,
  getReplicaSetEvents,
  listReplicaSetPods,
  getConfigMapDetail,
  applyConfigMapYaml,
  testContext,
  isK8sAccessDenied,
  isK8sUnauthorized,
  isOidcReauthError,
  OIDC_REAUTH_MESSAGE,
  type K8sAuth,
} from './k8s.js'
import { ensureOidcToken, handleCallback, loginWithKubeconfig, logout, me, readUser, requireAuth, startLogin } from './auth.js'
import { attachPodExec } from './exec.js'

const app = express()
const PORT = Number(process.env.KEKS_API_PORT || 8787)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '4mb' }))

function contextFromReq(req: express.Request): string {
  const fromQuery = typeof req.query.context === 'string' ? req.query.context : ''
  const fromHeader = typeof req.headers['x-k8s-context'] === 'string' ? req.headers['x-k8s-context'] : ''
  const context = fromQuery || fromHeader
  if (!context) {
    throw new Error('Укажите context (query ?context= или заголовок X-K8s-Context)')
  }
  return context
}

async function k8sAuthFromReq(req: express.Request, res: express.Response): Promise<K8sAuth> {
  const user = readUser(req)
  if (user?.provider === 'dex') {
    const token = await ensureOidcToken(req, res)
    return { type: 'oidc', token }
  }
  return { type: 'kubeconfig', context: contextFromReq(req) }
}

function errorMessage(err: unknown): string {
  const parts: string[] = []
  const seen = new Set<unknown>()
  let current: unknown = err
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    if (current instanceof Error && current.message) parts.push(current.message)
    const rec = current as { cause?: unknown; code?: unknown }
    if (typeof rec.code === 'string' && rec.code !== 'ERR_GENERIC_FAILURE') parts.push(rec.code)
    current = rec.cause
  }
  return [...new Set(parts)].join(': ') || String(err)
}

function sendError(res: express.Response, err: unknown, status = 500) {
  if (isOidcReauthError(err) || isK8sUnauthorized(err)) {
    const message = isOidcReauthError(err) ? err.message : OIDC_REAUTH_MESSAGE
    res.status(401).json({ error: message, code: 'oidc_reauth' })
    return
  }
  const message = errorMessage(err)
  if (isK8sAccessDenied(err)) {
    res.status(403).json({ error: message, code: 'forbidden' })
    return
  }
  const code = /не найден|Укажите context|Нет OIDC|истёк/i.test(message) ? 400 : status
  res.status(code).json({ error: message })
}

function sendEmptyIfDenied(res: express.Response, err: unknown) {
  if (isK8sAccessDenied(err)) {
    res.json([])
    return
  }
  sendError(res, err)
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, kubeconfig: kubeconfigPath() })
})

app.get('/api/auth/login', (req, res) => {
  startLogin(req, res)
})

app.get('/api/auth/callback', (req, res) => {
  void handleCallback(req, res)
})

app.get('/api/auth/me', (req, res) => {
  me(req, res)
})

app.post('/api/auth/logout', (req, res) => {
  logout(req, res)
})

app.post('/api/auth/kubeconfig', (req, res) => {
  void loginWithKubeconfig(req, res)
})

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health' || req.path === '/kubeconfig/contexts') {
    next()
    return
  }
  requireAuth(req, res, next)
})

app.get('/api/kubeconfig/contexts', (_req, res) => {
  try {
    res.json(listContexts())
  } catch (err) {
    sendError(res, err)
  }
})

app.post('/api/connect', async (req, res) => {
  try {
    const user = readUser(req)
    if (user?.provider === 'dex' || req.body?.mode === 'oidc') {
      const auth = await k8sAuthFromReq(req, res)
      res.json(await testContext(auth))
      return
    }
    const context = typeof req.body?.context === 'string' ? req.body.context.trim() : ''
    if (!context) {
      res.status(400).json({ error: 'Укажите context' })
      return
    }
    const result = await testContext(context)
    res.json(result)
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/snapshot', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await fetchSnapshot(context))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/namespaces', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const { core } = getApis(context)
    const result = await core.listNamespace()
    res.json((result.items ?? []).map(mapNamespace))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/pods', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    res.json(await listMappedPods(context, namespace || undefined))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/pods/:namespace/:name/events', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const uid = typeof req.query.uid === 'string' ? req.query.uid : ''
    res.json(
      await getPodEvents(context, req.params.namespace, req.params.name, uid || undefined),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/pods/:namespace/:name/logs', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const container = typeof req.query.container === 'string' ? req.query.container : ''
    res.json(
      await getPodLogs(context, req.params.namespace, req.params.name, container || undefined),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/pods/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await getPodDetail(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/pods/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const yaml = typeof req.body?.yaml === 'string' ? req.body.yaml : ''
    if (!yaml.trim()) {
      res.status(400).json({ error: 'YAML пустой' })
      return
    }
    res.json(await applyPodYaml(context, req.params.namespace, req.params.name, yaml))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Некорректный YAML|не совпадает|Ожидался kind|YAML должен|пустой/i.test(message)
      ? 400
      : 500
    sendError(res, err, status)
  }
})

app.delete('/api/pods/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    await deletePod(context, req.params.namespace, req.params.name)
    res.json({ ok: true })
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/deployments', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { apps } = getApis(context)
    const result = namespace
      ? await apps.listNamespacedDeployment({ namespace })
      : await apps.listDeploymentForAllNamespaces()
    res.json((result.items ?? []).map(mapDeployment))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/deployments/:namespace/:name/events', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const uid = typeof req.query.uid === 'string' ? req.query.uid : ''
    res.json(
      await getDeploymentEvents(context, req.params.namespace, req.params.name, uid || undefined),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/deployments/:namespace/:name/pods', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await listDeploymentPods(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/deployments/:namespace/:name/replicasets', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await listDeploymentReplicaSets(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/deployments/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await getDeploymentDetail(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/deployments/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const yaml = typeof req.body?.yaml === 'string' ? req.body.yaml : ''
    if (!yaml.trim()) {
      res.status(400).json({ error: 'YAML пустой' })
      return
    }
    res.json(await applyDeploymentYaml(context, req.params.namespace, req.params.name, yaml))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Некорректный YAML|не совпадает|Ожидался kind|YAML должен|пустой/i.test(message)
      ? 400
      : 500
    sendError(res, err, status)
  }
})

app.get('/api/replicasets', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { apps } = getApis(context)
    const result = namespace
      ? await apps.listNamespacedReplicaSet({ namespace })
      : await apps.listReplicaSetForAllNamespaces()
    res.json((result.items ?? []).map(mapReplicaSet))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/replicasets/:namespace/:name/events', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const uid = typeof req.query.uid === 'string' ? req.query.uid : ''
    res.json(
      await getReplicaSetEvents(context, req.params.namespace, req.params.name, uid || undefined),
    )
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/replicasets/:namespace/:name/pods', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await listReplicaSetPods(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/replicasets/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await getReplicaSetDetail(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/replicasets/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const yaml = typeof req.body?.yaml === 'string' ? req.body.yaml : ''
    if (!yaml.trim()) {
      res.status(400).json({ error: 'YAML пустой' })
      return
    }
    res.json(await applyReplicaSetYaml(context, req.params.namespace, req.params.name, yaml))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Некорректный YAML|не совпадает|Ожидался kind|YAML должен|пустой/i.test(message)
      ? 400
      : 500
    sendError(res, err, status)
  }
})

app.get('/api/statefulsets', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { apps } = getApis(context)
    const result = namespace
      ? await apps.listNamespacedStatefulSet({ namespace })
      : await apps.listStatefulSetForAllNamespaces()
    res.json((result.items ?? []).map(mapStatefulSet))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/services', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedService({ namespace })
      : await core.listServiceForAllNamespaces()
    res.json((result.items ?? []).map(mapService))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/ingresses', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { net } = getApis(context)
    const result = namespace
      ? await net.listNamespacedIngress({ namespace })
      : await net.listIngressForAllNamespaces()
    res.json((result.items ?? []).map(mapIngress))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/configmaps', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedConfigMap({ namespace })
      : await core.listConfigMapForAllNamespaces()
    res.json((result.items ?? []).map(mapConfigMap))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/configmaps/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    res.json(await getConfigMapDetail(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.put('/api/configmaps/:namespace/:name', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const yaml = typeof req.body?.yaml === 'string' ? req.body.yaml : ''
    if (!yaml.trim()) {
      res.status(400).json({ error: 'YAML пустой' })
      return
    }
    res.json(await applyConfigMapYaml(context, req.params.namespace, req.params.name, yaml))
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = /Некорректный YAML|не совпадает|Ожидался kind|YAML должен|пустой/i.test(message)
      ? 400
      : 500
    sendError(res, err, status)
  }
})

app.get('/api/secrets', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedSecret({ namespace })
      : await core.listSecretForAllNamespaces()
    res.json((result.items ?? []).map(mapSecret))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/persistentvolumes', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const { core } = getApis(context)
    const result = await core.listPersistentVolume()
    res.json((result.items ?? []).map(mapPersistentVolume))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/persistentvolumeclaims', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedPersistentVolumeClaim({ namespace })
      : await core.listPersistentVolumeClaimForAllNamespaces()
    res.json((result.items ?? []).map(mapPersistentVolumeClaim))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/storageclasses', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const { storage } = getApis(context)
    const result = await storage.listStorageClass()
    res.json((result.items ?? []).map(mapStorageClass))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.get('/api/nodes', async (req, res) => {
  try {
    const context = await k8sAuthFromReq(req, res)
    const { core } = getApis(context)
    const result = await core.listNode()
    res.json((result.items ?? []).map(mapNode))
  } catch (err) {
    sendEmptyIfDenied(res, err)
  }
})

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) {
    next(err)
    return
  }
  sendError(res, err)
})

const server = createServer(app)
attachPodExec(server)

server.listen(PORT, '0.0.0.0', () => {
  console.log(`KEKS API http://0.0.0.0:${PORT}`)
  console.log(`kubeconfig: ${kubeconfigPath()}`)
})
