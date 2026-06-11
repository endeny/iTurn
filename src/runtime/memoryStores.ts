import type { CookieRecord } from '@source/sdk'

export class MemoryKV {
  private values = new Map<string, unknown>()

  async get<T = unknown>(key: string): Promise<T | null> {
    return this.values.has(key) ? (this.values.get(key) as T) : null
  }

  async set<T = unknown>(key: string, value: T): Promise<void> {
    this.values.set(key, value)
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  async clear(): Promise<void> {
    this.values.clear()
  }
}

export class MemoryCache {
  private values = new Map<string, { value: unknown; expiresAt?: number }>()

  async get<T = unknown>(key: string): Promise<T | null> {
    const item = this.values.get(key)
    if (!item) return null
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.values.delete(key)
      return null
    }
    return item.value as T
  }

  async set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.values.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    })
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key)
  }

  async clear(): Promise<void> {
    this.values.clear()
  }
}

function domainFromInput(domainOrUrl: string): string {
  try {
    return new URL(domainOrUrl).hostname.toLowerCase()
  } catch {
    return domainOrUrl.replace(/^\./, '').toLowerCase()
  }
}

function cookieKey(domain: string, name: string, path = '/') {
  return `${domain};${path};${name}`
}

function parseSetCookie(value: string, fallbackDomain: string): CookieRecord[] {
  // Good enough for local runtime testing. Production should use a real cookie parser.
  // Splitting combined Set-Cookie is tricky; this handles the common cases used by source testing.
  const pieces = value.split(/,(?=\s*[^;,\s]+=)/g)
  return pieces.map((line) => {
    const parts = line.split(';').map((x) => x.trim()).filter(Boolean)
    const [nameValue, ...attrs] = parts
    const eq = nameValue.indexOf('=')
    const cookie: CookieRecord = {
      name: eq >= 0 ? nameValue.slice(0, eq) : nameValue,
      value: eq >= 0 ? nameValue.slice(eq + 1) : '',
      domain: fallbackDomain,
      path: '/',
    }

    for (const attr of attrs) {
      const [rawKey, ...rawValue] = attr.split('=')
      const key = rawKey.toLowerCase()
      const attrValue = rawValue.join('=')
      if (key === 'domain') cookie.domain = attrValue.replace(/^\./, '').toLowerCase()
      else if (key === 'path') cookie.path = attrValue || '/'
      else if (key === 'expires') {
        const time = Date.parse(attrValue)
        if (!Number.isNaN(time)) cookie.expires = time
      } else if (key === 'max-age') {
        const seconds = Number(attrValue)
        if (Number.isFinite(seconds)) cookie.expires = Date.now() + seconds * 1000
      } else if (key === 'httponly') cookie.httpOnly = true
      else if (key === 'secure') cookie.secure = true
      else if (key === 'samesite') {
        const sameSite = attrValue.toLowerCase()
        if (sameSite === 'lax' || sameSite === 'strict' || sameSite === 'none') cookie.sameSite = sameSite
      }
    }

    return cookie
  })
}

export class MemoryCookieStore {
  private values = new Map<string, CookieRecord>()

  async get(domainOrUrl: string, name?: string): Promise<string | null> {
    const cookies = await this.getAll(domainOrUrl)
    if (name) return cookies.find((cookie) => cookie.name === name)?.value ?? null
    return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
  }

  async getAll(domainOrUrl: string): Promise<CookieRecord[]> {
    const domain = domainFromInput(domainOrUrl)
    const now = Date.now()
    const result: CookieRecord[] = []

    for (const [key, cookie] of this.values) {
      if (cookie.expires && cookie.expires <= now) {
        this.values.delete(key)
        continue
      }
      const cookieDomain = domainFromInput(cookie.domain || domain)
      if (domain === cookieDomain || domain.endsWith(`.${cookieDomain}`)) {
        result.push({ ...cookie })
      }
    }

    return result
  }

  async set(domainOrUrl: string, cookie: string | CookieRecord): Promise<void> {
    const fallbackDomain = domainFromInput(domainOrUrl)
    const cookies = typeof cookie === 'string' ? parseSetCookie(cookie, fallbackDomain) : [{ ...cookie, domain: cookie.domain || fallbackDomain }]
    for (const item of cookies) {
      const domain = domainFromInput(item.domain || fallbackDomain)
      const path = item.path || '/'
      this.values.set(cookieKey(domain, item.name, path), { ...item, domain, path })
    }
  }

  async remove(domainOrUrl: string, name?: string): Promise<void> {
    const domain = domainFromInput(domainOrUrl)
    for (const [key, cookie] of this.values) {
      if ((domainFromInput(cookie.domain || '') === domain || domain.endsWith(`.${domainFromInput(cookie.domain || '')}`)) && (!name || cookie.name === name)) {
        this.values.delete(key)
      }
    }
  }

  async clear(domainOrUrl?: string): Promise<void> {
    if (!domainOrUrl) {
      this.values.clear()
      return
    }
    await this.remove(domainOrUrl)
  }

  async storeFromResponse(url: string, headers: Headers) {
    const setCookie = headers.get('set-cookie')
    if (setCookie) await this.set(url, setCookie)
  }
}
