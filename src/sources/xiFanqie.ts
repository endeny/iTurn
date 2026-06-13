import type {
  BookInfo,
  BookStatus,
  ContentContext,
  ExploreContext,
  SearchContext,
  SettingsPageContext,
  SourceActionResult,
  SourceManifest,
  SourceModule,
  TocContext,
} from '@source/sdk'

import {
  asArray,
  bookFromItem,
  chapterFromItem,
  fetchJson,
  joinUrl,
  makeContent,
  manifestBase,
  rootCategories,
  SOURCE_SETTINGS_COMMON,
  str,
  withQuery,
} from '../helpers/common.ts'

const DEFAULT_BASE = 'http://fanqie1.xi520.top:40181'
const KEY_URL = 'http://110.42.61.178:61902/user'
const STATUS_URL = 'http://fanqie1.lnbx520.top:40181/status'
const COMMENT_HOST = 'https://changdunovel.com'

const manifest = manifestBase({
  id: 'legado.6.xi.fanqie',
  name: 'xi~番茄 v3.0.0（迁移修正版）',
  version: '0.3.0',
  icon: 'https://p1-tt.byteimg.com/origin/novel-static/a3621391ca2e537045168afda6722ee9',
  type: 'novel',
  groups: ['Legado', '番茄', 'xi', '阅读'],
  baseUrl: DEFAULT_BASE,
  entry: 'xiFanqie.ts',
  permissions: {
    network: {
      domains: [
        'fanqie1.xi520.top',
        'fanqie1.lnbx520.top',
        '110.42.61.178',
        'changdunovel.com',
        'fanqienovel.com',
      ],
    },
    cookie: { domains: ['fanqienovel.com'] },
    storage: true,
    secret: true,
    browser: true,
  },
  settings: [
    { key: 'apiBase', title: '接口地址', type: 'text', defaultValue: DEFAULT_BASE },
    { key: 'apiToken', title: '密钥 / X-Api-Token', type: 'token' },
    { key: 'commentCount', title: '书评数量', type: 'text', defaultValue: '20' },
    ...SOURCE_SETTINGS_COMMON,
  ],
  settingsPage: { title: 'xi 番茄设置' },
  limits: { timeoutMs: 180000, concurrent: 4 },
  match: {
    bookUrl: 'https?://.*(fanqie1\\.xi520\\.top|fanqienovel|changdunovel).*|\\{.*book_id.*\\}',
  },
})

function api(ctx: any): string {
  return str(ctx.source.settings.apiBase || DEFAULT_BASE).replace(/\/+$/, '')
}

function apiUrl(ctx: any, path: string, query?: Record<string, any>): string {
  return withQuery(joinUrl(api(ctx), path), query || {})
}

function token(ctx: any): string {
  return str(ctx.source.settings.apiToken).trim()
}

function headers(ctx: any): HeadersInit {
  const apiToken = token(ctx)
  return apiToken ? { 'X-Api-Token': apiToken } : {}
}

function escapeHTML(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function tryParseJson(value: unknown): any {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(str(value))
  } catch {
    return {}
  }
}

function normalizeData(json: any): any {
  const data = json?.data ?? json
  return typeof data === 'string' ? tryParseJson(data) : data
}

function parseNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : undefined
  }

  const raw = str(value).replace(/,/g, '').trim()
  if (!raw) return undefined

  const direct = Number(raw)
  if (Number.isFinite(direct) && direct > 0) return Math.floor(direct)

  const match = raw.match(/([\d.]+)\s*(亿|万|千)?/)
  if (!match) return undefined

  const base = Number(match[1])
  if (!Number.isFinite(base) || base <= 0) return undefined

  const unit = match[2]
  const factor = unit === '亿' ? 100000000 : unit === '万' ? 10000 : unit === '千' ? 1000 : 1
  return Math.floor(base * factor)
}

function wordCount(item: any): number | undefined {
  return parseNumber(
    item?.word_number ??
      item?.wordNumber ??
      item?.word_count ??
      item?.wordCount ??
      item?.words_num ??
      item?.wordsNum ??
      item?.words,
  )
}

function sourceStatus(item: any): string | undefined {
  const visible = item?.book_search_visible
  if (visible === true || visible === 'true') return '正常'
  if (str(item?.tomato_book_status) === '3') return '下架'
  if (visible === false || visible === 'false') return '小黑屋'
  return undefined
}

function creationStatus(value: unknown): BookStatus {
  const s = str(value)
  if (s === '0') return 'ongoing'
  if (s === '1') return 'completed'
  if (s === '4') return 'paused'
  if (s === '-1') return 'unknown'
  if (/完结|已完|completed/i.test(s)) return 'completed'
  if (/连载|ongoing|更新/i.test(s)) return 'ongoing'
  return 'unknown'
}

function genderName(value: unknown, item?: any): string | undefined {
  if (str(item?.isbn)) return '出版'
  const s = str(value)
  if (!s) return undefined
  if (s === '0') return undefined
  if (s === '1') return '女频'
  if (s === '2') return '出版'
  return `男生${s}女生`
}

function formatTimestamp(value: unknown, withTime = false): string | undefined {
  const raw = str(value)
  if (!raw) return undefined

  const numeric = Number(raw)
  if (!Number.isFinite(numeric)) {
    return raw.replace(/T.*$/, '').replace(/\+.*$/, '')
  }

  const ms = numeric < 10_000_000_000 ? numeric * 1000 : numeric
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return undefined

  const offset = 8 * 60 * 60 * 1000
  const local = new Date(date.getTime() + offset)
  const yyyy = local.getUTCFullYear()
  const mm = String(local.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(local.getUTCDate()).padStart(2, '0')
  if (!withTime) return `${yyyy}-${mm}-${dd}`

  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mi = String(local.getUTCMinutes()).padStart(2, '0')
  const ss = String(local.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`
}

function compactLines(lines: Array<string | undefined | null | false>): string {
  return lines.map((x) => str(x).trim()).filter(Boolean).join('\n')
}

function normalizeTags(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map((x) => str(x?.Name ?? x?.name ?? x)).filter(Boolean).join('、')
  const raw = str(value)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((x) => str(x?.Name ?? x?.name ?? x)).filter(Boolean).join('、')
  } catch {}
  return raw.replace(/^\[|\]$/g, '').replace(/"/g, '')
}

function normalizeRoles(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.map((x) => str(x?.name ?? x)).filter(Boolean).join('、')
  const raw = str(value)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.map((x) => str(x?.name ?? x)).filter(Boolean).join('、')
  } catch {}
  return raw.replace(/^\[|\]$/g, '').replace(/"/g, '')
}

function stripCopyright(value: unknown): string | undefined {
  const raw = str(value).trim()
  if (!raw) return undefined
  return raw.replace(/，.*$/, '。')
}

function coverUrl(value: unknown): string | undefined {
  const s = str(value)
  return s || undefined
}

function bookIdFromValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const x: any = value
    return str(x?.book_id || x?.bookId || x?.id || x?.book?.book_id || x?.bookInfo?.book_id)
  }

  const raw = str(value)
  if (!raw) return ''

  const object = tryParseJson(raw)
  const fromObject = str(object?.book_id || object?.bookId || object?.id)
  if (fromObject) return fromObject

  try {
    const url = new URL(raw, DEFAULT_BASE)
    return str(url.searchParams.get('book_id') || url.searchParams.get('bookId') || url.searchParams.get('id'))
  } catch {}

  const match = raw.match(/\d{10,}/)
  return match?.[0] || ''
}

function bookIdFromBook(book: any): string {
  return (
    bookIdFromValue(book?.bookUrl) ||
    bookIdFromValue(book?.tocUrl) ||
    bookIdFromValue(book?.id) ||
    bookIdFromValue(book?.extra) ||
    bookIdFromValue(book)
  )
}

function chapterIdFromValue(value: unknown): string {
  if (value && typeof value === 'object') {
    const x: any = value
    return str(x?.itemId || x?.item_id || x?.chapterId || x?.chapter_id || x?.id)
  }

  const raw = str(value)
  if (!raw) return ''

  const object = tryParseJson(raw)
  const fromObject = str(object?.itemId || object?.item_id || object?.chapterId || object?.chapter_id || object?.id)
  if (fromObject) return fromObject

  try {
    const url = new URL(raw, DEFAULT_BASE)
    return str(
      url.searchParams.get('item_id') ||
        url.searchParams.get('itemId') ||
        url.searchParams.get('chapter_id') ||
        url.searchParams.get('chapterId') ||
        url.searchParams.get('id'),
    )
  } catch {}

  const match = raw.match(/\d{10,}/)
  return match?.[0] || ''
}

function rawBookUrl(ctx: any, id: string, item: any): string {
  return JSON.stringify({
    book_id: id,
    detailUrl: apiUrl(ctx, '/api/detail', { book_id: id }),
    sourceName: item?.original_book_name,
  })
}

function flattenSearchTabs(value: any): any[] {
  const out: any[] = []

  const walk = (x: any) => {
    if (!x) return
    if (Array.isArray(x)) {
      x.forEach(walk)
      return
    }

    if (typeof x === 'object') {
      const id = x.book_id || x.bookId
      if (id) {
        out.push(x)
        return
      }

      for (const key of ['data', 'list', 'books', 'items', 'search_tabs', 'book_data']) {
        if (x[key]) walk(x[key])
      }

      // Legado 的 ".search_tabs.*" 对对象会取所有 value。
      if (!Object.values(x).some((v: any) => Array.isArray(v) || (v && typeof v === 'object' && (v.book_id || v.bookId)))) {
        return
      }

      for (const v of Object.values(x)) walk(v)
    }
  }

  walk(value)
  const seen = new Set<string>()
  return out.filter((x) => {
    const id = str(x?.book_id || x?.bookId)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function flattenChapters(value: any): any[] {
  const out: any[] = []

  const walk = (x: any, volumeName?: string) => {
    if (!x) return
    if (Array.isArray(x)) {
      x.forEach((item) => walk(item, volumeName))
      return
    }

    if (typeof x !== 'object') return

    const nextVolume = str(x.volume_name || x.volumeName || x.name || volumeName)
    const itemId = x.itemId || x.item_id || x.chapterId || x.chapter_id

    if (itemId && x.title) {
      out.push({ ...x, volume_name: x.volume_name || x.volumeName || volumeName })
      return
    }

    for (const key of ['chapters', 'chapterList', 'chapter_list', 'chapterListWithVolume', 'item_data_list', 'lists', 'data']) {
      if (x[key]) walk(x[key], nextVolume)
    }
  }

  walk(value)
  const seen = new Set<string>()
  return out.filter((x) => {
    const id = str(x.itemId || x.item_id || x.chapterId || x.chapter_id)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function buildKind(item: any): string[] {
  return [
    genderName(item?.gender, item),
    str(item?.category),
  ].filter(Boolean) as string[]
}

function toBook(ctx: any, item: any) {
  const id = str(item?.book_id || item?.bookId)
  const name = str(item?.original_book_name || item?.book_name || item?.bookName || item?.title)
  const words = wordCount(item)

  return bookFromItem(ctx.source.id, item, {
    id,
    bookUrl: rawBookUrl(ctx, id, item),
    name,
    author: str(item?.author) || undefined,
    cover: coverUrl(item?.thumb_url || item?.thumbUrl),
    intro: str(item?.abstract || item?.intro) || undefined,
    kind: buildKind(item),
    wordCount: words,
    lastChapterName: str(item?.last_chapter_title || item?.lastChapterTitle) || undefined,
    status: creationStatus(item?.creation_status || item?.creationStatus),
    extra: item,
  })
}

async function getNovelComment(ctx: any, bookId: string): Promise<string> {
  const count = Math.max(0, Math.min(50, parseNumber(ctx.source.settings.commentCount) || 20))
  if (!bookId || count <= 0) return ''

  try {
    const url = withQuery(`${COMMENT_HOST}/reading/ugc/novel_comment/book/v1`, {
      query_type: 0,
      offset: 0,
      count,
      sort: 'create_time',
      need_hot_comment: 0,
      book_id: bookId,
      aid: 1967,
      addQueryPrefix: true,
    })

    const json: any = await fetchJson(url)
    const comments = asArray(json?.data?.comment)
    if (!comments.length) return ''

    const lines = [`(共 ${comments.length} 条)`]
    for (const comment of comments) {
      const score = Number(comment?.score)
      const startNum = Number.isFinite(score) ? 5 - Math.floor(score / 2) : 0
      const stars = '★★★★★★☆☆☆☆☆'.slice(Math.max(0, startNum), Math.max(0, startNum) + 5)
      const gender = Number(comment?.user_info?.gender) === 1 ? '👨🏻' : '👱🏻'
      const user = str(comment?.user_info?.user_name || '匿名')
      const text = str(comment?.text).replace(/###\s/g, '').trim()
      lines.push(`${gender} ${user} || ${stars}`)
      if (text) lines.push(text)
      lines.push('&lrm;')
    }

    return lines.join('\n')
  } catch {
    return ''
  }
}

async function buildIntro(ctx: any, d: any): Promise<string> {
  const id = str(d?.book_id || d?.bookId)
  const comments = await getNovelComment(ctx, id)

  return compactLines([
    d?.original_book_name ? `📕 源名：${str(d.original_book_name)}` : undefined,
    d?.book_flight_alias_name ? `📖 别名：${str(d.book_flight_alias_name)}` : undefined,
    d?.create_time ? `✏️ 开坑：${str(d.create_time).replace(/T.*$/, '').replace(/\+.*$/, '')}` : undefined,
    normalizeTags(d?.tags) ? `🏷️ 标签：${normalizeTags(d?.tags)}` : undefined,
    normalizeRoles(d?.roles) ? `👤 主角：${normalizeRoles(d?.roles)}` : undefined,
    d?.read_count ? `👁️ 在线：${str(d.read_count)}人在读` : undefined,
    sourceStatus(d) ? `🔗 书籍状态：${sourceStatus(d)}` : undefined,
    str(d?.abstract) ? `📜 简介：${str(d.abstract)}` : undefined,
    stripCopyright(d?.copyright_info) ? `📍 ${stripCopyright(d.copyright_info)}` : undefined,
    str(d?.tts_info),
    comments,
  ])
}

async function bookInfoFromDetail(ctx: any, fallback: any): Promise<BookInfo> {
  const id = bookIdFromBook(fallback)
  if (!id) throw new Error(`Missing xi fanqie book_id: ${fallback?.bookUrl || fallback?.name || ''}`)

  const detailUrl = apiUrl(ctx, '/api/detail', { book_id: id })
  const json: any = await fetchJson(detailUrl, { headers: headers(ctx) })
  const d = normalizeData(json)

  const bookId = str(d?.book_id || d?.bookId || id)
  const intro = await buildIntro(ctx, d)

  return {
    ...fallback,
    id: bookId,
    sourceId: ctx.source.id,
    name: str(d?.book_name || d?.original_book_name || fallback?.name),
    author: str(d?.author || fallback?.author) || undefined,
    cover: coverUrl(d?.thumb_url || d?.thumbUrl || fallback?.cover || fallback?.coverUrl),
    intro: intro || str(d?.abstract || fallback?.intro) || undefined,
    kind: buildKind(d),
    wordCount: wordCount(d) || fallback?.wordCount,
    lastChapterName: str(d?.last_chapter_title || d?.lastChapterTitle || fallback?.lastChapterName) || undefined,
    tocUrl: apiUrl(ctx, '/api/directory', { book_id: bookId }),
    bookUrl: rawBookUrl(ctx, bookId, d),
    extra: d,
  }
}

function settingsPageHTML(ctx: SettingsPageContext): string {
  const base = escapeHTML(api(ctx))
  const apiToken = escapeHTML(token(ctx))
  const commentCount = escapeHTML(str(ctx.source.settings.commentCount || '20'))

  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>xi 番茄设置</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; background: Canvas; color: CanvasText; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    p { color: color-mix(in srgb, CanvasText 64%, transparent); line-height: 1.65; }
    label { display: block; font-weight: 700; margin: 20px 0 8px; }
    input { width: 100%; box-sizing: border-box; font: inherit; padding: 12px 14px; border-radius: 10px; border: 1px solid color-mix(in srgb, CanvasText 22%, transparent); background: Canvas; color: CanvasText; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    button, a.button { appearance: none; border: 0; border-radius: 999px; padding: 11px 18px; font: inherit; font-weight: 700; background: #0a84ff; color: white; text-decoration: none; cursor: pointer; }
    button.secondary, a.secondary { background: color-mix(in srgb, CanvasText 12%, transparent); color: CanvasText; }
    .status { min-height: 24px; margin-top: 14px; font-weight: 600; white-space: pre-wrap; }
    code { word-break: break-all; }
  </style>
</head>
<body>
  <main>
    <h1>xi 番茄设置</h1>
    <p>这个源原始 Legado 版本把“密钥”放在登录界面里，正文接口通过 <code>X-Api-Token</code> 请求头传递。这里改成 iTurn 显式配置。</p>

    <div class="row">
      <a class="button" href="${KEY_URL}">获取密钥</a>
      <a class="button secondary" href="${STATUS_URL}">查看接口状态</a>
      <a class="button secondary" href="${base}/ping">检测服务器</a>
    </div>

    <label for="apiBase">接口地址</label>
    <input id="apiBase" value="${base}" autocomplete="off">

    <label for="apiToken">密钥 / X-Api-Token</label>
    <input id="apiToken" value="${apiToken}" autocomplete="off" placeholder="从“获取密钥”页面复制">

    <label for="commentCount">详情页书评数量</label>
    <input id="commentCount" value="${commentCount}" autocomplete="off" inputmode="numeric">

    <div class="row">
      <button id="save">保存配置</button>
      <button class="secondary" id="clear">清除密钥</button>
    </div>

    <div class="status" id="status"></div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id)
    const status = $('status')

    async function saveValue(key, value) {
      value = String(value || '').trim()
      if (value) await window.iturn.config.set(key, value)
      else await window.iturn.config.remove(key)
    }

    $('save').addEventListener('click', async () => {
      await saveValue('apiBase', $('apiBase').value)
      await saveValue('apiToken', $('apiToken').value)
      await saveValue('commentCount', $('commentCount').value)
      status.textContent = '已保存'
    })

    $('clear').addEventListener('click', async () => {
      $('apiToken').value = ''
      await window.iturn.config.remove('apiToken')
      status.textContent = '已清除密钥'
    })
  </script>
</body>
</html>`

  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

function contentText(json: any): string {
  return str(
    json?.content ??
      json?.data?.content ??
      json?.data?.chapter?.content ??
      json?.chapter?.content ??
      json?.result?.content ??
      '',
  )
}

function contentTitle(json: any, fallback?: string): string {
  return str(
    json?.title ??
      json?.data?.title ??
      json?.data?.chapter?.title ??
      json?.chapter?.title ??
      json?.result?.title ??
      fallback ??
      '',
  )
}

const module: SourceModule = {
  async search(ctx: SearchContext) {
    const pageSize = ctx.args.pageSize || 10
    const offset = (ctx.args.page - 1) * pageSize
    const url = apiUrl(ctx, '/api/search', {
      query: ctx.args.keyword,
      page: offset,
      tab_type: 3,
    })

    const json: any = await fetchJson(url, { headers: headers(ctx) })
    const raw = flattenSearchTabs(json?.search_tabs ?? json?.data?.search_tabs ?? json?.data ?? json)
    const books = raw.map((x) => toBook(ctx, x))

    return {
      books,
      page: ctx.args.page,
      hasMore: books.length > 0,
    }
  },

  async explore(ctx: ExploreContext) {
    if (!ctx.args.sectionId) {
      return {
        items: rootCategories(['玄幻', '都市', '历史', '科幻', '悬疑', '系统', '重生', '穿越', '喜欢我不早说，得亏我重生了']),
      }
    }

    const out = await module.search!({
      ...ctx,
      args: {
        keyword: str(ctx.args.payload?.category || ctx.args.sectionId || '玄幻'),
        page: ctx.args.page,
        pageSize: ctx.args.pageSize || 10,
      },
    } as any)

    return {
      items: out.books.map((book) => ({ type: 'book' as const, book })),
      page: out.page,
      hasMore: out.hasMore,
    }
  },

  async bookInfo(ctx: any): Promise<BookInfo> {
    return bookInfoFromDetail(ctx, ctx.args.book)
  },

  async toc(ctx: TocContext) {
    const book = ctx.args.book as BookInfo
    const bookId = bookIdFromBook(book)
    if (!bookId) throw new Error(`Missing xi fanqie book_id: ${book.tocUrl || book.bookUrl || book.name || ''}`)

    const tocUrl = apiUrl(ctx, '/api/directory', { book_id: bookId })
    const json: any = await fetchJson(tocUrl, { headers: headers(ctx) })
    const chaptersRaw = flattenChapters(json?.data?.chapterListWithVolume ?? json?.data ?? json)

    const chapters = chaptersRaw.map((x: any, i: number) => {
      const itemId = str(x?.itemId || x?.item_id || x?.chapterId || x?.chapter_id)
      const volumeName = str(x?.volume_name || x?.volumeName)
      const time = formatTimestamp(x?.firstPassTime ?? x?.first_pass_time, true)
      const updateTime = compactLines([
        [volumeName, time].filter(Boolean).join(' | '),
      ])

      return chapterFromItem(ctx.source.id, x, i, {
        id: itemId,
        name: str(x?.title).replace('版权信息页', ''),
        chapterUrl: JSON.stringify({
          url: apiUrl(ctx, '/api/content', {
            book_id: bookId,
            item_id: itemId,
            from: 'ycoo',
          }),
          book_id: bookId,
          item_id: itemId,
          title: x?.title,
          volume_name: volumeName,
        }),
        updateTime,
        volumeName,
        wordCount: wordCount(x),
        extra: x,
      })
    })

    return { chapters }
  },

  async content(ctx: ContentContext) {
    const chapter = ctx.args.chapter
    const info = tryParseJson(chapter.chapterUrl)
    const url =
      str(info?.url) ||
      apiUrl(ctx, '/api/content', {
        book_id: str(info?.book_id || bookIdFromBook((ctx.args as any).book)),
        item_id: str(info?.item_id || info?.itemId || chapterIdFromValue(chapter.chapterUrl)),
        from: 'ycoo',
      })

    const json: any = await fetchJson(url, { headers: headers(ctx) })
    const content = contentText(json)
    const title = contentTitle(json, str(info?.title || chapter.name))

    if (!content) {
      throw new Error(`xi fanqie content is empty: ${url}`)
    }

    return makeContent(ctx, title, content)
  },

  async login(ctx: any) {
    await ctx.browser.open({ url: KEY_URL, title: 'xi 番茄密钥获取', waitForClose: true })
    const status = await module.checkLogin!(ctx)
    return { success: status.loggedIn, message: status.message }
  },

  async checkLogin(ctx: any) {
    const apiToken = token(ctx)
    if (!apiToken) {
      return { loggedIn: false, message: '未填写密钥。正文接口需要 X-Api-Token。' }
    }

    try {
      const json: any = await fetchJson(apiUrl(ctx, '/ping'), { headers: headers(ctx) })
      const ok = str(json?.msg).toLowerCase() === 'pong' || str(json?.code) === '0' || !!json
      return { loggedIn: true, message: ok ? '已填写密钥，服务器可访问' : '已填写密钥' }
    } catch {
      return { loggedIn: true, message: '已填写密钥，但服务器检测失败' }
    }
  },

  async settingsPage(ctx: SettingsPageContext): Promise<SourceActionResult> {
    const result = await ctx.browser.open({
      url: settingsPageHTML(ctx),
      title: 'xi 番茄设置',
      waitForClose: true,
    })

    const config = (result.data as any)?.config || {}
    for (const [key, value] of Object.entries(config)) {
      if (value === null || value === '') await ctx.config.remove(key)
      else await ctx.config.set(key, value)
    }

    const status = await module.checkLogin!(ctx)
    return { success: true, loggedIn: status.loggedIn, message: status.message }
  },
}

const source: SourceManifest = {
  ...manifest,
  module,
}

export default source
