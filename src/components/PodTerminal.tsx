import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { SearchSelect } from '@/components/SearchSelect'
import { podExecWebSocketUrl } from '@/lib/k8s-client'
import type { ClusterConnection } from '@/types/k8s'

interface PodTerminalProps {
  connection: ClusterConnection
  namespace: string
  name: string
  containers: string[]
  reconnectKey?: number
}

type TermStatus = 'connecting' | 'connected' | 'exited' | 'error'

function glyphSize(term: Terminal, fontSize: number, lineHeight: number) {
  try {
    const cell = (
      term as unknown as {
        _core: { _renderService: { dimensions: { css: { cell: { width: number; height: number } } } } }
      }
    )._core._renderService.dimensions.css.cell
    if (cell.width > 1 && cell.height > 1) return { width: cell.width, height: cell.height }
  } catch {
    /* fall through */
  }
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let width = fontSize * 0.6
  if (ctx) {
    ctx.font = `${fontSize}px "IBM Plex Mono", ui-monospace, monospace`
    width = ctx.measureText('M').width || width
  }
  return { width, height: fontSize * lineHeight }
}

export function PodTerminal({
  connection,
  namespace,
  name,
  containers,
  reconnectKey = 0,
}: PodTerminalProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [container, setContainer] = useState(containers[0] ?? '')
  const [status, setStatus] = useState<TermStatus>('connecting')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (container && containers.includes(container)) return
    setContainer(containers[0] ?? '')
  }, [containers, container])

  useEffect(() => {
    const el = hostRef.current
    if (!el || !connection.context || !namespace || !name) return

    const fontSize = 14
    const lineHeight = 1.35
    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorWidth: 1,
      convertEol: true,
      fontFamily: '"IBM Plex Mono", ui-monospace, monospace',
      fontSize,
      lineHeight,
      scrollback: 1000,
      theme: {
        background: '#121a17',
        foreground: '#f5f7f6',
        cursor: '#121a17',
        cursorAccent: '#121a17',
        selectionBackground: '#3d524880',
      },
    })
    term.open(el)

    const cursorEl = document.createElement('div')
    cursorEl.className = 'pod-term-cursor'
    const screen = el.querySelector('.xterm-screen')
    screen?.appendChild(cursorEl)

    const placeCursor = () => {
      const cell = glyphSize(term, fontSize, lineHeight)
      const curW = 6
      const curH = cell.height * 0.55
      cursorEl.style.width = `${curW}px`
      cursorEl.style.height = `${curH}px`
      cursorEl.style.left = `${term.buffer.active.cursorX * cell.width}px`
      cursorEl.style.top = `${term.buffer.active.cursorY * cell.height + (cell.height - curH) / 2}px`
    }

    const geometry = () => {
      const cell = glyphSize(term, fontSize, lineHeight)
      const width = el.clientWidth
      const height = el.clientHeight
      return {
        cols: Math.max(2, Math.floor(width / cell.width)),
        rows: Math.max(1, Math.floor(height / cell.height)),
      }
    }

    let ws: WebSocket | null = null
    let cancelled = false
    const disposers: Array<{ dispose: () => void }> = []

    const sendResize = () => {
      if (cancelled || !ws || ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }))
    }

    const fitNow = () => {
      if (cancelled) return
      const { cols, rows } = geometry()
      if (term.cols !== cols || term.rows !== rows) {
        term.resize(cols, rows)
      }
      sendResize()
      placeCursor()
    }

    const attachSocket = () => {
      if (cancelled || ws) return
      const { cols, rows } = geometry()
      term.resize(cols, rows)
      setStatus('connecting')
      setError(null)
      ws = new WebSocket(podExecWebSocketUrl(connection, namespace, name, container || undefined, { cols, rows }))
      ws.binaryType = 'arraybuffer'
      ws.onopen = () => {
        if (cancelled) return
        setStatus('connected')
        fitNow()
        term.focus()
      }
      ws.onmessage = (event) => {
        if (cancelled) return
        if (typeof event.data === 'string') {
          try {
            const msg = JSON.parse(event.data) as { type?: string; message?: string }
            if (msg.type === 'error') {
              setStatus('error')
              setError(msg.message || 'Ошибка терминала')
            }
            if (msg.type === 'exit') setStatus('exited')
          } catch {
            term.write(event.data)
          }
          return
        }
        term.write(new Uint8Array(event.data as ArrayBuffer))
      }
      ws.onerror = () => {
        if (cancelled) return
        setStatus('error')
        setError('Не удалось подключиться к терминалу')
      }
      ws.onclose = () => {
        if (cancelled) return
        setStatus((prev) => (prev === 'error' ? prev : 'exited'))
      }
    }

    disposers.push(
      term.onData((data) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        ws.send(JSON.stringify({ type: 'input', data }))
      }),
    )
    disposers.push(term.onResize(sendResize))
    disposers.push(term.onCursorMove(placeCursor))
    disposers.push(term.onRender(placeCursor))

    const ro = new ResizeObserver(() => fitNow())
    ro.observe(el)
    const onWin = () => fitNow()
    window.addEventListener('resize', onWin)

    const start = () => {
      if (cancelled) return
      if (el.clientWidth < 40 || el.clientHeight < 20) {
        window.requestAnimationFrame(start)
        return
      }
      fitNow()
      attachSocket()
    }
    const raf = window.requestAnimationFrame(start)
    const retry = window.setTimeout(start, 50)
    void document.fonts?.ready?.then(() => {
      if (!cancelled) {
        fitNow()
        if (!ws) attachSocket()
      }
    })

    return () => {
      cancelled = true
      window.cancelAnimationFrame(raf)
      window.clearTimeout(retry)
      window.removeEventListener('resize', onWin)
      ro.disconnect()
      disposers.forEach((d) => d.dispose())
      cursorEl.remove()
      ws?.close()
      term.dispose()
    }
  }, [connection.context, namespace, name, container, reconnectKey])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {containers.length > 0 && (
          <div className="max-w-[220px] min-w-[160px] flex-1">
            <SearchSelect
              ariaLabel="Container"
              value={container}
              options={containers}
              onChange={setContainer}
              placeholder="Контейнер"
              searchable={false}
            />
          </div>
        )}
        <p className="font-mono text-xs text-ink-500">
          {status === 'connecting' && 'Подключение…'}
          {status === 'connected' && 'Подключено'}
          {status === 'exited' && 'Сессия завершена'}
          {status === 'error' && (error ?? 'Ошибка')}
        </p>
      </div>
      {error && status === 'error' && (
        <p className="mb-3 rounded border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">
          {error}
        </p>
      )}
      <div className="overflow-hidden rounded border border-ink-200 bg-ink-900 p-3">
        <div ref={hostRef} className="pod-terminal h-[70vh] w-full" />
      </div>
    </div>
  )
}
