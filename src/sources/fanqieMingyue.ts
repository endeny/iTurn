import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext, SourceModule, BookStatus } from '@source/sdk'
import { asArray, bookFromItem, chapterFromItem, collectArraysByKey, fetchJson, fetchText, makeContent, manifestBase, openSettingsPage, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from '../helpers/common.ts'

const FANQIE = 'https://fanqienovel.com'

// 原明月源正文不是单纯读 fanqienovel.com/reader 的 __INITIAL_STATE__，
// 这里保留现有搜索/详情/目录实现，只把正文改成「多路兜底」。
const CONTENT_ROUTES = [
  'https://gofq.52dns.cc/content',
  'https://pyfq.52dns.cc/content',
  'https://fqxs.ns114.cc/content',
]

const manifest = manifestBase({
  id: 'legado.7.fanqie.mingyue',
  name: '番茄-明月（迁移版）',
  version: '0.2.3',
  icon: 'https://p1-tt.byteimg.com/origin/novel-static/a3621391ca2e537045168afda6722ee9',
  type: 'mixed',
  groups: ['Legado', '番茄', '明月'],
  baseUrl: FANQIE,
  entry: 'fanqieMingyue.ts',
  permissions: {
    network: {
      domains: [
        'fanqienovel.com',
        '*.snssdk.com',
        '*.fqnovel.com',
        'gofq.52dns.cc',
        'pyfq.52dns.cc',
        'fqxs.ns114.cc',
      ],
    },
    cookie: { domains: ['fanqienovel.com'] },
    storage: true,
    secret: true,
    browser: true,
  },
  settings: [...SOURCE_SETTINGS_COMMON],
  settingsPage: { title: '番茄明月设置' },
  limits: { timeoutMs: 180000, concurrent: 4 },
  match: { bookUrl: 'https?://(.*(fqnovel|snssdk|fanqienovel|changdunovel)\\.com|skybook.1113355.xyz)/.*[0-9]{19}.*' },
})

const WEB_HEADERS: Record<string, string> = {
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  referer: 'https://fanqienovel.com/',
}

function replaceCover(u: unknown): string | undefined {
  const s = str(u)
  return s ? s.replace(/(\d+)-tt/, '6-novel') : undefined
}

function rawBook(item: any): any {
  return item?.book_info || item?.bookInfo || item?.raw_book_info || item
}

function toBook(ctx: any, item: any) {
  const raw = rawBook(item)
  const id = str(raw?.book_id || raw?.bookId || raw?.mixed_data?.post_data?.post_id)
  const genre = raw?.genre ?? raw?.book_type
  return bookFromItem(ctx.source.id, raw, {
    id,
    bookUrl: JSON.stringify({ id, genre }),
    name: raw?.book_name || raw?.bookName || raw?.title || raw?.mixed_data?.post_data?.title,
    author: raw?.author || raw?.mixed_data?.post_data?.user_info?.user_name,
    cover: replaceCover(raw?.audio_thumb_uri || raw?.thumb_url || raw?.thumbUri || raw?.mixed_data?.post_data?.user_info?.user_avatar),
    intro: raw?.abstract || raw?.mixed_data?.post_data?.pure_content,
    kind: [raw?.category, genreName(genre)].filter(Boolean),
    wordCount: raw?.word_number || raw?.wordNumber,
    lastChapterName: raw?.last_chapter_title || raw?.lastChapterTitle,
    status: statusName(raw?.creation_status || raw?.creationStatus),
    extra: raw,
  })
}

function genreName(value: unknown): string | undefined {
  const n = Number(value)
  if (n === 1) return '漫画'
  if (n === 4) return '有声书'
  return undefined
}

function parseInitialState(html: string): any {
  const markers = ['window.__INITIAL_STATE__=', 'window.__INITIAL_STATE__ = ']
  let jsonStart = -1
  for (const marker of markers) {
    const start = html.indexOf(marker)
    if (start >= 0) {
      jsonStart = start + marker.length
      break
    }
  }
  if (jsonStart < 0) throw new Error('Fanqie initial state not found')

  let depth = 0
  let inString = false
  let escaped = false
  let objectStart = -1
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i]
    if (objectStart < 0) {
      if (ch === '{') objectStart = i
      else continue
    }
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return JSON.parse(html.slice(objectStart, i + 1))
    }
  }
  throw new Error('Fanqie initial state is incomplete')
}

async function fanqieHTML(path: string, cookie?: string): Promise<string> {
  const headers: Record<string, string> = { ...WEB_HEADERS }
  if (cookie) headers.cookie = cookie
  return fetchText(`${FANQIE}${path}`, { headers })
}

async function fanqieState(path: string, cookie?: string): Promise<any> {
  return parseInitialState(await fanqieHTML(path, cookie))
}

async function fanqieBookPage(id: string): Promise<any> {
  return (await fanqieState(`/page/${id}`))?.page || {}
}

function categoryNames(value: unknown): string[] {
  try {
    const parsed = JSON.parse(str(value))
    return asArray(parsed).map((x: any) => str(x?.Name)).filter(Boolean)
  } catch {
    return []
  }
}

function statusName(value: unknown): BookStatus {
  const n = Number(value)
  if (n === 0) return 'completed'
  if (n === 1) return 'ongoing'
  return 'unknown'
}

function decodeBase64Utf8(input: string): string {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const bytes: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of input.replace(/=+$/g, '')) {
    const value = table.indexOf(ch)
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes.push((buffer >> bits) & 0xff)
    }
  }

  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]
    if (b < 0x80) out += String.fromCharCode(b)
    else if ((b & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[++i] & 0x3f))
    } else if ((b & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      out += String.fromCharCode(((b & 0x0f) << 12) | ((bytes[++i] & 0x3f) << 6) | (bytes[++i] & 0x3f))
    } else {
      out += String.fromCharCode(b)
    }
  }
  return out
}

function dataURLPayload(value: string): string {
  const match = value.match(/^data:.*?base64,([^,]+)/)
  return match ? decodeBase64Utf8(match[1]) : value
}

function parseLooseObject(value: unknown): any {
  if (value && typeof value === 'object') return value
  const raw = dataURLPayload(str(value))
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function extractFanqieIds(value: unknown): { id?: string; itemId?: string; title?: string; genre?: unknown } {
  const object = parseLooseObject(value)
  const raw = dataURLPayload(str(value || object?.bookUrl || object?.chapterUrl))
  const urlId = (() => {
    try {
      const url = new URL(raw)
      return {
        id: str(url.searchParams.get('book_id') || url.searchParams.get('bookId') || url.searchParams.get('id')),
        itemId: str(url.searchParams.get('item_id') || url.searchParams.get('itemId') || url.searchParams.get('chapterId')),
      }
    } catch {
      return {}
    }
  })()
  const pair = raw.includes('#') ? raw.split('#') : []
  const ids = [...raw.matchAll(/\d{10,}/g)].map((match) => match[0])
  return {
    id: str(object?.id || object?.bookId || object?.book_id || object?.bid || urlId.id || pair[0] || ids[0]) || undefined,
    itemId: str(object?.itemId || object?.item_id || object?.chapterId || object?.chapter_id || urlId.itemId || pair[1] || ids[1] || ids[0]) || undefined,
    title: str(object?.title || object?.name) || undefined,
    genre: object?.genre,
  }
}

function bookIdentity(book: any) {
  return extractFanqieIds(book?.bookUrl || book?.tocUrl || book?.id || book)
}

function chapterIdentity(chapter: any) {
  const ids = extractFanqieIds(chapter?.chapterUrl || chapter?.url || chapter?.id || chapter)
  return { ...ids, title: ids.title || str(chapter?.name || chapter?.title) || undefined }
}

function bookFromPage(ctx: any, page: any, fallback?: any): BookInfo {
  const id = str(page?.bookId || fallback?.id || fallback?.bookUrl)
  const genre = page?.genre ?? fallback?.extra?.genre ?? fallback?.genre
  const info = {
    ...fallback,
    id,
    sourceId: ctx.source.id,
    name: str(page?.bookName || fallback?.name || fallback?.title),
    author: str(page?.author || fallback?.author) || undefined,
    bookUrl: JSON.stringify({ id, genre }),
    cover: replaceCover(page?.thumbUri || page?.thumbUrl || fallback?.cover || fallback?.coverUrl),
    intro: str(page?.abstract || fallback?.intro || fallback?.summary) || undefined,
    kind: [...categoryNames(page?.categoryV2), genreName(genre)].filter(Boolean),
    wordCount: Number(page?.wordNumber) || fallback?.wordCount,
    lastChapterName: str(page?.lastChapterTitle || fallback?.lastChapterName || fallback?.latestChapterTitle) || undefined,
    status: statusName(page?.creationStatus) || fallback?.status,
    tocUrl: JSON.stringify({ id, genre }),
    extra: page,
  }
  ctx.log.info(`Fanqie book info: ${JSON.stringify(info)}`)
  return info
}

async function cookieHeader(ctx: any, domain = 'fanqienovel.com'): Promise<string> {
  try {
    const cookies = await ctx.cookie.getAll(domain)
    return (cookies || []).map((cookie: any) => `${cookie.name}=${cookie.value}`).join('; ')
  } catch {
    return ''
  }
}

async function requestJson(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, options)
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}\n${text.slice(0, 160)}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`Invalid JSON: ${url}\n${text.slice(0, 160)}`)
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, '')
}

function looksObfuscatedContent(value: string): boolean {
  const text = stripHtml(value)
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, '')
    .trim()

  if (!text) return false

  // 番茄网页正文常见反爬：私用区字形 / 黑块 / 替换符。
  // 这种内容看起来不是空，但实际还没经过字体映射/解密，不能作为成功结果。
  const bad = text.match(/[\uE000-\uF8FF\u25A0\u2588\uFFFD]/g)?.length || 0
  if (bad >= 6) return true
  if (bad > 0 && bad / Math.max(1, text.length) > 0.015) return true

  return false
}

function normalizeContent(value: unknown): string {
  let content = str(value)
  if (!content) return ''

  // 有些接口会把 HTML 作为 JSON 字符串二次转义。
  try {
    if (/^"[\s\S]*"$/.test(content)) content = JSON.parse(content)
  } catch {}

  content = decodeHtmlEntities(content)
    .replace(/\\u003c/gi, '<')
    .replace(/\\u003e/gi, '>')
    .replace(/\\u0026/gi, '&')
    .replace(/\\n/g, '\n')
    .trim()

  if (!content) return ''
  if (looksObfuscatedContent(content)) return ''
  if (/<(p|div|br|span|img|h\d)\b/i.test(content)) return content

  // 纯文本兜底转成段落，避免阅读器把整章挤成一行。
  return content
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join('\n')
}

function pickContent(json: any): { title?: string; content?: string } {
  const candidates = [
    json?.data?.content,
    json?.data?.chapterData?.content,
    json?.data?.chapter_data?.content,
    json?.data?.chapter?.content,
    json?.content,
    json?.chapterData?.content,
    json?.reader?.chapterData?.content,
    json?.reader?.chapter_data?.content,
    json?.reader?.data?.content,
  ]
  const titles = [
    json?.data?.title,
    json?.data?.chapterData?.title,
    json?.data?.chapter_data?.title,
    json?.data?.chapter?.title,
    json?.title,
    json?.chapterData?.title,
    json?.reader?.chapterData?.title,
    json?.reader?.chapter_data?.title,
  ]

  for (let i = 0; i < candidates.length; i++) {
    const content = normalizeContent(candidates[i])
    if (content) return { title: str(titles[i]) || undefined, content }
  }

  // 最后兜底：深搜所有 content 字段，防止页面状态结构改名。
  const seen = new Set<any>()
  const stack = [json]
  while (stack.length) {
    const current = stack.pop()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)
    for (const [key, value] of Object.entries(current)) {
      if (/^(content|chapterContent|chapter_content|text)$/i.test(key)) {
        const content = normalizeContent(value)
        if (content && content.length > 20) return { title: str((current as any).title) || undefined, content }
      }
      if (value && typeof value === 'object') stack.push(value)
    }
  }

  return {}
}

async function contentFromFanqiePage(itemId: string, cookie: string): Promise<{ title?: string; content?: string }> {
  try {
    const state = await fanqieState(`/reader/${itemId}`, cookie)
    return pickContent(state)
  } catch {
    return {}
  }
}

async function contentFromFanqieApis(itemId: string, cookie: string): Promise<{ title?: string; content?: string }> {
  const headers: Record<string, string> = { ...WEB_HEADERS }
  if (cookie) headers.cookie = cookie

  const urls = [
    withQuery(`${FANQIE}/api/reader/full`, { itemId }),
    withQuery('https://reading.snssdk.com/reading/reader/full/v/', {
      aid: 1967,
      app_name: 'novelapp',
      device_platform: 'android',
      item_id: itemId,
    }),
  ]

  for (const url of urls) {
    try {
      const result = pickContent(await requestJson(url, { headers }))
      if (result.content) return result
    } catch {}
  }
  return {}
}

async function contentFromRoute(itemId: string): Promise<{ title?: string; content?: string }> {
  for (const route of CONTENT_ROUTES) {
    try {
      const json = await requestJson(withQuery(route, { item_id: itemId }), {
        headers: { 'user-agent': 'Mozilla/5.0', accept: 'application/json,text/plain,*/*' },
      })
      const result = pickContent(json)
      if (result.content) return result
    } catch {}
  }
  return {}
}

const module: SourceModule = {
  async search(ctx: SearchContext) {
    ctx.log.info(`Searching Fanqie for keyword: ${ctx.args.keyword}`)
    const key = ctx.args.keyword
    const pageSize = ctx.args.pageSize || 32
    let raw: any[] = []
    if (/^\d{19}$/.test(key)) {
      raw = [await fanqieBookPage(key)]
    } else {
      const url = withQuery('https://novel.snssdk.com/api/novel/channel/homepage/search/search/v2/', {
        device_platform: 'android',
        parent_enterfrom: 'novel_channel_search.tab.',
        offset: (ctx.args.page - 1) * pageSize,
        count: pageSize,
        pageSize,
        page_size: pageSize,
        aid: 1967,
        q: key,
      })
      const json: any = await fetchJson(url)
      raw = asArray(json?.data?.ret_data).concat(collectArraysByKey(json, 'book_info'))
    }
    const books = raw.map((x) => toBook(ctx, x)).filter((x: any) => str(x?.id || x?.bookUrl))
    return { books, page: ctx.args.page, hasMore: books.length > 0 }
  },

  async explore(ctx: ExploreContext) {
    ctx.log.info(`Exploring Fanqie category: ${ctx.args.payload?.category || '推荐'}`)
    if (!ctx.args.sectionId) return { items: rootCategories(['每周推荐', '男频精选', '女频精选', '巅峰榜单', '出版榜单', '短篇小说']) }
    const out = await module.search!({ ...ctx, args: { keyword: str(ctx.args.payload?.category || '推荐'), page: ctx.args.page, pageSize: ctx.args.pageSize } } as any)
    return { items: out.books.map((book) => ({ type: 'book' as const, book })), page: out.page, hasMore: out.hasMore }
  },

  async bookInfo(ctx: any): Promise<BookInfo> {
    ctx.log.info(`Fetching Fanqie book info for book: ${ctx.args.book || ''}`)
    const { id } = bookIdentity(ctx.args.book)
    if (!id) throw new Error(`Missing Fanqie book id: ${ctx.args.book.bookUrl || ctx.args.book.name || ''}`)
    return bookFromPage(ctx, await fanqieBookPage(id), ctx.args.book)
  },

  async toc(ctx: TocContext) {
    ctx.log.info(`Fetching Fanqie TOC for book: ${ctx.args.book.name || ctx.args.book.bookUrl || ''}`)
    const book = ctx.args.book as BookInfo
    const { id, genre } = bookIdentity(book)
    if (!id) throw new Error(`Missing Fanqie book id: ${book.tocUrl || book.bookUrl || ''}`)

    const json: any = await fetchJson(withQuery(`${FANQIE}/api/reader/directory/detail`, { bookId: id }))
    const groups = json?.data?.chapterListWithVolume || []
    const flat = asArray(groups).flatMap((x: any) => Array.isArray(x) ? x : asArray(x?.chapters || x?.chapterList || x?.itemDataList || x))

    const chapters = flat
      .filter((x: any) => x && !x?.isVolume)
      .map((x: any, i: number) => {
        const itemId = str(x?.itemId || x?.item_id || x?.chapterId || x?.id)
        return chapterFromItem(ctx.source.id, x, i, {
          id: itemId,
          name: str(x?.title || x?.chapterName).replace('版权信息页', ''),
          chapterUrl: JSON.stringify({ bid: id, itemId, title: x?.title || x?.chapterName, genre }),
          updateTime: x?.firstPassTime || x?.first_pass_time,
          volumeName: x?.volume_name || x?.volumeName,
          extra: x,
        })
      })
      .filter((x: any) => str(x?.id || x?.chapterUrl))

    return { chapters }
  },

  async content(ctx: ContentContext) {
    ctx.log.info(`Fetching Fanqie content for chapter: ${ctx.args.chapter.name || ctx.args.chapter.chapterUrl || ''}`)
    const info = chapterIdentity(ctx.args.chapter)
    const itemId = str(info.itemId)
    if (!itemId) throw new Error(`Missing Fanqie chapter id: ${ctx.args.chapter.chapterUrl || ctx.args.chapter.name || ''}`)

    const cookie = await cookieHeader(ctx)
    const title = info.title || ctx.args.chapter.name

    // 顺序很重要：原明月源正文不依赖 fanqienovel.com/reader 的原始网页文本。
    // 先走明文镜像/后端，官方网页/API 只作为兜底；且 normalizeContent 会过滤字体反爬后的黑块文本。
    const providers = [
      () => contentFromRoute(itemId),
      () => contentFromFanqieApis(itemId, cookie),
      () => contentFromFanqiePage(itemId, cookie),
    ]

    const errors: string[] = []
    for (const provider of providers) {
      try {
        const result = await provider()
        if (result.content) return makeContent(ctx, str(result.title || title), result.content)
      } catch (e) {
        errors.push(String((e as Error)?.message || e))
      }
    }

    throw new Error(`Fanqie content empty: itemId=${itemId}${errors.length ? `\n${errors.join('\n')}` : ''}`)
  },

  async settingsPage(ctx) {
    return openSettingsPage(ctx, manifest)
  },
}

const source: SourceManifest = {
  ...manifest,
  module,
}

export default source
