import type {
  BookInfo,
  BookRef,
  Chapter,
  ContentBlock,
  ContentResult,
  ExploreItem,
  SearchContext,
  SourceContext,
  SourceId,
  SourceManifest,
  TocResult,
} from '@source/sdk'

export function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

export function num(value: unknown): number | undefined {
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function boolSetting(ctx: SourceContext<any>, key: string, fallback = false): boolean {
  const value = ctx.source.settings[key]
  return typeof value === 'boolean' ? value : fallback
}

export function stringSetting(ctx: SourceContext<any>, key: string, fallback = ''): string {
  const value = ctx.source.settings[key]
  return typeof value === 'string' ? value : fallback
}

export function enumSetting<T extends string>(ctx: SourceContext<any>, key: string, fallback: T): T {
  const value = ctx.source.settings[key]
  return typeof value === 'string' ? (value as T) : fallback
}

export function baseUrl(ctx: SourceContext<any>, fallback?: string): string {
  const custom = stringSetting(ctx, 'baseUrl', '').trim() || stringSetting(ctx, 'customDomain', '').trim()
  const value = custom || ctx.source.baseUrl || fallback || ''
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '')
  return `https://${value}`.replace(/\/+$/, '')
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function withQuery(url: string, query: Record<string, unknown>): string {
  const u = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    u.searchParams.set(key, String(value))
  }
  return u.toString()
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.text()
}

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init)
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(`JSON parse failed: ${url}\n${text.slice(0, 240)}`)
  }
}

export async function postJson<T = any>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
}

export function getPath(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').filter(Boolean).reduce((acc, key) => {
    if (acc == null) return undefined
    if (key === '*') return Array.isArray(acc) ? acc.flat() : undefined
    return acc[key]
  }, obj)
}

export function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value).flatMap((x) => Array.isArray(x) ? x : [x])
  return []
}

export function collectArraysByKey(obj: any, key: string): any[] {
  const out: any[] = []
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value[key])) out.push(...value[key])
    if (Array.isArray(value)) value.forEach(visit)
    else Object.values(value).forEach(visit)
  }
  visit(obj)
  return out
}

export function firstArray(...values: any[]): any[] {
  for (const value of values) {
    const arr = asArray(value)
    if (arr.length) return arr
  }
  return []
}

export function idFrom(input: unknown, fallback = ''): string {
  const raw = str(input, fallback)
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    return u.searchParams.get('book_id') || u.searchParams.get('bookId') || u.searchParams.get('id') || u.searchParams.get('chapterId') || u.pathname.split('/').filter(Boolean).pop() || raw
  } catch {}
  const m = raw.match(/(?:book_id|bookId|id|chapterId|item_id|itemId)=([^&#]+)/)
  if (m) return decodeURIComponent(m[1])
  return raw.replace(/^data:.*?base64,/, '').split(',')[0].slice(0, 80)
}

export function stripHtml(input: unknown): string {
  return str(input)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

export function htmlToParagraphs(html: string): ContentBlock[] {
  const normalized = html
    .replace(/<img\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi, '\n[[IMG:$2]]\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
  return normalized.split(/\n+/).map((line): ContentBlock | null => {
    const t = line.trim()
    if (!t) return null
    const img = t.match(/^\[\[IMG:(.+)\]\]$/)
    if (img) return { type: 'image', url: img[1] }
    return { type: 'paragraph', text: stripHtml(t) }
  }).filter(Boolean) as ContentBlock[]
}

export function makeContent(ctx: SourceContext<any>, title: string | undefined, raw: string): ContentResult {
  const format = enumSetting(ctx, 'contentFormat', 'blocks') as 'blocks' | 'text' | 'html'
  if (format === 'html') return { title, format: 'html', content: raw }
  if (format === 'text') return { title, format: 'text', content: stripHtml(raw) }
  return { title, format: 'blocks', content: htmlToParagraphs(raw) }
}

export function mapKind(...values: unknown[]): string[] | undefined {
  const result = values.flatMap((v) => {
    if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean)
    return str(v).split(/[,，\n/|]+/).map((x) => x.trim()).filter(Boolean)
  })
  return result.length ? [...new Set(result)] : undefined
}

export function bookFromItem(sourceId: SourceId, item: any, options: {
  id?: unknown
  name?: unknown
  author?: unknown
  bookUrl?: unknown
  cover?: unknown
  intro?: unknown
  kind?: unknown[]
  wordCount?: unknown
  lastChapterName?: unknown
  status?: BookRef['status']
  extra?: any
}): BookRef {
  const url = str(options.bookUrl || options.id || item?.bookUrl || item?.url || item?.book_id || item?.bookId || item?.id)
  return {
    id: idFrom(options.id || item?.book_id || item?.bookId || item?.id || url),
    sourceId,
    name: stripHtml(options.name ?? item?.name ?? item?.book_name ?? item?.bookName ?? item?.title ?? item?.articlename ?? '未命名'),
    author: stripHtml(options.author ?? item?.author ?? item?.original_author ?? '' ) || undefined,
    bookUrl: url,
    cover: str(options.cover ?? item?.src ?? item?.cover ?? item?.thumb_url ?? item?.thumbUri ?? item?.image_link ?? item?.imgUrl) || undefined,
    intro: stripHtml(options.intro ?? item?.intro ?? item?.abstract ?? '') || undefined,
    kind: mapKind(...(options.kind || [item?.kind, item?.mmfl, item?.category, item?.tags, item?.ptags, item?.keywords])),
    wordCount: num(options.wordCount ?? item?.wordCount ?? item?.word_number ?? item?.words_num ?? item?.words),
    lastChapterName: stripHtml(options.lastChapterName ?? item?.last_chapter_title ?? item?.lastchapter ?? '') || undefined,
    status: options.status,
    extra: options.extra ?? item,
  }
}

export function chapterFromItem(sourceId: SourceId, item: any, index: number, options: {
  id?: unknown
  name?: unknown
  chapterUrl?: unknown
  updateTime?: unknown
  wordCount?: unknown
  volumeName?: unknown
  extra?: any
}): Chapter {
  const chapterUrl = str(options.chapterUrl ?? item?.chapterUrl ?? item?.url ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapterid)
  return {
    id: idFrom(options.id ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapter_id ?? item?.chapterid ?? chapterUrl),
    sourceId,
    name: stripHtml(options.name ?? item?.title ?? item?.name ?? item?.chaptername ?? `第 ${index + 1} 章`),
    chapterUrl,
    index,
    updateTime: num(options.updateTime ?? item?.updateTime ?? item?.first_pass_time ?? item?.firstPassTime),
    wordCount: num(options.wordCount ?? item?.wordCount ?? item?.chapter_word_number ?? item?.words),
    volumeName: str(options.volumeName ?? item?.volume_name ?? '') || undefined,
    extra: options.extra ?? item,
  }
}

export function rootCategories(names: string[], section = 'category'): ExploreItem[] {
  return names.map((title) => ({
    type: 'category',
    title,
    action: { type: 'openExplore', sectionId: section, payload: { category: title } },
    layout: { basis: 0.25, grow: 1 },
  }))
}

export function manifestBase(input: Omit<SourceManifest, 'schemaVersion' | 'entry'> & Partial<Pick<SourceManifest, 'entry'>>): SourceManifest {
  return {
    schemaVersion: 1,
    entry: input.entry || `${input.id}.ts`,
    ...input,
  }
}

export async function md5Hex(input: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(input).digest('hex')
}

export function sortedSign(obj: Record<string, unknown>, key: string): string {
  return Object.keys(obj).sort().reduce((pre, name) => pre + name + '=' + obj[name], '') + key
}

export async function aesCbcPkcs7Base64(cipherBase64: string, keyUtf8: string): Promise<string> {
  const { createDecipheriv } = await import('node:crypto')
  const raw = Buffer.from(cipherBase64, 'base64')
  const iv = raw.subarray(0, 16)
  const encrypted = raw.subarray(16)
  const decipher = createDecipheriv('aes-128-cbc', Buffer.from(keyUtf8, 'utf8'), iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function encodeOpaque(value: unknown): string {
  return `opaque:${btoa(unescape(encodeURIComponent(JSON.stringify(value))))}`
}

export function decodeOpaque<T = any>(value: string): T {
  if (!value.startsWith('opaque:')) return JSON.parse(value) as T
  return JSON.parse(decodeURIComponent(escape(atob(value.slice('opaque:'.length))))) as T
}

export const SOURCE_SETTINGS_COMMON = [
  { key: 'contentFormat', title: '正文格式', type: 'select' as const, defaultValue: 'blocks', options: [{ title: 'Blocks', value: 'blocks' }, { title: 'Text', value: 'text' }, { title: 'HTML', value: 'html' }] },
]
