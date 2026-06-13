import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext, SourceModule } from '@source/sdk'
import { baseUrl, bookFromItem, chapterFromItem, fetchJson, joinUrl, makeContent, manifestBase, openSettingsPage, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from '../helpers/common.ts'

const manifest = manifestBase({
  id: 'legado.1.shuqi.jh52dns',
  name: '书旗小说（JH 迁移版）',
  version: '0.2.0',
  icon: 'https://www.shuqi.com/favicon.ico',
  type: 'novel',
  groups: ['Legado', '书旗', 'JH'],
  baseUrl: 'https://jh.52dns.cc',
  entry: 'shuqiJh.ts',
  permissions: { network: { domains: ['jh.52dns.cc', '*.52dns.cc'] }, cookie: { domains: ['jh.52dns.cc', '*.52dns.cc'] }, storage: true, secret: true, browser: true },
  settings: [{ key: 'customDomain', title: '自定义域名', type: 'text' }, ...SOURCE_SETTINGS_COMMON],
  settingsPage: { title: '书旗 JH 设置' },
  limits: { timeoutMs: 180000, concurrent: 4 },
})

const CATEGORIES = ['玄幻', '都市', '武侠', '仙侠', '军事', '历史', '游戏', '科幻', '言情', '悬疑', '灵异', '竞技', '同人']
function api(ctx: any) { return baseUrl(ctx, 'https://jh.52dns.cc') }
function toBook(ctx: SearchContext | ExploreContext, item: any) { return bookFromItem(ctx.source.id, item, { id: item?.url, name: item?.name, author: item?.author, bookUrl: item?.url, cover: item?.src, intro: item?.intro, kind: [item?.mmfl] }) }

const module: SourceModule = {
  async search(ctx: SearchContext) {
    const { keyword, page } = ctx.args
    const pageSize = ctx.args.pageSize || 32
    const json: any = await fetchJson(withQuery(joinUrl(api(ctx), '/shuqi/search.php'), { wd: keyword, page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize }))
    const books = (json?.data?.books || []).map((x: any) => toBook(ctx, x))
    return { books, page, hasMore: books.length > 0 }
  },
  async explore(ctx: ExploreContext) {
    const { page, sectionId, payload } = ctx.args
    if (!sectionId) return { items: rootCategories(CATEGORIES) }
    const pageSize = ctx.args.pageSize || 32
    const json: any = await fetchJson(withQuery(joinUrl(api(ctx), '/shuqi/sqfx.php'), { fl: str(payload?.category || '玄幻'), page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize }))
    const items = (json?.data?.books || []).map((x: any) => ({ type: 'book' as const, book: toBook(ctx, x) }))
    return { items, page, hasMore: items.length > 0 }
  },
  async bookInfo(ctx: any): Promise<BookInfo> {
    return { ...ctx.args.book, tocUrl: ctx.args.book.bookUrl }
  },
  async toc(ctx: TocContext) {
    const book = ctx.args.book as BookInfo
    const json: any = await fetchJson(str(book.tocUrl || book.bookUrl))
    return { chapters: (json?.data?.lists || []).map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.url, name: x?.title, chapterUrl: x?.url })) }
  },
  async content(ctx: ContentContext) {
    const key = await ctx.cookie.get(api(ctx), 'qdkey')
    const json: any = await fetchJson(key ? withQuery(ctx.args.chapter.chapterUrl, { key }) : ctx.args.chapter.chapterUrl)
    return makeContent(ctx, ctx.args.chapter.name, str(json?.data?.content))
  },
  async checkLogin(ctx: any) {
    const key = await ctx.cookie.get(api(ctx), 'qdkey')
    return { loggedIn: !!key, message: key ? '已读取 qdkey Cookie' : '未发现 qdkey Cookie' }
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
