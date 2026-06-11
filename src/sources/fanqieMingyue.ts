import type { BookInfo, ContentContext, ExploreContext, SearchContext, SourceManifest, TocContext } from '@source/sdk'
import { asArray, bookFromItem, chapterFromItem, collectArraysByKey, fetchJson, makeContent, manifestBase, rootCategories, SOURCE_SETTINGS_COMMON, str, withQuery } from './_common.ts'

const BACKEND = 'https://skybook.1113355.xyz'
export const manifest: SourceManifest = manifestBase({
  id: 'legado.7.fanqie.mingyue',
  name: '番茄-明月（迁移版）',
  version: '0.2.0',
  type: 'mixed',
  groups: ['Legado', '番茄', '明月'],
  baseUrl: BACKEND,
  entry: 'fanqieMingyue.ts',
  exports: { explore: 'explore', search: 'search', bookInfo: 'bookInfo', toc: 'toc', content: 'content' },
  permissions: { network: { domains: ['skybook.1113355.xyz', 'fanqienovel.com', '*.snssdk.com', '*.fqnovel.com'] }, cookie: { domains: ['fanqienovel.com'] }, storage: true, secret: true, browser: true },
  settings: [...SOURCE_SETTINGS_COMMON],
  limits: { timeoutMs: 180000, concurrent: 4 },
  match: { bookUrl: 'https?://(.*(fqnovel|snssdk|fanqienovel|changdunovel)\\.com|skybook.1113355.xyz)/.*[0-9]{19}.*' },
})
function replaceCover(u: unknown): string | undefined { const s = str(u); return s ? s.replace(/(\d+)-tt/, '6-novel') : undefined }
function toBook(ctx: any, item: any) {
  const id = str(item?.book_id || item?.bookId || item?.mixed_data?.post_data?.post_id)
  return bookFromItem(ctx.source.id, item, { id, bookUrl: JSON.stringify({ id, genre: item?.genre }), name: item?.book_name || item?.bookName || item?.title || item?.mixed_data?.post_data?.title, author: item?.author || item?.mixed_data?.post_data?.user_info?.user_name, cover: replaceCover(item?.audio_thumb_uri || item?.thumb_url || item?.thumbUri || item?.mixed_data?.post_data?.user_info?.user_avatar), intro: item?.abstract || item?.mixed_data?.post_data?.pure_content, kind: [item?.category, item?.genre, item?.score], wordCount: item?.word_number, lastChapterName: item?.last_chapter_title })
}
export async function search(ctx: SearchContext) {
  const key = ctx.args.keyword
  let raw: any[] = []
  if (/^\d{19}$/.test(key)) {
    const json: any = await fetchJson(withQuery(`${BACKEND}/fq/detail`, { book_id: key }))
    raw = [json?.data || json]
  } else {
    const url = withQuery('https://novel.snssdk.com/api/novel/channel/homepage/search/search/v2/', { device_platform: 'android', parent_enterfrom: 'novel_channel_search.tab.', offset: (ctx.args.page - 1) * 10, aid: 1967, q: key })
    const json: any = await fetchJson(url)
    raw = asArray(json?.data?.ret_data).concat(collectArraysByKey(json, 'book_info'))
  }
  const books = raw.map((x) => toBook(ctx, x))
  return { books, page: ctx.args.page, hasMore: books.length > 0 }
}
export async function explore(ctx: ExploreContext) {
  if (!ctx.args.sectionId) return { items: rootCategories(['每周推荐', '男频精选', '女频精选', '巅峰榜单', '出版榜单', '短篇小说']) }
  const out = await search({ ...ctx, args: { keyword: str(ctx.args.payload?.category || '推荐'), page: ctx.args.page } } as any)
  return { items: out.books.map((book) => ({ type: 'book' as const, book })), page: out.page, hasMore: out.hasMore }
}
export async function bookInfo(ctx: any): Promise<BookInfo> {
  const { id } = JSON.parse(ctx.args.book.bookUrl)
  const json: any = await fetchJson(withQuery(`${BACKEND}/fq/detail`, { book_id: id }))
  const d = json?.data || json
  return { ...ctx.args.book, id: str(d?.book_id || id), name: str(d?.book_name || ctx.args.book.name), author: str(d?.author || ctx.args.book.author) || undefined, intro: str(d?.abstract || ctx.args.book.intro) || undefined, cover: replaceCover(d?.thumb_url) || ctx.args.book.cover, wordCount: Number(d?.word_number) || ctx.args.book.wordCount, lastChapterName: str(d?.last_chapter_title || ctx.args.book.lastChapterName), tocUrl: JSON.stringify({ id: d?.book_id || id, genre: d?.genre }), extra: d }
}
export async function toc(ctx: TocContext) {
  const { id } = JSON.parse(str((ctx.args.book as BookInfo).tocUrl || ctx.args.book.bookUrl))
  const json: any = await fetchJson(withQuery('https://fanqienovel.com/api/reader/directory/detail', { bookId: id }))
  const groups = json?.data?.chapterListWithVolume || []
  const flat = asArray(groups).flatMap((x) => Array.isArray(x) ? x : asArray(x?.chapters || x))
  const chapters = flat.map((x: any, i: number) => chapterFromItem(ctx.source.id, x, i, { id: x?.itemId || x?.item_id, name: str(x?.title).replace('版权信息页', ''), chapterUrl: JSON.stringify({ bid: id, itemId: x?.itemId || x?.item_id, title: x?.title }), updateTime: x?.firstPassTime, volumeName: x?.volume_name }))
  return { chapters }
}
export async function content(ctx: ContentContext) {
  const info = JSON.parse(ctx.args.chapter.chapterUrl)
  const json: any = await fetchJson(withQuery(`${BACKEND}/fq/content`, { book_id: info.bid, item_id: info.itemId }))
  return makeContent(ctx, info.title || ctx.args.chapter.name, str(json?.data?.content || json?.content || json?.data || ''))
}
