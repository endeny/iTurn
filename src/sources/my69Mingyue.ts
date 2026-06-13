import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext, SourceModule } from '@source/sdk'
import { bookFromItem, chapterFromItem, fetchJson, makeContent, manifestBase, openSettingsPage, rootCategories, SOURCE_SETTINGS_COMMON, str, stripHtml, withQuery } from '../helpers/common.ts'

const BACKEND = 'https://no.skybook.qzz.io'
const manifest = manifestBase({
  id: 'legado.8.my69.mingyue',
  name: '69-明月（迁移版）',
  version: '0.2.0',
  icon: 'https://www.google.com/s2/favicons?sz=64&domain=69shuba.com',
  type: 'novel',
  groups: ['Legado', '69', '明月', '起点'],
  baseUrl: BACKEND,
  entry: 'my69Mingyue.ts',
  permissions: { network: { domains: ['no.skybook.qzz.io', 'www.qidian.com'] }, cookie: { domains: ['www.qidian.com'] }, storage: true, secret: true, browser: true },
  settings: [...SOURCE_SETTINGS_COMMON],
  settingsPage: { title: '69 明月设置' },
  limits: { timeoutMs: 180000, concurrent: 4 },
})
function clean69(s: unknown): string { return stripHtml(s).replace(/新..书吧|吧书69新|\(本章完\)|loadAdv\(10,0\);/g, '').trim() }
function toBook(ctx: any, item: any) {
  const id = str(item?.articleid)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: JSON.stringify({ id }), name: item?.articlename, author: item?.author, cover: item?.imgUrl, intro: item?.intro, kind: [item?.keywords], wordCount: item?.words, lastChapterName: item?.lastchapter })
}
const module: SourceModule = {
  async search(ctx: SearchContext) {
    const pageSize = ctx.args.pageSize || 32
    const json: any = await fetchJson(withQuery(`${BACKEND}/69/search`, { key: ctx.args.keyword, page: ctx.args.page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize }))
    const books = (json?.list || []).map((x: any) => toBook(ctx, x))
    return { books, page: ctx.args.page, hasMore: books.length > 0 }
  },
  async explore(ctx: ExploreContext) {
    if (!ctx.args.sectionId) return { items: rootCategories(['玄幻', '都市', '历史', '科幻', '仙侠', '悬疑', '轻小说', '完本']) }
    const out = await module.search!({ ...ctx, args: { keyword: str(ctx.args.payload?.category || '玄幻'), page: ctx.args.page, pageSize: ctx.args.pageSize } } as any)
    return { items: out.books.map((book: any) => ({ type: 'book' as const, book })), page: out.page, hasMore: out.hasMore }
  },
  async bookInfo(ctx: any): Promise<BookInfo> {
    // Original source supplements detail through qidian HTML if intro/cover missing. Kept as non-blocking fallback.
    return { ...ctx.args.book, tocUrl: ctx.args.book.bookUrl }
  },
  async toc(ctx: TocContext) {
    const { id } = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
    const json: any = await fetchJson(withQuery(`${BACKEND}/69/catalog`, { book_id: id }))
    const chapters = (json?.list || []).map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: `${x?.articleid}/${x?.chapterid}`, name: x?.chaptername, chapterUrl: JSON.stringify({ bid: x?.articleid || id, cid: x?.chapterid }) }))
    return { chapters }
  },
  async content(ctx: ContentContext) {
    const { bid, cid } = JSON.parse(ctx.args.chapter.chapterUrl)
    const json: any = await fetchJson(withQuery(`${BACKEND}/69/content`, { book_id: bid, chapter_id: cid }))
    return makeContent(ctx, ctx.args.chapter.name, clean69(json?.data || json?.content || ''))
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
