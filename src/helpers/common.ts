import type {
  BookInfo,
  BookRef,
  Chapter,
  ContentBlock,
  ContentResult,
  ExploreItem,
  SearchContext,
  SettingsPageContext,
  SourceActionResult,
  SourceContext,
  SourceId,
  SourceManifest,
  SourceSetting,
  TocResult,
} from '@source/sdk'

type SourceManifestMetadata = Omit<SourceManifest, 'module'>
type SettingsPageLink = { title: string; url: string; secondary?: boolean }

export function str(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback
  return String(value)
}

export function num(value: unknown): number | undefined {
  if (typeof value === 'string') {
    const compact = value.replace(/,/g, '').trim()
    const matched = compact.match(/(\d+(?:\.\d+)?)/)
    if (matched) {
      const base = Number(matched[1])
      if (Number.isFinite(base)) {
        if (compact.includes('亿')) return Math.round(base * 100000000)
        if (compact.includes('万')) return Math.round(base * 10000)
        return Math.round(base)
      }
    }
  }
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export function boolSetting(ctx: SourceContext<any>, key: string, fallback = false): boolean {
  const value = ctx.source.settings[key]
  return typeof value === 'boolean' ? value : fallback
}

export function stringSetting(ctx: SourceContext<any>, key: string, fallback = ''): string {
  const value = ctx.source.settings[key]
  return typeof value === 'string' ? value : fallback
}

export function enumSetting<T extends string>(ctx: SourceContext<any>, key: string, fallback: T): T {
  const value = ctx.source.settings[key]
  return typeof value === 'string' ? (value as T) : fallback
}

export function baseUrl(ctx: SourceContext<any>, fallback?: string): string {
  const custom = stringSetting(ctx, 'baseUrl', '').trim() || stringSetting(ctx, 'customDomain', '').trim()
  const value = custom || ctx.source.baseUrl || fallback || ''
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value.replace(/\/+$/, '')
  return `https://${value}`.replace(/\/+$/, '')
}

export function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`
}

export function withQuery(url: string, query: Record<string, unknown>): string {
  const u = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    u.searchParams.set(key, String(value))
  }
  return u.toString()
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  console.log(`[FETCH] ${url}`, init)
  const res = await fetch(url, init)
  console.log(`[RESPONSE] ${url} - ${res.status}`, res)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.text()
}

export async function fetchJson<T = any>(url: string, init?: RequestInit): Promise<T> {
  const text = await fetchText(url, init)
  try {
    return JSON.parse(text) as T
  } catch (error) {
    throw new Error(`JSON parse failed: ${url}\n${text.slice(0, 240)}`)
  }
}

export async function postJson<T = any>(url: string, body?: unknown, init?: RequestInit): Promise<T> {
  return fetchJson<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
}

export function getPath(obj: any, path: string): any {
  if (!path) return obj
  return path.split('.').filter(Boolean).reduce((acc, key) => {
    if (acc == null) return undefined
    if (key === '*') return Array.isArray(acc) ? acc.flat() : undefined
    return acc[key]
  }, obj)
}

export function asArray(value: any): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (typeof value === 'object') return Object.values(value).flatMap((x) => Array.isArray(x) ? x : [x])
  return []
}

export function collectArraysByKey(obj: any, key: string): any[] {
  const out: any[] = []
  const visit = (value: any) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value[key])) out.push(...value[key])
    if (Array.isArray(value)) value.forEach(visit)
    else Object.values(value).forEach(visit)
  }
  visit(obj)
  return out
}

export function firstArray(...values: any[]): any[] {
  for (const value of values) {
    const arr = asArray(value)
    if (arr.length) return arr
  }
  return []
}

export function idFrom(input: unknown, fallback = ''): string {
  const raw = str(input, fallback)
  if (!raw) return fallback
  try {
    const u = new URL(raw)
    return u.searchParams.get('book_id') || u.searchParams.get('bookId') || u.searchParams.get('id') || u.searchParams.get('chapterId') || u.pathname.split('/').filter(Boolean).pop() || raw
  } catch {}
  const m = raw.match(/(?:book_id|bookId|id|chapterId|item_id|itemId)=([^&#]+)/)
  if (m) return decodeURIComponent(m[1])
  return raw.replace(/^data:.*?base64,/, '').split(',')[0].slice(0, 80)
}

export function stripHtml(input: unknown): string {
  return str(input)
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim()
}

export function htmlToParagraphs(html: string): ContentBlock[] {
  const normalized = html
    .replace(/<img\b([^>]*)src=["']([^"']+)["']([^>]*)>/gi, '\n[[IMG:$2]]\n')
    .replace(/<p\b[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
  return normalized.split(/\n+/).map((line): ContentBlock | null => {
    const t = line.trim()
    if (!t) return null
    const img = t.match(/^\[\[IMG:(.+)\]\]$/)
    if (img) return { type: 'image', url: img[1] }
    return { type: 'paragraph', text: stripHtml(t) }
  }).filter(Boolean) as ContentBlock[]
}

export function makeContent(ctx: SourceContext<any>, title: string | undefined, raw: string): ContentResult {
  const format = enumSetting(ctx, 'contentFormat', 'blocks') as 'blocks' | 'text' | 'html'
  if (format === 'html') return { title, format: 'html', content: raw }
  if (format === 'text') return { title, format: 'text', content: stripHtml(raw) }
  return { title, format: 'blocks', content: htmlToParagraphs(raw) }
}

export function mapKind(...values: unknown[]): string[] | undefined {
  const result = values.flatMap((v) => {
    if (Array.isArray(v)) return v.map((x) => str(x)).filter(Boolean)
    return str(v).split(/[,，\n/|]+/).map((x) => x.trim()).filter(Boolean)
  })
  return result.length ? [...new Set(result)] : undefined
}

export function bookFromItem(sourceId: SourceId, item: any, options: {
  id?: unknown
  name?: unknown
  author?: unknown
  bookUrl?: unknown
  cover?: unknown
  intro?: unknown
  kind?: unknown[]
  wordCount?: unknown
  lastChapterName?: unknown
  status?: BookRef['status']
  extra?: any
}): BookRef {
  const url = str(options.bookUrl || options.id || item?.bookUrl || item?.url || item?.book_id || item?.bookId || item?.id)
  return {
    id: idFrom(options.id || item?.book_id || item?.bookId || item?.id || url),
    sourceId,
    name: stripHtml(options.name ?? item?.name ?? item?.book_name ?? item?.bookName ?? item?.title ?? item?.articlename ?? '未命名'),
    author: stripHtml(options.author ?? item?.author ?? item?.original_author ?? '' ) || undefined,
    bookUrl: url,
    cover: str(options.cover ?? item?.src ?? item?.cover ?? item?.thumb_url ?? item?.thumbUri ?? item?.image_link ?? item?.imgUrl) || undefined,
    intro: stripHtml(options.intro ?? item?.intro ?? item?.abstract ?? '') || undefined,
    kind: mapKind(...(options.kind || [item?.kind, item?.mmfl, item?.category, item?.tags, item?.ptags, item?.keywords])),
    wordCount: num(options.wordCount ?? item?.wordCount ?? item?.word_number ?? item?.words_num ?? item?.words),
    lastChapterName: stripHtml(options.lastChapterName ?? item?.last_chapter_title ?? item?.lastchapter ?? '') || undefined,
    status: options.status,
    extra: options.extra ?? item,
  }
}

export function chapterFromItem(sourceId: SourceId, item: any, index: number, options: {
  id?: unknown
  name?: unknown
  chapterUrl?: unknown
  updateTime?: unknown
  wordCount?: unknown
  volumeName?: unknown
  extra?: any
}): Chapter {
  const chapterUrl = str(options.chapterUrl ?? item?.chapterUrl ?? item?.url ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapterid)
  return {
    id: idFrom(options.id ?? item?.item_id ?? item?.itemId ?? item?.id ?? item?.chapter_id ?? item?.chapterid ?? chapterUrl),
    sourceId,
    name: stripHtml(options.name ?? item?.title ?? item?.name ?? item?.chaptername ?? `第 ${index + 1} 章`),
    chapterUrl,
    index,
    updateTime: num(options.updateTime ?? item?.updateTime ?? item?.first_pass_time ?? item?.firstPassTime),
    wordCount: num(options.wordCount ?? item?.wordCount ?? item?.chapter_word_number ?? item?.words),
    volumeName: str(options.volumeName ?? item?.volume_name ?? '') || undefined,
    extra: options.extra ?? item,
  }
}

export function rootCategories(names: string[], section = 'category'): ExploreItem[] {
  return names.map((title) => ({
    type: 'category',
    title,
    action: { type: 'openExplore', sectionId: section, payload: { category: title } },
    layout: { basis: 0.25, grow: 1 },
  }))
}

export function manifestBase(input: Omit<SourceManifestMetadata, 'schemaVersion' | 'entry'> & Partial<Pick<SourceManifestMetadata, 'entry'>>): SourceManifestMetadata {
  return {
    schemaVersion: 1,
    entry: input.entry || `${input.id}.ts`,
    ...input,
  }
}

function escapeHTML(value: unknown): string {
  return str(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function flattenSettings(settings: SourceSetting[] = []): SourceSetting[] {
  return settings.flatMap((setting) => setting.type === 'group' ? flattenSettings(setting.children) : [setting])
}

function settingDefaultValue(setting: SourceSetting): unknown {
  if ('defaultValue' in setting) return setting.defaultValue
  if (setting.type === 'switch') return false
  return ''
}

function settingsPageURL(ctx: SettingsPageContext, manifest: SourceManifestMetadata, options: {
  title?: string
  description?: string
  links?: SettingsPageLink[]
} = {}) {
  const title = options.title || manifest.settingsPage?.title || `${manifest.name}设置`
  const fields = flattenSettings(manifest.settings).filter((setting) => setting.type !== 'button')
  const fieldJSON = JSON.stringify(fields.map((setting) => ({
    key: setting.key,
    title: setting.title,
    type: setting.type,
    description: setting.description,
    placeholder: 'placeholder' in setting ? setting.placeholder : undefined,
    options: 'options' in setting ? setting.options : undefined,
    min: 'min' in setting ? setting.min : undefined,
    max: 'max' in setting ? setting.max : undefined,
    step: 'step' in setting ? setting.step : undefined,
    value: ctx.source.settings[setting.key] ?? settingDefaultValue(setting),
    defaultValue: settingDefaultValue(setting),
  })))
  const loginLinks = (manifest.login?.methods || [])
    .filter((method) => method.type === 'browser')
    .map((method): SettingsPageLink => ({ title: method.title, url: method.url }))
  const links = [...loginLinks, ...(options.links || [])]
  const linkHTML = links.length ? `
      <section>
        <h2>网页登录</h2>
        <div class="row">
          ${links.map((link) => `<a class="button ${link.secondary ? 'secondary' : ''}" href="${escapeHTML(link.url)}">${escapeHTML(link.title)}</a>`).join('')}
        </div>
      </section>` : ''
  const description = options.description || '这里的配置由书源自己使用。保存后会通过 iTurn config 接口写入源配置，登录完成后点击宿主窗口的完成按钮保存 Cookie。'
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHTML(title)}</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; background: Canvas; color: CanvasText; }
    main { max-width: 760px; margin: 0 auto; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 28px 0 12px; }
    p { color: color-mix(in srgb, CanvasText 62%, transparent); line-height: 1.6; }
    label { display: block; font-weight: 700; margin: 18px 0 8px; }
    input, select { width: 100%; box-sizing: border-box; font: inherit; padding: 12px 14px; border-radius: 10px; border: 1px solid color-mix(in srgb, CanvasText 20%, transparent); background: Canvas; color: CanvasText; }
    input[type="checkbox"] { width: auto; transform: scale(1.15); margin-right: 8px; }
    .field-note { margin-top: -2px; font-size: 13px; }
    .row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
    button, a.button { appearance: none; border: 0; border-radius: 999px; padding: 11px 18px; font: inherit; font-weight: 700; background: #0a84ff; color: white; text-decoration: none; cursor: pointer; }
    button.secondary, a.secondary { background: color-mix(in srgb, CanvasText 12%, transparent); color: CanvasText; }
    .status { min-height: 24px; margin-top: 14px; font-weight: 600; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHTML(title)}</h1>
    <p>${escapeHTML(description)}</p>
    ${linkHTML}
    <section>
      <h2>源配置</h2>
      <div id="fields"></div>
      <div class="row">
        <button id="save">保存配置</button>
        <button class="secondary" id="reset">清除配置</button>
      </div>
      <div class="status" id="status"></div>
    </section>
  </main>
  <script>
    const fields = ${fieldJSON};
    const container = document.getElementById('fields');
    const status = document.getElementById('status');
    function normalizeValue(field, value) {
      if (field.type === 'switch') return Boolean(value);
      if (field.type === 'number') return value === '' || value === null || value === undefined ? null : Number(value);
      return value == null ? '' : String(value);
    }
    function inputFor(field, value) {
      if (field.type === 'select') {
        const select = document.createElement('select');
        for (const option of field.options || []) {
          const node = document.createElement('option');
          node.value = String(option.value);
          node.textContent = option.title;
          select.appendChild(node);
        }
        select.value = String(value || field.defaultValue || '');
        return select;
      }
      const input = document.createElement('input');
      input.type = field.type === 'token' || field.type === 'password' ? 'password' : field.type === 'switch' ? 'checkbox' : field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text';
      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      if (field.type === 'switch') input.checked = Boolean(value);
      else input.value = String(value ?? '');
      return input;
    }
    async function render() {
      for (const field of fields) {
        const stored = await window.iturn.config.get(field.key);
        const value = normalizeValue(field, stored === null ? field.value : stored);
        const label = document.createElement('label');
        label.textContent = field.title;
        const input = inputFor(field, value);
        input.dataset.key = field.key;
        input.dataset.type = field.type;
        container.appendChild(label);
        container.appendChild(input);
        if (field.description) {
          const note = document.createElement('p');
          note.className = 'field-note';
          note.textContent = field.description;
          container.appendChild(note);
        }
      }
    }
    document.getElementById('save').addEventListener('click', async () => {
      for (const input of container.querySelectorAll('input, select')) {
        const type = input.dataset.type;
        const value = type === 'switch' ? input.checked : type === 'number' ? (input.value ? Number(input.value) : null) : input.value;
        await window.iturn.config.set(input.dataset.key, value);
      }
      status.textContent = '已保存';
    });
    document.getElementById('reset').addEventListener('click', async () => {
      for (const field of fields) await window.iturn.config.remove(field.key);
      status.textContent = '已清除';
    });
    render();
  </script>
</body>
</html>`
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
}

export async function openSettingsPage(ctx: SettingsPageContext, manifest: SourceManifestMetadata, options?: {
  title?: string
  description?: string
  links?: { title: string; url: string; secondary?: boolean }[]
}): Promise<SourceActionResult> {
  const title = options?.title || manifest.settingsPage?.title || `${manifest.name}设置`
  const result = await ctx.browser.open({ url: settingsPageURL(ctx, manifest, options), title, waitForClose: true })
  const config = (result.data as any)?.config || {}
  for (const [key, value] of Object.entries(config)) {
    if (value === null) await ctx.config.remove(key)
    else await ctx.config.set(key, value)
  }
  return { success: true, message: '设置已保存' }
}

export async function md5Hex(input: string): Promise<string> {
  const { createHash } = await import('node:crypto')
  return createHash('md5').update(input).digest('hex')
}

export function sortedSign(obj: Record<string, unknown>, key: string): string {
  return Object.keys(obj).sort().reduce((pre, name) => pre + name + '=' + obj[name], '') + key
}

export async function aesCbcPkcs7Base64(cipherBase64: string, keyUtf8: string): Promise<string> {
  const { createDecipheriv } = await import('node:crypto')
  const raw = Buffer.from(cipherBase64, 'base64')
  const iv = raw.subarray(0, 16)
  const encrypted = raw.subarray(16)
  const decipher = createDecipheriv('aes-128-cbc', Buffer.from(keyUtf8, 'utf8'), iv)
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

export function encodeOpaque(value: unknown): string {
  return `opaque:${btoa(unescape(encodeURIComponent(JSON.stringify(value))))}`
}

export function decodeOpaque<T = any>(value: string): T {
  if (!value.startsWith('opaque:')) return JSON.parse(value) as T
  return JSON.parse(decodeURIComponent(escape(atob(value.slice('opaque:'.length))))) as T
}

export const SOURCE_SETTINGS_COMMON = [
  { key: 'contentFormat', title: '正文格式', type: 'select' as const, defaultValue: 'blocks', options: [{ title: 'Blocks', value: 'blocks' }, { title: 'Text', value: 'text' }, { title: 'HTML', value: 'html' }] },
]
