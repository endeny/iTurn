import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext } from '@source/sdk'
import { bookFromItem, chapterFromItem, fetchJson, joinUrl, makeContent, manifestBase, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from './_common.ts'

const API = 'https://fq.vv9v.cn'
const TYPES: Record<string, string> = { 小说: 'novel', 出版: 'novel', 短篇: 'novel', 听书: 'audio', 听小说: 'novel', 漫画: 'comic', 短剧: 'video' }
export const manifest: SourceManifest = manifestBase({
  id: 'legado.4.fanqie.zhiqiu4in1',
  name: '✿番茄四合一（知秋段评）迁移版✿',
  version: '0.2.0',
  type: 'mixed',
  groups: ['Legado', '番茄', '四合一'],
  baseUrl: API,
  entry: 'fanqieFourInOne.ts',
  exports: { explore: 'explore', search: 'search', bookInfo: 'bookInfo', toc: 'toc', content: 'content', checkLogin: 'checkLogin' },
  permissions: { network: { domains: ['fq.vv9v.cn', 'changdunovel.com'] }, cookie: { domains: ['fq.vv9v.cn', 'changdunovel.com'] }, storage: true, secret: true, browser: true },
  settings: [
    { key: 'sourceToken', title: 'x-sec-token / 书源变量', type: 'token' },
    { key: 'androidId', title: 'x-android-id', type: 'text' },
    { key: 'type', title: '搜索类型', type: 'select', defaultValue: '小说', options: Object.keys(TYPES).map((x) => ({ title: x, value: x })) },
    ...SOURCE_SETTINGS_COMMON,
  ],
  limits: { timeoutMs: 180000, concurrent: 4 },
})
function sourceType(ctx: any, keyword?: string) {
  let type = str(ctx.source.settings.type || '小说')
  if (keyword && /^[nNcCaAvV]/.test(keyword)) {
    const m = keyword[0].toLowerCase()
    if (m === 'n') type = '小说'
    if (m === 'c') type = '漫画'
    if (m === 'a') type = '听书'
    if (m === 'v') type = '短剧'
  }
  return TYPES[type] || 'novel'
}
function headers(ctx: any): HeadersInit {
  return { 'x-sec-token': str(ctx.source.settings.sourceToken), 'x-android-id': str(ctx.source.settings.androidId || 'source-runtime-lab') }
}
function toBook(ctx: any, item: any, type = sourceType(ctx)) {
  const id = str(item?.bid || item?.book_id || item?.bookId || item?.id)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: JSON.stringify({ type, id }), name: item?.book_name || item?.title || item?.name, author: item?.author, cover: item?.thumb_url || item?.cover || item?.thumbUri, intro: item?.abstract || item?.intro, kind: [item?.category, item?.tags], wordCount: item?.word_number, lastChapterName: item?.last_chapter_title })
}
export async function search(ctx: SearchContext) {
  let keyword = ctx.args.keyword
  const type = sourceType(ctx, keyword)
  if (/^[nNcCaAvV]/.test(keyword)) keyword = keyword.slice(1)
  const json: any = await fetchJson(withQuery(joinUrl(API, `/${type}/search`), { keyword, page: ctx.args.page }), { headers: headers(ctx) })
  const books = (json?.data?.list || json?.data || json?.list || []).map((x: any) => toBook(ctx, x, type))
  return { books, page: ctx.args.page, hasMore: books.length > 0 }
}
export async function explore(ctx: ExploreContext) {
  if (!ctx.args.sectionId) return { items: rootCategories(['小说', '漫画', '听书', '短剧'], 'type') }
  const fake = { ...ctx, source: { ...ctx.source, settings: { ...ctx.source.settings, type: str(ctx.args.payload?.category || '小说') } }, args: { keyword: str(ctx.args.payload?.category || '热门'), page: ctx.args.page } } as any
  const out = await search(fake)
  return { items: out.books.map((book) => ({ type: 'book' as const, book })), page: out.page, hasMore: out.hasMore }
}
export async function bookInfo(ctx: any): Promise<BookInfo> {
  const { type, id } = JSON.parse(ctx.args.book.bookUrl)
  const json: any = await fetchJson(withQuery(joinUrl(API, `/${type}/detail`), { bid: id, book_id: id }), { headers: headers(ctx) })
  const d = json?.data || json
  return { ...toBook(ctx, d, type), tocUrl: JSON.stringify({ type, id }), extra: d }
}
export async function toc(ctx: TocContext) {
  const { type, id } = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
  const json: any = await fetchJson(withQuery(joinUrl(API, `/${type}/catalog`), { bid: id, book_id: id }), { headers: headers(ctx) })
  const list = json?.data?.list || json?.data?.chapters || json?.data || []
  const chapters = list.map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.cid || x?.chapter_id || x?.item_id || x?.id, name: x?.title || x?.chapter_title, chapterUrl: JSON.stringify({ type, bid: id, cid: x?.cid || x?.chapter_id || x?.item_id || x?.id, title: x?.title }), updateTime: x?.first_pass_time }))
  return { chapters }
}
export async function content(ctx: ContentContext) {
  const info = JSON.parse(ctx.args.chapter.chapterUrl)
  const json: any = await fetchJson(withQuery(joinUrl(API, `/${info.type}/content`), { bid: info.bid, book_id: info.bid, cid: info.cid, chapter_id: info.cid, item_id: info.cid }), { headers: headers(ctx) })
  return makeContent(ctx, info.title || ctx.args.chapter.name, str(json?.data?.content || json?.content || json?.data || ''))
}
export async function checkLogin(ctx: any) { return { loggedIn: !!str(ctx.source.settings.sourceToken), message: str(ctx.source.settings.sourceToken) ? '已填写 token' : '未填写 token' } }
