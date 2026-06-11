import type { BookInfo, ContentContext, SearchContext, SourceManifest, TocContext } from '@source/sdk'
import { asArray, bookFromItem, chapterFromItem, fetchJson, joinUrl, makeContent, manifestBase, SOURCE_SETTINGS_COMMON, str, withQuery } from './_common.ts'

const BASE = 'http://fanqie1.xi520.top:40181'
export const manifest: SourceManifest = manifestBase({
  id: 'legado.6.xi.fanqie',
  name: 'xi~番茄 v3.0.0（迁移版）',
  version: '0.2.0',
  type: 'novel',
  groups: ['Legado', '番茄', 'xi'],
  baseUrl: BASE,
  entry: 'xiFanqie.ts',
  exports: { search: 'search', bookInfo: 'bookInfo', toc: 'toc', content: 'content', checkLogin: 'checkLogin' },
  permissions: { network: { domains: ['fanqie1.xi520.top', 'changdunovel.com'] }, storage: true, secret: true, browser: true },
  settings: [{ key: 'apiToken', title: '密钥 / X-Api-Token', type: 'token' }, ...SOURCE_SETTINGS_COMMON],
  limits: { timeoutMs: 180000, concurrent: 4 },
})
function headers(ctx: any): HeadersInit { const token = str(ctx.source.settings.apiToken); return token ? { 'X-Api-Token': token } : {} }
function toBook(ctx: any, item: any) {
  const id = str(item?.book_id || item?.bookId)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: withQuery(joinUrl(BASE, '/api/detail'), { book_id: id }), name: item?.original_book_name || item?.book_name, author: item?.author, cover: item?.thumb_url, intro: item?.abstract })
}
export async function search(ctx: SearchContext) {
  const json: any = await fetchJson(withQuery(joinUrl(BASE, '/api/search'), { query: ctx.args.keyword, page: (ctx.args.page - 1) * 10, tab_type: 3 }), { headers: headers(ctx) })
  const raw = asArray(json?.search_tabs).flatMap((x) => Array.isArray(x) ? x : [x])
  const books = raw.map((x) => toBook(ctx, x))
  return { books, page: ctx.args.page, hasMore: books.length > 0 }
}
export async function bookInfo(ctx: any): Promise<BookInfo> {
  const json: any = await fetchJson(ctx.args.book.bookUrl, { headers: headers(ctx) })
  const d = json?.data || json
  return { ...ctx.args.book, id: str(d?.book_id || ctx.args.book.id), name: str(d?.book_name || ctx.args.book.name), author: str(d?.author || ctx.args.book.author) || undefined, cover: str(d?.thumb_url || ctx.args.book.cover) || undefined, intro: str(d?.abstract || ctx.args.book.intro) || undefined, kind: [str(d?.category), str(d?.score)].filter(Boolean), wordCount: Number(d?.word_number) || ctx.args.book.wordCount, lastChapterName: str(d?.last_chapter_title || ctx.args.book.lastChapterName), tocUrl: withQuery(joinUrl(BASE, '/api/directory'), { book_id: d?.book_id || ctx.args.book.id }), extra: d }
}
export async function toc(ctx: TocContext) {
  const json: any = await fetchJson(str((ctx.args.book as BookInfo).tocUrl), { headers: headers(ctx) })
  const groups = json?.data?.chapterListWithVolume || []
  const flat = asArray(groups).flatMap((x) => Array.isArray(x) ? x : asArray(x?.chapters || x?.chapterList || x))
  const bid = ctx.args.book.id
  const chapters = flat.map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.itemId || x?.item_id, name: x?.title, chapterUrl: withQuery(joinUrl(BASE, '/api/content'), { book_id: bid, item_id: x?.itemId || x?.item_id, from: 'ycoo' }), updateTime: x?.firstPassTime, volumeName: x?.volume_name }))
  return { chapters }
}
export async function content(ctx: ContentContext) {
  const json: any = await fetchJson(ctx.args.chapter.chapterUrl, { headers: headers(ctx) })
  return makeContent(ctx, str(json?.title || ctx.args.chapter.name), str(json?.content || json?.data?.content || ''))
}
export async function checkLogin(ctx: any) { return { loggedIn: !!str(ctx.source.settings.apiToken), message: str(ctx.source.settings.apiToken) ? '已填写密钥' : '未填写密钥，部分接口可能失败' } }
