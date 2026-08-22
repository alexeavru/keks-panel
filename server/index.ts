import { createServer } from 'node:http'
import cors from 'cors'
import express from 'express'
import {
  fetchSnapshot,
  getApis,
  kubeconfigPath,
  listContexts,
  mapDeployment,
  mapStatefulSet,
  mapNamespace,
  mapNode,
  mapService,
  mapIngress,
  mapConfigMap,
  listMappedPods,
  getPodDetail,
  getPodLogs,
  testContext,
} from './k8s.js'
import { handleCallback, logout, me, requireAuth, startLogin } from './auth.js'
import { attachPodExec } from './exec.js'

const app = express()
const PORT = Number(process.env.KEKS_API_PORT || 8787)

app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

function contextFromReq(req: express.Request): string {
  const fromQuery = typeof req.query.context === 'string' ? req.query.context : ''
  const fromHeader = typeof req.headers['x-k8s-context'] === 'string' ? req.headers['x-k8s-context'] : ''
  const context = fromQuery || fromHeader
  if (!context) {
    throw new Error('Укажите context (query ?context= или заголовок X-K8s-Context)')
  }
  return context
}

function sendError(res: express.Response, err: unknown, status = 500) {
  const message = err instanceof Error ? err.message : String(err)
  const code = /не найден|Укажите context/i.test(message) ? 400 : status
  res.status(code).json({ error: message })
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

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/') || req.path === '/health') {
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
    const context = contextFromReq(req)
    res.json(await fetchSnapshot(context))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/namespaces', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const { core } = getApis(context)
    const result = await core.listNamespace()
    res.json((result.items ?? []).map(mapNamespace))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/pods', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    res.json(await listMappedPods(context, namespace || undefined))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/pods/:namespace/:name/logs', async (req, res) => {
  try {
    const context = contextFromReq(req)
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
    const context = contextFromReq(req)
    res.json(await getPodDetail(context, req.params.namespace, req.params.name))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/deployments', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { apps } = getApis(context)
    const result = namespace
      ? await apps.listNamespacedDeployment({ namespace })
      : await apps.listDeploymentForAllNamespaces()
    res.json((result.items ?? []).map(mapDeployment))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/statefulsets', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { apps } = getApis(context)
    const result = namespace
      ? await apps.listNamespacedStatefulSet({ namespace })
      : await apps.listStatefulSetForAllNamespaces()
    res.json((result.items ?? []).map(mapStatefulSet))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/services', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedService({ namespace })
      : await core.listServiceForAllNamespaces()
    res.json((result.items ?? []).map(mapService))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/ingresses', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { net } = getApis(context)
    const result = namespace
      ? await net.listNamespacedIngress({ namespace })
      : await net.listIngressForAllNamespaces()
    res.json((result.items ?? []).map(mapIngress))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/configmaps', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const namespace = typeof req.query.namespace === 'string' ? req.query.namespace : ''
    const { core } = getApis(context)
    const result = namespace
      ? await core.listNamespacedConfigMap({ namespace })
      : await core.listConfigMapForAllNamespaces()
    res.json((result.items ?? []).map(mapConfigMap))
  } catch (err) {
    sendError(res, err)
  }
})

app.get('/api/nodes', async (req, res) => {
  try {
    const context = contextFromReq(req)
    const { core } = getApis(context)
    const result = await core.listNode()
    res.json((result.items ?? []).map(mapNode))
  } catch (err) {
    sendError(res, err)
  }
})

const server = createServer(app)
attachPodExec(server)

server.listen(PORT, () => {
  console.log(`KEKS API http://localhost:${PORT}`)
  console.log(`kubeconfig: ${kubeconfigPath()}`)
})
