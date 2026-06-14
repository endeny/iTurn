declare const __sourceHost: SourceHost

type HostHeaders = Record<string, string>

interface HostFetchResult {
  bodyText?: string
  status?: number
  statusText?: string
  headers?: HostHeaders
  url?: string
}

interface SourceHost {
  fetch(url: string, init: { method: string; headers: HostHeaders; body: string | null }): Promise<HostFetchResult>
  secretGet(key: string): string | null
  secretSet(key: string, value: string): void
  secretRemove(key: string): void
  configGet(key: string): unknown
  configSet(key: string, value: unknown): void
  configRemove(key: string): void
  cookieGet(domain: string, name: string): string | null
  cookieGetAll(domain: string): unknown[]
  cookieSet(input: unknown): void
  cookieRemove(domain: string, name: string): void
  cookieClear(domain: string): void
  browserOpen(input: unknown): Promise<unknown>
  log(level: 'debug' | 'info' | 'warn' | 'error', args: unknown[]): void
  now(): number
  uuid(): string
}

class ShimHeaders {
  declare map: Record<string, string>

  constructor(init?: unknown) {
    this.map = {}
    if (!init) return
    if (init instanceof ShimHeaders) {
      init.forEach((value, key) => this.set(key, value))
    } else if (Array.isArray(init)) {
      for (const [key, value] of init) this.set(key, value)
    } else if (typeof init === 'object') {
      for (const key of Object.keys(init)) this.set(key, (init as Record<string, unknown>)[key])
    }
  }

  set(name: unknown, value: unknown) {
    this.map[String(name).toLowerCase()] = String(value)
  }

  get(name: unknown) {
    return this.map[String(name).toLowerCase()] ?? null
  }

  has(name: unknown) {
    return Object.prototype.hasOwnProperty.call(this.map, String(name).toLowerCase())
  }

  delete(name: unknown) {
    delete this.map[String(name).toLowerCase()]
  }

  append(name: unknown, value: unknown) {
    const key = String(name).toLowerCase()
    this.map[key] = this.map[key] ? `${this.map[key]}, ${String(value)}` : String(value)
  }

  forEach(callback: (value: string, key: string, headers: ShimHeaders) => void, thisArg?: unknown) {
    for (const key of Object.keys(this.map)) callback.call(thisArg, this.map[key], key, this)
  }

  [Symbol.iterator]() {
    return Object.entries(this.map)[Symbol.iterator]()
  }
}

class ShimRequest {
  declare url: string
  declare method: string
  declare headers: ShimHeaders
  declare body: unknown

  constructor(input: unknown, init: Record<string, unknown> = {}) {
    if (input instanceof ShimRequest) {
      this.url = input.url
      this.method = String(init.method || input.method).toUpperCase()
      this.headers = new ShimHeaders(init.headers || input.headers)
      this.body = init.body ?? input.body
    } else {
      this.url = String(input)
      this.method = String(init.method || 'GET').toUpperCase()
      this.headers = new ShimHeaders(init.headers)
      this.body = init.body
    }
  }
}

class ShimResponse {
  declare readonly bodyText: string
  declare status: number
  declare statusText: string
  declare headers: ShimHeaders
  declare url: string
  declare ok: boolean

  constructor(body: unknown = '', init: Record<string, unknown> = {}) {
    this.bodyText = String(body ?? '')
    this.status = Number(init.status ?? 200)
    this.statusText = String(init.statusText || '')
    this.headers = new ShimHeaders(init.headers)
    this.url = String(init.url || '')
    this.ok = this.status >= 200 && this.status < 300
  }

  async text() {
    return this.bodyText
  }

  async json() {
    return JSON.parse(this.bodyText)
  }

  clone() {
    return new ShimResponse(this.bodyText, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
      url: this.url,
    })
  }
}

class ShimURLSearchParams {
  declare items: [string, string][]

  constructor(init?: unknown) {
    this.items = []
    if (!init) return
    const s = String(init).replace(/^\?/, '')
    if (!s) return
    for (const part of s.split('&')) {
      const [key, value = ''] = part.split('=')
      this.append(decodeURIComponent(key.replace(/\+/g, ' ')), decodeURIComponent(value.replace(/\+/g, ' ')))
    }
  }

  append(key: unknown, value: unknown) {
    this.items.push([String(key), String(value)])
  }

  set(key: unknown, value: unknown) {
    this.delete(key)
    this.append(key, value)
  }

  get(key: unknown) {
    const item = this.items.find((x) => x[0] === String(key))
    return item ? item[1] : null
  }

  delete(key: unknown) {
    this.items = this.items.filter((x) => x[0] !== String(key))
  }

  toString() {
    return this.items.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')
  }
}

class ShimURL {
  declare protocol: string
  declare host: string
  declare hostname: string
  declare pathname: string
  declare origin: string
  declare search: string
  declare searchParams: ShimURLSearchParams

  constructor(input: unknown, base?: unknown) {
    let raw = String(input)
    if (base && !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) {
      const b = String(base)
      if (raw.startsWith('/')) {
        const match = b.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/]+)/)
        raw = (match ? match[1] : b.replace(/\/+$/, '')) + raw
      } else {
        raw = `${b.replace(/\/+$/, '')}/${raw}`
      }
    }

    const queryIndex = raw.indexOf('?')
    const basePart = queryIndex >= 0 ? raw.slice(0, queryIndex) : raw
    this.search = queryIndex >= 0 ? raw.slice(queryIndex) : ''
    const match = basePart.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)\/\/([^/]*)(.*)$/)
    this.protocol = match ? match[1] : ''
    this.host = match ? match[2] : ''
    this.hostname = this.host.split(':')[0]
    this.pathname = match ? match[3] || '/' : basePart
    this.origin = this.protocol ? `${this.protocol}//${this.host}` : ''
    this.searchParams = new ShimURLSearchParams(this.search)
  }

  toString() {
    const query = this.searchParams.toString()
    return this.origin + this.pathname + (query ? `?${query}` : '')
  }

  get href() {
    return this.toString()
  }
}

async function shimFetch(input: unknown, init: Record<string, unknown> = {}) {
  const req = input instanceof ShimRequest ? new ShimRequest(input, init) : new ShimRequest(input, init)
  const headers: HostHeaders = {}
  req.headers.forEach((value, key) => {
    headers[key] = value
  })

  const raw = await __sourceHost.fetch(req.url, {
    method: req.method,
    headers,
    body: req.body == null ? null : String(req.body),
  })

  return new ShimResponse(raw.bodyText || '', {
    status: raw.status,
    statusText: raw.statusText,
    headers: raw.headers || {},
    url: raw.url || req.url,
  })
}

function shimBtoa(input: unknown) {
  return String(input)
}

function shimAtob(input: unknown) {
  return String(input)
}

class ShimTextEncoder {
  encode(input = '') {
    const s = String(input)
    const a = new Uint8Array(s.length)
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 255
    return a
  }
}

class ShimTextDecoder {
  decode(input?: ArrayLike<number>) {
    return Array.from(input || []).map((x) => String.fromCharCode(x)).join('')
  }
}

const g = globalThis as any

g.Headers = g.Headers || ShimHeaders
g.Request = g.Request || ShimRequest
g.Response = g.Response || ShimResponse
g.URL = g.URL || ShimURL
g.URLSearchParams = g.URLSearchParams || ShimURLSearchParams
g.fetch = g.fetch || shimFetch
g.btoa = g.btoa || shimBtoa
g.atob = g.atob || shimAtob
g.TextEncoder = g.TextEncoder || ShimTextEncoder
g.TextDecoder = g.TextDecoder || ShimTextDecoder
g.self = g.self || globalThis
g.crypto = g.crypto || {
  getRandomValues: (array: ArrayLike<number> & { [index: number]: number }) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256)
    }
    return array
  },
  randomUUID: () => __sourceHost.uuid(),
}

g.__createSourceContext = function createSourceContext(source: unknown, env: unknown, args: unknown) {
  const utils = {
    sleep: (ms: unknown) => new Promise((resolve) => setTimeout(resolve, Number(ms || 0))),
    now: () => __sourceHost.now(),
    uuid: () => __sourceHost.uuid(),
    error: (input: any) => {
      const err = new Error((input && input.message) || 'SourceRuntimeError')
      if (input) Object.assign(err, input)
      return err
    },
    assert: (condition: unknown, input: any) => {
      if (!condition) throw utils.error(input)
    },
  }

  return {
    source,
    env,
    args,
    storage: {
      get: async () => null,
      set: async () => undefined,
      remove: async () => undefined,
    },
    secret: {
      get: (key: unknown) => __sourceHost.secretGet(String(key || '')),
      set: (key: unknown, value: unknown) => __sourceHost.secretSet(String(key || ''), String(value ?? '')),
      remove: (key: unknown) => __sourceHost.secretRemove(String(key || '')),
    },
    config: {
      get: (key: unknown) => __sourceHost.configGet(String(key || '')),
      set: (key: unknown, value: unknown) => __sourceHost.configSet(String(key || ''), value ?? null),
      remove: (key: unknown) => __sourceHost.configRemove(String(key || '')),
    },
    cache: {
      get: async () => null,
      set: async () => undefined,
      remove: async () => undefined,
    },
    cookie: {
      get: (domain: unknown, name: unknown) => __sourceHost.cookieGet(String(domain || ''), String(name || '')),
      getAll: (domain: unknown) => __sourceHost.cookieGetAll(String(domain || '')),
      set: (input: unknown) => __sourceHost.cookieSet(input || {}),
      remove: (domain: unknown, name: unknown) => __sourceHost.cookieRemove(String(domain || ''), String(name || '')),
      clear: (domain: unknown) => __sourceHost.cookieClear(String(domain || '')),
    },
    browser: {
      open: (input: unknown) => __sourceHost.browserOpen(input || {}),
    },
    log: {
      debug: (...args: unknown[]) => __sourceHost.log('debug', args),
      info: (...args: unknown[]) => __sourceHost.log('info', args),
      warn: (...args: unknown[]) => __sourceHost.log('warn', args),
      error: (...args: unknown[]) => __sourceHost.log('error', args),
    },
    utils,
  }
}

var self = globalThis.self
var crypto = globalThis.crypto
