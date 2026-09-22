/** In-memory ring buffer of console output for the Logs panel. */

export type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  text: string
}

const MAX_ENTRIES = 5000

let nextId = 1
const entries: LogEntry[] = []
const listeners = new Set<() => void>()

let origConsole: {
  log: typeof console.log
  info: typeof console.info
  warn: typeof console.warn
  error: typeof console.error
  debug: typeof console.debug
} | null = null

function notify() {
  listeners.forEach((fn) => fn())
}

function formatArg(arg: unknown): string {
  if (arg === undefined) return 'undefined'
  if (arg === null) return 'null'
  if (typeof arg === 'string') return arg
  if (arg instanceof Error) return `${arg.name}: ${arg.message}${arg.stack ? `\n${arg.stack}` : ''}`
  try {
    return JSON.stringify(arg, null, 2) ?? String(arg)
  } catch {
    return String(arg)
  }
}

function push(level: LogLevel, args: unknown[]) {
  const text = args.map(formatArg).join(' ')
  entries.push({ id: nextId++, ts: Date.now(), level, text })
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES)
  notify()
}

/** Direct log entry — always captured, even before console patch. */
export function appLog(level: LogLevel, ...args: unknown[]): void {
  push(level, args)
  const c = origConsole ?? console
  switch (level) {
    case 'warn': c.warn(...args); break
    case 'error': c.error(...args); break
    case 'debug': c.debug(...args); break
    case 'info': c.info(...args); break
    default: c.log(...args)
  }
}

export function getLogEntries(): readonly LogEntry[] {
  return entries
}

export function subscribeLogs(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function clearLogs(): void {
  entries.length = 0
  notify()
}

export function formatLogsForCopy(list: readonly LogEntry[] = entries): string {
  const lines = list.map((e) => {
    const t = new Date(e.ts).toISOString().replace('T', ' ').replace('Z', '')
    return `[${t}] [${e.level.toUpperCase()}] ${e.text}`
  })
  return [
    'Callspire Web Softphone — session log',
    `URL: ${location.href}`,
    `User-Agent: ${navigator.userAgent}`,
    `Captured: ${new Date().toISOString()}`,
    '─'.repeat(60),
    ...lines,
  ].join('\n')
}

export async function copyLogsToClipboard(list?: readonly LogEntry[]): Promise<boolean> {
  const text = formatLogsForCopy(list)
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  }
}

export function downloadLogsAsTxt(list?: readonly LogEntry[]): void {
  const text = formatLogsForCopy(list)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const a = document.createElement('a')
  a.href = url
  a.download = `callspire-session-log-${stamp}.txt`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function errorCount(): number {
  return entries.filter((e) => e.level === 'error' || e.level === 'warn').length
}

/** Merge entries captured by index.html bootstrap (runs before ES modules). */
function mergeBootstrapEntries(): void {
  const boot = (globalThis as { __callspireLogBootstrap?: LogEntry[] }).__callspireLogBootstrap
  if (!boot?.length) return
  for (const e of boot) {
    entries.push({ ...e, id: nextId++ })
  }
  delete (globalThis as { __callspireLogBootstrap?: LogEntry[] }).__callspireLogBootstrap
}

/** Patch console.* once; must run before JsSIP loads (it binds console at import time). */
export function initLogCapture(): void {
  if ((globalThis as { __callspireLogs?: boolean }).__callspireLogs) return
  ;(globalThis as { __callspireLogs?: boolean }).__callspireLogs = true

  mergeBootstrapEntries()

  origConsole = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  }

  console.log = (...args: unknown[]) => { push('log', args); origConsole!.log(...args) }
  console.info = (...args: unknown[]) => { push('info', args); origConsole!.info(...args) }
  console.warn = (...args: unknown[]) => { push('warn', args); origConsole!.warn(...args) }
  console.error = (...args: unknown[]) => { push('error', args); origConsole!.error(...args) }
  console.debug = (...args: unknown[]) => { push('debug', args); origConsole!.debug(...args) }

  window.addEventListener('error', (e) => {
    push('error', [`Uncaught: ${e.message}`, e.filename ? `${e.filename}:${e.lineno}` : ''])
  })
  window.addEventListener('unhandledrejection', (e) => {
    push('error', ['Unhandled rejection:', e.reason])
  })

  push('info', ['Log capture started'])
}

// Top-level init: runs when this module is first imported, before App/JsSIP deps load.
initLogCapture()
