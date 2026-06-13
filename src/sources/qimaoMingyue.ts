import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext, SourceModule } from '@source/sdk'
import { aesCbcPkcs7Base64, bookFromItem, chapterFromItem, fetchJson, makeContent, manifestBase, md5Hex, openSettingsPage, rootCategories, sortedSign, SOURCE_SETTINGS_COMMON, str, withQuery } from '../helpers/common.ts'

const SIGN_KEY = 'd3dGiJc651gSQ8w1'
const H_COMMON: Record<string, string> = { 'app-version': '79020', platform: 'android', reg: '0', AUTHORIZATION: '', 'application-id': 'com.kmxs.reader', 'net-env': '1', channel: 'unknown', 'qm-params': '' }
const manifest = manifestBase({
  id: 'legado.5.qimao.mingyue',
  name: '七猫-明月（迁移版）',
  version: '0.2.0',
  icon: 'https://cdn-front.qimao.com/global/static/images/favicon2022.ico',
  type: 'novel',
  groups: ['Legado', '七猫', '明月'],
  baseUrl: 'https://api-bc.wtzw.com',
  entry: 'qimaoMingyue.ts',
  permissions: { network: { domains: ['api-bc.wtzw.com', 'api-ks.wtzw.com', 'www.baidu.com'] }, storage: true, secret: true, browser: true },
  dependencies: [{ name: 'node:crypto', source: 'builtin' }],
  settings: [...SOURCE_SETTINGS_COMMON],
  settingsPage: { title: '七猫明月设置' },
  limits: { timeoutMs: 180000, concurrent: 4 },
})
async function signedHeaders(extra: Record<string, string> = {}) {
  const h = { ...H_COMMON, ...extra }
  return { ...h, sign: await md5Hex(sortedSign(h, SIGN_KEY)) }
}
async function signedUrl(base: string, params: Record<string, any>) {
  const signed = { ...params, sign: await md5Hex(sortedSign(params, SIGN_KEY)) }
  return withQuery(base, signed)
}
function toBook(ctx: any, item: any) {
  const id = str(item?.id || item?.book_id)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: JSON.stringify({ id }), name: item?.original_title || item?.title, author: item?.original_author || item?.author, cover: item?.image_link, intro: item?.intro, kind: [item?.ptags], wordCount: item?.words_num })
}
const CATS = ['都市人生', '异术超能', '玄幻奇幻', '武侠仙侠', '历史', '游戏', '科幻', '现代言情', '总裁豪门', '古代言情']

const module: SourceModule = {
  async search(ctx: SearchContext) {
    const pageSize = ctx.args.pageSize || 32
    const params = { gender: '3', imei_ip: '2937357107', page: ctx.args.page, pageSize, page_size: pageSize, limit: pageSize, size: pageSize, wd: ctx.args.keyword }
    const url = await signedUrl('https://api-bc.wtzw.com/api/v5/search/words', params)
    const json: any = await fetchJson(url, { headers: await signedHeaders() })
    const books = (json?.data?.books || []).map((x: any) => toBook(ctx, x))
    return { books, page: ctx.args.page, hasMore: books.length > 0 }
  },
  async explore(ctx: ExploreContext) {
    if (!ctx.args.sectionId) return { items: rootCategories(CATS) }
    const out = await module.search!({ ...ctx, args: { keyword: str(ctx.args.payload?.category), page: ctx.args.page, pageSize: ctx.args.pageSize } } as any)
    return { items: out.books.map((book: any) => ({ type: 'book' as const, book })), page: out.page, hasMore: out.hasMore }
  },
  async bookInfo(ctx: any): Promise<BookInfo> {
    const { id } = JSON.parse(ctx.args.book.bookUrl)
    const url = await signedUrl('https://api-bc.wtzw.com/api/v4/book/detail', { id, imei_ip: '2937357107', teeny_mode: 0 })
    const json: any = await fetchJson(url, { headers: await signedHeaders() })
    const d = json?.data?.book || json?.data || json
    return { ...toBook(ctx, d), tocUrl: JSON.stringify({ id: d?.id || id }), lastChapterName: str(d?.latest_chapter_title), kind: (d?.book_tag_list || []).map((x: any) => str(x?.title)).filter(Boolean), extra: d }
  },
  async toc(ctx: TocContext) {
    const { id } = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
    const url = await signedUrl('https://api-ks.wtzw.com/api/v1/chapter/chapter-list', { id })
    const json: any = await fetchJson(url, { headers: await signedHeaders() })
    const chapters = (json?.data?.chapter_lists || []).map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.id, name: x?.title, chapterUrl: JSON.stringify({ bid: id, cid: x?.id, md5: x?.content_md5 }), updateTime: x?.update_time, wordCount: x?.words }))
    return { chapters }
  },
  async content(ctx: ContentContext) {
    const { bid, cid } = JSON.parse(ctx.args.chapter.chapterUrl)
    const url = await signedUrl('https://api-ks.wtzw.com/api/v1/chapter/content', { id: bid, chapterId: cid })
    const json: any = await fetchJson(url, { headers: await signedHeaders() })
    const cipher = str(json?.data?.content)
    const raw = cipher ? await aesCbcPkcs7Base64(cipher, '242ccb8230d709e1') : ''
    return makeContent(ctx, ctx.args.chapter.name, raw)
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
