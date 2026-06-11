import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext } from '@source/sdk'
import { bookFromItem, chapterFromItem, collectArraysByKey, fetchJson, joinUrl, makeContent, manifestBase, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from './_common.ts'

const CONTENT_HOSTS = ['https://gofq.52dns.cc', 'https://pyfq.52dns.cc', 'https://fqxs.ns114.cc']
const BASE = 'https://fqgo.52dns.cc'

export const manifest: SourceManifest = manifestBase({
  id: 'legado.2.fanqie.fqgo',
  name: '番茄小说（fqgo 迁移版）',
  version: '0.2.0',
  type: 'novel',
  groups: ['Legado', '番茄', '本地版'],
  baseUrl: BASE,
  entry: 'fanqieFqgo.ts',
  exports: { explore: 'explore', search: 'search', bookInfo: 'bookInfo', toc: 'toc', content: 'content', login: 'login', logout: 'logout', checkLogin: 'checkLogin' },
  permissions: { network: { domains: ['fqgo.52dns.cc', 'gofq.52dns.cc', 'pyfq.52dns.cc', 'fqxs.ns114.cc', 'fanqienovel.com', '*.snssdk.com', '*.toutiaoapi.com', '*.fqnovel.com'] }, cookie: { domains: ['fanqienovel.com', 'snssdk.com'] }, storage: true, secret: true, browser: true },
  settings: [
    { key: 'manualToken', title: '手动登录 Token/sessionid', type: 'token' },
    { key: 'contentHost', title: '正文线路', type: 'select', defaultValue: CONTENT_HOSTS[0], options: CONTENT_HOSTS.map((x) => ({ title: x, value: x })) },
    ...SOURCE_SETTINGS_COMMON,
  ],
  login: { methods: [{ type: 'browser', id: 'fanqie', title: '番茄网页登录', url: 'https://fanqienovel.com/', cookieDomains: ['fanqienovel.com'] }], checkOnStartup: false },
  limits: { timeoutMs: 180000, concurrent: 4 },
  match: { bookUrl: 'https?://.*(fqnovel|snssdk|fanqienovel|changdunovel)\\.com/.*[0-9]{19}.*' },
})

function replaceCover(u: unknown): string | undefined {
  let s = str(u)
  if (!s) return undefined
  s = s.replace(/^https?:\/\//, '')
  const parts = s.split('/')
  parts[0] = 'https://p6-novel.byteimg.com/origin'
  return parts.map((x, i) => i === 0 ? x : x.split(/[~?]/)[0]).join('/')
}
function statusOf(x: any) { return x?.creation_status === 1 || x?.creation_status === '1' ? 'completed' : 'ongoing' }
function detailUrl(id: string) { return withQuery(`${BASE}/detail`, { book_id: id }) }
function toBook(ctx: SearchContext | ExploreContext, item: any) {
  const id = str(item?.book_id || item?.book_id_str || item?.bookId)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: detailUrl(id), name: item?.book_name || item?.title, author: item?.author, cover: replaceCover(item?.thumb_url), intro: item?.abstract, kind: [item?.category, item?.tags, item?.score], wordCount: item?.word_number, lastChapterName: item?.last_chapter_title, status: statusOf(item) as any })
}

export async function search(ctx: SearchContext) {
  const { keyword, page } = ctx.args
  const json: any = await fetchJson(withQuery(`${BASE}/search`, { key: keyword, page }))
  const raw = collectArraysByKey(json, 'book_data')
  const books = raw.map((x) => toBook(ctx, x))
  return { books, page, hasMore: books.length > 0 }
}

const CATEGORIES = ['玄幻', '都市', '历史', '科幻', '悬疑', '系统', '重生', '穿越', '无敌', '种田', '萌宝', '游戏动漫']
export async function explore(ctx: ExploreContext) {
  const { sectionId, payload, page } = ctx.args
  if (!sectionId) return { items: rootCategories(CATEGORIES) }
  // The original source builds many tsearch URLs. This migration keeps discover testable via fqgo search fallback.
  const out = await search({ ...ctx, args: { keyword: str(payload?.category || '玄幻'), page } } as any)
  return { items: out.books.map((book) => ({ type: 'book' as const, book })), page, hasMore: out.hasMore }
}

export async function bookInfo(ctx: any): Promise<BookInfo> {
  const book = ctx.args.book
  const json: any = await fetchJson(book.bookUrl)
  const d = json?.data || json
  return { ...book, id: str(d?.book_id || book.id), name: str(d?.book_name || book.name), author: str(d?.author || book.author) || undefined, cover: replaceCover(d?.thumb_url) || book.cover, intro: str(d?.abstract || book.intro), kind: [str(d?.category), str(d?.score)].filter(Boolean), status: statusOf(d) as any, wordCount: Number(d?.word_number) || book.wordCount, lastChapterName: str(d?.last_chapter_title || book.lastChapterName), tocUrl: withQuery(`${BASE}/catalog`, { book_id: d?.book_id || book.id }), extra: d }
}

export async function toc(ctx: TocContext): Promise<any> {
  const json: any = await fetchJson(str((ctx.args.book as BookInfo).tocUrl || withQuery(`${BASE}/catalog`, { book_id: ctx.args.book.id })))
  const list = json?.data?.item_data_list || json?.data?.lists || []
  const contentHost = str(ctx.source.settings.contentHost || CONTENT_HOSTS[0])
  const chapters = list.map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.item_id, name: x?.title, chapterUrl: withQuery(joinUrl(contentHost, '/content'), { item_id: x?.item_id }), updateTime: x?.first_pass_time, wordCount: x?.chapter_word_number, volumeName: x?.volume_name }))
  return { chapters }
}

export async function content(ctx: ContentContext) {
  const json: any = await fetchJson(ctx.args.chapter.chapterUrl)
  return makeContent(ctx, ctx.args.chapter.name, str(json?.data?.content || json?.content || ''))
}

export async function login(ctx: any) {
  await ctx.browser.open({ url: 'https://fanqienovel.com/', title: '番茄登录', waitForClose: true })
  return checkLogin(ctx)
}
export async function logout(ctx: any) { await ctx.cookie.clear('fanqienovel.com'); await ctx.secret.remove('sessionid') }
export async function checkLogin(ctx: any) {
  const manual = str(ctx.source.settings.manualToken)
  const cookie = manual || await ctx.cookie.get('fanqienovel.com', 'sessionid')
  return { loggedIn: !!cookie, message: cookie ? '已发现 sessionid/手动 Token' : '未登录' }
}
