import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { PassThrough } from 'node:stream'
import { Exec } from '@kubernetes/client-node'
import { WebSocket, WebSocketServer } from 'ws'
import { readUserFromCookieHeader } from './auth.js'
import { getApis } from './k8s.js'

type ResizableOut = PassThrough & { columns: number; rows: number }

function createStdout(cols: number, rows: number): ResizableOut {
  const stdout = new PassThrough() as ResizableOut
  stdout.columns = cols
  stdout.rows = rows
  return stdout
}

function sendJson(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

function asText(raw: unknown): string | null {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8')
  }
  return null
}

function parseSize(raw: string | null, fallback: number) {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 2 ? Math.floor(n) : fallback
}

function shellCommand(cols: number, rows: number) {
  return [
    '/bin/sh',
    '-c',
    `export TERM=xterm-256color COLUMNS=${cols} LINES=${rows}; stty cols ${cols} rows ${rows} 2>/dev/null; if [ -x /bin/bash ]; then exec /bin/bash; else exec /bin/sh; fi`,
  ]
}

async function handleExecSession(
  client: WebSocket,
  url: URL,
  namespace: string,
  name: string,
) {
  const context = url.searchParams.get('context') ?? ''
  const requested = url.searchParams.get('container') ?? ''
  if (!context) {
    sendJson(client, { type: 'error', message: 'Укажите context' })
    client.close()
    return
  }

  const { kc, core } = getApis(context)
  const pod = await core.readNamespacedPod({ name, namespace })
  const containers = (pod.spec?.containers ?? []).map((c) => c.name)
  const selected = requested && containers.includes(requested) ? requested : containers[0]
  if (!selected) {
    sendJson(client, { type: 'error', message: 'В поде нет контейнеров' })
    client.close()
    return
  }

  let lastCols = parseSize(url.searchParams.get('cols'), 80)
  let lastRows = parseSize(url.searchParams.get('rows'), 24)

  const stdin = new PassThrough()
  const stdout = createStdout(lastCols, lastRows)
  const stderr = new PassThrough()
  const pending: Buffer[] = []
  let stdoutReady = false
  let stdinReady = false
  let closed = false
  let kubeWs: {
    readyState: number
    send: (data: Buffer) => void
    close: () => void
    addEventListener: (event: string, cb: () => void) => void
  } | null = null
  const resizeTimers: ReturnType<typeof setTimeout>[] = []

  const sendPtyResize = () => {
    if (!kubeWs || kubeWs.readyState !== 1) return
    const payload = JSON.stringify({ Width: lastCols, Height: lastRows })
    const buf = Buffer.alloc(1 + Buffer.byteLength(payload))
    buf.writeUInt8(4, 0)
    buf.write(payload, 1)
    kubeWs.send(buf)
  }

  const cleanup = () => {
    if (closed) return
    closed = true
    for (const id of resizeTimers) clearTimeout(id)
    try {
      stdin.end()
    } catch {
      /* ignore */
    }
    try {
      kubeWs?.close()
    } catch {
      /* ignore */
    }
    if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
      client.close()
    }
  }

  const applySize = (cols: number, rows: number) => {
    lastCols = Math.max(2, Math.floor(cols))
    lastRows = Math.max(2, Math.floor(rows))
    stdout.columns = lastCols
    stdout.rows = lastRows
    if (stdoutReady) stdout.emit('resize')
    sendPtyResize()
  }

  const flush = (chunk: Buffer | string) => {
    if (client.readyState !== WebSocket.OPEN) return
    client.send(chunk, { binary: true })
  }
  stdout.on('data', flush)
  stderr.on('data', flush)

  const writeStdin = (data: string) => {
    const buf = Buffer.from(data, 'utf8')
    if (stdinReady) stdin.write(buf)
    else pending.push(buf)
  }

  client.on('message', (raw) => {
    const text = asText(raw)
    if (text == null) return
    try {
      const msg = JSON.parse(text) as { type?: string; data?: string; cols?: number; rows?: number }
      if (msg.type === 'resize' && typeof msg.cols === 'number' && typeof msg.rows === 'number') {
        applySize(msg.cols, msg.rows)
        return
      }
      if (msg.type === 'input' && typeof msg.data === 'string') {
        writeStdin(msg.data)
      }
    } catch {
      writeStdin(text)
    }
  })
  client.on('close', cleanup)
  client.on('error', cleanup)

  kubeWs = await new Exec(kc).exec(
    namespace,
    name,
    selected,
    shellCommand(lastCols, lastRows),
    stdout,
    stderr,
    stdin,
    true,
    () => {
      sendJson(client, { type: 'exit' })
      cleanup()
    },
  )
  if (closed || client.readyState !== WebSocket.OPEN) {
    kubeWs.close()
    return
  }

  stdoutReady = true
  stdinReady = true
  for (const chunk of pending) stdin.write(chunk)
  pending.length = 0
  applySize(lastCols, lastRows)
  resizeTimers.push(setTimeout(sendPtyResize, 50), setTimeout(sendPtyResize, 250))

  kubeWs.addEventListener('close', () => {
    sendJson(client, { type: 'exit' })
    cleanup()
  })
}

export function attachPodExec(server: HttpServer) {
  const wss = new WebSocketServer({ noServer: true })

  server.on('upgrade', (req: IncomingMessage, socket, head) => {
    const url = new URL(req.url ?? '', 'http://127.0.0.1')
    const match = url.pathname.match(/^\/api\/pods\/([^/]+)\/([^/]+)\/exec$/)
    if (!match) {
      socket.destroy()
      return
    }

    if (!readUserFromCookieHeader(req.headers.cookie)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    const namespace = decodeURIComponent(match[1])
    const name = decodeURIComponent(match[2])
    wss.handleUpgrade(req, socket, head, (ws) => {
      void handleExecSession(ws, url, namespace, name).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Не удалось открыть терминал'
        sendJson(ws, { type: 'error', message })
        ws.close()
      })
    })
  })
}
