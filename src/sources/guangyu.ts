import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext } from '@source/sdk'
import { bookFromItem, chapterFromItem, fetchJson, joinUrl, makeContent, manifestBase, postJson, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from './_common.ts'

const HOSTS = ['https://v1.gyks.cf', 'https://v2.gyks.cf', 'https://v3.gyks.cf', 'https://v4.gyks.cf', 'https://v5.gyks.cf', 'https://v6.gyks.cf', 'https://v7.gyks.cf', 'http://101.35.133.34:8888']
export const manifest: SourceManifest = manifestBase({
  id: 'legado.3.guangyu.aggregate',
  name: '🔅光遇聚合（迁移版）',
  version: '0.2.0',
  type: 'mixed',
  groups: ['Legado', '聚合', '番茄', '七猫', '书旗'],
  baseUrl: HOSTS[0],
  entry: 'guangyu.ts',
  exports: { explore: 'explore', search: 'search', bookInfo: 'bookInfo', toc: 'toc', content: 'content', login: 'login', checkLogin: 'checkLogin' },
  permissions: { network: { domains: ['*.gyks.cf', '101.35.133.34', 'fanqienovel.com'] }, cookie: { domains: ['fanqienovel.com'] }, storage: true, secret: true, browser: true },
  settings: [
    { key: 'line', title: '线路', type: 'select', defaultValue: HOSTS[0], options: HOSTS.map((x) => ({ title: x, value: x })) },
    { key: 'tab', title: '类型', type: 'select', defaultValue: '小说', options: ['小说', '听书', '漫画', '短剧'].map((x) => ({ title: x, value: x })) },
    { key: 'source', title: '平台', type: 'text', defaultValue: '全部' },
    ...SOURCE_SETTINGS_COMMON,
  ],
  limits: { timeoutMs: 180000, concurrent: 4 },
})
function api(ctx: any) { return str(ctx.source.settings.line || HOSTS[0]).replace(/\/+$/, '') }
function tab(ctx: any) { return str(ctx.source.settings.tab || '小说') }
function sourceKey(ctx: any) { return str(ctx.source.settings.source || '全部') }
function toBook(ctx: any, item: any) {
  const opaque = { book_id: item?.book_id, sources: item?.source, source: item?.source, tab: item?.tab || tab(ctx), url: item?.toc_url || '', book_name: item?.book_name, author: item?.author, abstract: item?.abstract, thumb_url: item?.thumb_url }
  return bookFromItem(ctx.source.id, item, { id: `${opaque.sources || 'unknown'}:${opaque.book_id}`, bookUrl: JSON.stringify(opaque), name: item?.book_name, author: item?.author, cover: item?.thumb_url, intro: item?.abstract, kind: [item?.status, item?.score, item?.tags, item?.source], wordCount: item?.word_number, lastChapterName: item?.last_chapter_title, extra: item })
}
export async function search(ctx: SearchContext) {
  const { keyword, page } = ctx.args
  const json: any = await fetchJson(withQuery(joinUrl(api(ctx), '/search'), { title: keyword, tab: tab(ctx), source: sourceKey(ctx), page, disabled_sources: 0 }))
  const books = (json?.data || []).map((x: any) => toBook(ctx, x))
  return { books, page, hasMore: books.length > 0 }
}
export async function explore(ctx: ExploreContext) {
  const { sectionId, payload, page } = ctx.args
  if (!sectionId) return { items: rootCategories(['番茄', '七猫', '书旗', 'QQ阅读', '塔读', '玄幻', '都市', '历史', '漫画', '听书']) }
  const out = await search({ ...ctx, args: { keyword: str(payload?.category), page } } as any)
  return { items: out.books.map((book) => ({ type: 'book' as const, book })), page, hasMore: out.hasMore }
}
export async function bookInfo(ctx: any): Promise<BookInfo> {
  const book = ctx.args.book
  const data = JSON.parse(book.bookUrl)
  return { ...book, tocUrl: book.bookUrl, extra: { ...book.extra, ...data } }
}
export async function toc(ctx: TocContext) {
  const data = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
  const variable = JSON.stringify({ custom: '' })
  const json: any = await postJson(withQuery(joinUrl(api(ctx), '/catalog'), { book_id: data.book_id, source: data.sources || data.source, tab: data.tab || tab(ctx), variable }), { html: '' })
  const chapters = (json?.data || []).map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.item_id, name: x?.title, chapterUrl: JSON.stringify({ book_id: data.book_id, item_id: x?.item_id, title: x?.title, sources: x?.source || data.sources || data.source, tab: data.tab || tab(ctx), url: x?.toc_url || '' }), updateTime: x?.first_pass_time, extra: x }))
  return { chapters }
}
export async function content(ctx: ContentContext) {
  const info = JSON.parse(ctx.args.chapter.chapterUrl)
  const json: any = await postJson(joinUrl(api(ctx), '/content'), { html: '', item_id: info.item_id, source: info.sources, tab: info.tab, tone_id: '4', variable: JSON.stringify({ custom: '' }), version: '26.6.9' })
  return makeContent(ctx, info.title || ctx.args.chapter.name, str(json?.content || json?.data?.content || ''))
}
export async function login(ctx: any) { await ctx.browser.open({ url: 'https://fanqienovel.com/', title: '番茄登录', waitForClose: true }); return checkLogin(ctx) }
export async function checkLogin(ctx: any) { const s = await ctx.cookie.get('fanqienovel.com', 'sessionid'); return { loggedIn: !!s, message: s ? '已发现番茄 sessionid' : '未登录' } }
