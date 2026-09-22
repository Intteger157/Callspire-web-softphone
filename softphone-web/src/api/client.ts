import { appLog } from '@/logging/logCapture'

export class ApiError extends Error {
  status: number
  url: string

  constructor(message: string, status: number, url: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
  }
}

/** Browser API: `/softphone/api/*` (session cookie). Desktop app uses `/api/*` with JWT directly. */
export const API_BASE = `${import.meta.env.BASE_URL.replace(/\/?$/, '')}/api`

/** Resolve a path under the softphone API (`my-callerids`, `cdr`, etc.). */
export function apiPath(subpath: string): string {
  const tail = subpath.replace(/^\//, '').replace(/^api\//, '')
  return `${API_BASE}/${tail}`
}

type RequestOptions = {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

async function parseError(res: Response): Promise<string> {
  const ct = res.headers.get('content-type') || ''
  try {
    if (ct.includes('application/json')) {
      const data = await res.json()
      if (typeof data === 'string') return data
      return data.detail || data.message || res.statusText
    }
    return (await res.text()) || res.statusText
  } catch {
    return res.statusText
  }
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = path.startsWith('http') ? path : apiPath(path)
  const headers: Record<string, string> = { ...(options.headers || {}) }
  let body: BodyInit | undefined

  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body,
    credentials: 'include',
  })

  if (!res.ok) {
    const msg = await parseError(res)
    appLog('warn', `[api] ${options.method || 'GET'} ${url} → ${res.status}`, msg)
    throw new ApiError(msg, res.status, url)
  }

  if (res.status === 204) {
    return undefined as T
  }

  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) {
    return (await res.json()) as T
  }

  const text = (await res.text()) as unknown as T
  if (typeof text === 'string' && /^\s*</.test(text)) {
    throw new ApiError(
      'API returned HTML instead of JSON — check gateway routes or redeploy dist',
      res.status,
      url,
    )
  }
  return text
}

export const api = {
  get: <T>(path: string) => apiRequest<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'POST', body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: 'PUT', body }),
}
