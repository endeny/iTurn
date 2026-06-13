import type { BookInfo, BookRef, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext, SourceModule } from '@source/sdk'
import { bookFromItem, chapterFromItem, fetchJson, joinUrl, makeContent, manifestBase, openSettingsPage, postJson, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from '../helpers/common.ts'

const HOSTS = ['https://v1.gyks.cf', 'https://v2.gyks.cf', 'https://v3.gyks.cf', 'https://v4.gyks.cf', 'https://v5.gyks.cf', 'https://v6.gyks.cf', 'https://v7.gyks.cf', 'http://101.35.133.34:8888']
const manifest = manifestBase({
  id: 'legado.3.guangyu.aggregate',
  name: '🔅光遇聚合（迁移版）',
  version: '0.2.0',
  icon: 'https://v1.gyks.cf/static/favicon.png',
  type: 'mixed',
  groups: ['Legado', '聚合', '番茄', '七猫', '书旗'],
  baseUrl: HOSTS[0],
  entry: 'guangyu.ts',
  permissions: { network: { domains: ['*.gyks.cf', '101.35.133.34', 'fanqienovel.com'] }, cookie: { domains: ['*.gyks.cf', '101.35.133.34', 'fanqienovel.com'] }, storage: true, secret: true, browser: true },
  settings: [
    { key: 'line', title: '线路', type: 'select', defaultValue: HOSTS[0], options: HOSTS.map((x) => ({ title: x, value: x })) },
    { key: 'tab', title: '类型', type: 'select', defaultValue: '小说', options: ['小说', '听书', '漫画', '短剧'].map((x) => ({ title: x, value: x })) },
    { key: 'source', title: '平台', type: 'text', defaultValue: '全部' },
    { key: 'accessKey', title: '光遇密钥 / key', type: 'token' },
    ...SOURCE_SETTINGS_COMMON,
  ],
  settingsPage: { title: '光遇聚合设置' },
  login: { methods: [{ type: 'browser', id: 'guangyu', title: '晴天聚合网页登录', url: `${HOSTS[0]}/login`, cookieDomains: ['*.gyks.cf'] }], checkOnStartup: false },
  limits: { timeoutMs: 180000, concurrent: 4 },
})
function api(ctx: any) { return str(ctx.source.settings.line || HOSTS[0]).replace(/\/+$/, '') }
function tab(ctx: any) { return str(ctx.source.settings.tab || '小说') }
function sourceKey(ctx: any) { return str(ctx.source.settings.source || '全部') }
function statusOf(value: unknown): BookRef['status'] {
  const text = str(value)
  if (/完结|已完|completed/i.test(text)) return 'completed'
  if (/连载|ongoing|更新/i.test(text)) return 'ongoing'
  if (/暂停|paused/i.test(text)) return 'paused'
  if (/下架|removed/i.test(text)) return 'removed'
  return undefined
}
function toBook(ctx: any, item: any) {
  const opaque = { book_id: item?.book_id, sources: item?.source, source: item?.source, tab: item?.tab || tab(ctx), url: item?.toc_url || '', detail_url: item?.detail_url || '', book_name: item?.book_name, author: item?.author, abstract: item?.abstract, thumb_url: item?.thumb_url }
  return bookFromItem(ctx.source.id, item, { id: `${opaque.sources || 'unknown'}:${opaque.book_id}`, bookUrl: JSON.stringify(opaque), name: item?.book_name, author: item?.author, cover: item?.thumb_url, intro: item?.abstract, kind: [item?.category, item?.tags], status: statusOf(item?.status), wordCount: item?.word_number, lastChapterName: item?.last_chapter_title, extra: item })
}
async function cookieHeader(ctx: any, domain: string) {
  const cookies = await ctx.cookie.getAll(domain)
  return (cookies || []).map((cookie: any) => `${cookie.name}=${cookie.value}`).join('; ')
}
function hostname(input: string) {
  try { return new URL(input).hostname } catch { return input }
}
async function fanqieReaderHTML(ctx: any, itemId: string) {
  if (!itemId) return ''
  const cookie = await cookieHeader(ctx, 'fanqienovel.com')
  const headers: HeadersInit = {
    'user-agent': 'Mozilla/5.0',
    referer: 'https://fanqienovel.com/',
  }
  if (cookie) headers.cookie = cookie
  const response = await fetch(`https://fanqienovel.com/reader/${itemId}`, { headers })
  return response.ok ? response.text() : ''
}
const module: SourceModule = {
  async search(ctx: SearchContext) {
    const { keyword, page } = ctx.args
    const pageSize = ctx.args.pageSize || 32
    const json: any = await fetchJson(withQuery(joinUrl(api(ctx), '/search'), { title: keyword, tab: tab(ctx), source: sourceKey(ctx), page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize, disabled_sources: 0 }))
    const books = (json?.data || []).map((x: any) => toBook(ctx, x))
    return { books, page, hasMore: books.length > 0 }
  },
  async explore(ctx: ExploreContext) {
    const { sectionId, payload, page } = ctx.args
    if (!sectionId) return { items: rootCategories(['番茄', '七猫', '书旗', 'QQ阅读', '塔读', '玄幻', '都市', '历史', '漫画', '听书']) }
    const out = await module.search!({ ...ctx, args: { keyword: str(payload?.category), page, pageSize: ctx.args.pageSize } } as any)
    return { items: out.books.map((book: any) => ({ type: 'book' as const, book })), page, hasMore: out.hasMore }
  },
  async bookInfo(ctx: any): Promise<BookInfo> {
    const book = ctx.args.book
    const data = JSON.parse(book.bookUrl)
    return { ...book, tocUrl: book.bookUrl, extra: { ...book.extra, ...data } }
  },
  async toc(ctx: TocContext) {
    const data = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
    const variable = JSON.stringify({ custom: '' })
    const json: any = await postJson(withQuery(joinUrl(api(ctx), '/catalog'), { book_id: data.book_id, source: data.sources || data.source, tab: data.tab || tab(ctx), variable }), { html: '' })
    const chapters = (json?.data || []).map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.item_id, name: x?.title, chapterUrl: JSON.stringify({ book_id: data.book_id, item_id: x?.item_id, title: x?.title, sources: x?.source || data.sources || data.source, tab: data.tab || tab(ctx), url: x?.toc_url || '', content_url: x?.content_url || '' }), updateTime: x?.first_pass_time, wordCount: x?.chapter_word_number, extra: x }))
    return { chapters }
  },
  async content(ctx: ContentContext) {
    const info = JSON.parse(ctx.args.chapter.chapterUrl)

    const qttoken = str(ctx.source.settings.accessKey)
    const backendCookie = await cookieHeader(ctx, hostname(api(ctx)))

    const cookie = backendCookie || (qttoken ? `qttoken=${qttoken};deviceId=iturn;` : '')

    const headers: HeadersInit = {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    }

    const source = str(info.sources || info.source)
    const tabName = str(info.tab || tab(ctx))
    const itemId = str(info.item_id)

    const html =
      source === '番茄'
        ? await fanqieReaderHTML(ctx, itemId)
        : ''

    const hasReview =
      ['番茄', '七猫', '塔读', 'QQ阅读', 'svip_QQ阅读'].includes(source) &&
      tabName === '小说'

    const url = joinUrl(api(ctx), hasReview ? '/content?review=1' : '/content')

    const json: any = await postJson(
      url,
      {
        html,
        item_id: itemId,
        source,
        tab: tabName,
        tone_id: '4',
        variable: JSON.stringify({ custom: '' }),
        version: '26.6.9',
      },
      { headers },
    )

    return makeContent(
      ctx,
      info.title || ctx.args.chapter.name,
      str(json?.content || json?.data?.content || ''),
    )
  },
  async login(ctx: any) {
    await ctx.browser.open({ url: joinUrl(api(ctx), '/login'), title: '晴天聚合登录', waitForClose: true })
    const status = await module.checkLogin!(ctx)
    return { success: status.loggedIn, message: status.message }
  },
  async checkLogin(ctx: any) {
    const token = await ctx.cookie.get(hostname(api(ctx)), 'qttoken')
    const fanqie = await ctx.cookie.get('fanqienovel.com', 'sessionid')
    const key = str(ctx.source.settings.accessKey)
    return { loggedIn: !!(token || fanqie || key), message: token ? '已登录晴天聚合' : fanqie ? '已发现番茄 sessionid' : key ? '已填写光遇密钥' : '未登录' }
  },
  async settingsPage(ctx) {
    await openSettingsPage(ctx, manifest, {
      links: [{ title: '打开用户中心', url: joinUrl(api(ctx), '/user'), secondary: true }],
    })
    const status = await module.checkLogin!(ctx)
    return { success: true, loggedIn: status.loggedIn, message: status.message }
  },
}

const source: SourceManifest = {
  ...manifest,
  module,
}

export default source
