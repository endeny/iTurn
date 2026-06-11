/// <reference lib="es2022" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

/**
 * SourceSDK.d.ts
 *
 * Web-runtime based source plugin protocol.
 *
 * Runtime model:
 * - Source JavaScript runs in a Web Worker-like standard environment.
 * - Network uses standard global fetch / Request / Response / Headers.
 * - The host must not extend fetch with custom fields.
 * - The host exposes only app-specific capabilities through SourceContext<TArgs>.
 * - Entry-specific parameters are passed through ctx.args.
 *
 * Design boundary:
 * - URL building, request headers, body, signatures, parsing, retry logic, and
 *   HTML parsing belong to source JavaScript.
 * - Permission checks, sandboxing, source-scoped cookies, storage, secrets,
 *   cache, browser integration, logging, trace, manifest validation, export
 *   validation, and return value validation belong to the host runtime.
 */

declare module '@source/sdk' {
  /**
   * ============================================================
   * Common
   * ============================================================
   */

  export type MaybePromise<T> = T | Promise<T>

  export type TimestampMs = number

  export type SourceId = string

  export type UnknownRecord = Record<string, unknown>

  export type JsonPrimitive = string | number | boolean | null

  export type JsonValue =
    | JsonPrimitive
    | JsonObject
    | JsonArray

  export interface JsonObject {
    [key: string]: JsonValue
  }

  export interface JsonArray extends Array<JsonValue> {}

  /**
   * ============================================================
   * Source Package / Manifest
   * ============================================================
   */

  export interface SourcePackage {
    manifest: SourceManifest
    files?: Record<string, string>
  }

  export interface SourceManifest {
    schemaVersion: 1

    /**
     * Stable source identifier.
     *
     * Do not use display name or base URL as identity.
     */
    id: SourceId

    name: string
    version: string

    author?: string
    description?: string
    homepage?: string
    icon?: string

    type: SourceContentType
    groups?: string[]

    /**
     * Metadata only. The host must not build business requests from this.
     */
    baseUrl?: string

    enabled?: boolean
    weight?: number
    order?: number

    /**
     * JavaScript module entry.
     */
    entry: string

    /**
     * Exported function mapping.
     *
     * Values are exported function names in entry module.
     */
    exports: SourceExports

    permissions?: SourcePermissions
    settings?: SourceSetting[]
    login?: LoginDeclaration
    limits?: SourceLimits
    dependencies?: SourceDependency[]
    compatibility?: CompatibilityDeclaration
    update?: SourceUpdateDeclaration
    match?: SourceMatchDeclaration
  }

  export type SourceContentType =
    | 'novel'
    | 'comic'
    | 'audio'
    | 'video'
    | 'mixed'

  export interface SourceExports {
    explore?: string
    search?: string
    bookInfo?: string
    toc?: string
    content?: string

    image?: string
    audio?: string
    download?: string

    login?: string
    logout?: string
    checkLogin?: string

    onInstall?: string
    onUpdate?: string

    /**
     * Custom exported functions.
     */
    [customExportName: string]: string | undefined
  }

  export interface SourcePermissions {
    /**
     * Runtime must check fetch requests against this allowlist.
     */
    network?: DomainPermission

    /**
     * Runtime may use this to attach/save source-scoped cookies for fetch.
     */
    cookie?: DomainPermission

    storage?: boolean
    secret?: boolean
    browser?: boolean

    clipboard?: boolean
    file?: boolean
    externalApp?: boolean
    notification?: boolean
  }

  export interface DomainPermission {
    domains: string[]
  }

  export interface SourceLimits {
    /**
     * Default function execution timeout.
     */
    timeoutMs?: number

    concurrent?: number

    rateLimit?: {
      requests: number
      perSeconds: number
    }

    memoryMB?: number
  }

  export interface SourceDependency {
    /**
     * Examples:
     * - "cheerio"
     * - "linkedom"
     * - "crypto-js"
     */
    name: string

    version?: string

    /**
     * builtin:
     *   audited dependency provided by runtime.
     *
     * bundle:
     *   dependency bundled inside source package.
     */
    source: 'builtin' | 'bundle'

    integrity?: string
  }

  export interface CompatibilityDeclaration {
    legado?: {
      version?: string
      useCompat?: boolean
    }
  }

  export interface SourceUpdateDeclaration {
    url?: string

    /**
     * Optional exported function name.
     */
    check?: string
  }

  export interface SourceMatchDeclaration {
    bookUrl?: string
    contentUrl?: string
  }

  /**
   * ============================================================
   * Source Module
   * ============================================================
   *
   * All entry functions receive SourceContext<TArgs>.
   * Entry-specific arguments are carried by ctx.args.
   */

  export interface SourceModule {
    explore?(ctx: ExploreContext): MaybePromise<ExploreResult>
    search?(ctx: SearchContext): MaybePromise<SearchResult>
    bookInfo?(ctx: BookInfoContext): MaybePromise<BookInfo>
    toc?(ctx: TocContext): MaybePromise<TocResult>
    content?(ctx: ContentContext): MaybePromise<ContentResult>

    image?(ctx: ImageContext): MaybePromise<ImageResult>
    audio?(ctx: AudioContext): MaybePromise<AudioResult>
    download?(ctx: DownloadContext): MaybePromise<DownloadResult>

    login?(ctx: LoginContext): MaybePromise<LoginResult>
    logout?(ctx: LogoutContext): MaybePromise<void>
    checkLogin?(ctx: CheckLoginContext): MaybePromise<LoginStatus>

    onInstall?(ctx: InstallContext): MaybePromise<void>
    onUpdate?(ctx: UpdateContext): MaybePromise<void>

    /**
     * Custom exported functions may be called by RunFunctionAction.
     */
    [customExportName: string]: unknown
  }

  /**
   * ============================================================
   * Runtime Requirement
   * ============================================================
   *
   * The runtime must provide a Web Worker-like global environment.
   *
   * Required:
   * - fetch
   * - Request
   * - Response
   * - Headers
   * - URL
   * - URLSearchParams
   * - AbortController
   * - AbortSignal
   * - TextEncoder
   * - TextDecoder
   * - atob
   * - btoa
   * - setTimeout
   * - clearTimeout
   * - console
   *
   * Recommended:
   * - crypto
   * - crypto.subtle
   * - Blob
   * - File
   * - FormData
   * - ReadableStream
   * - CompressionStream
   * - DecompressionStream
   *
   * Runtime adapters must not extend fetch with non-standard init fields.
   */

  /**
   * ============================================================
   * Runtime Context
   * ============================================================
   */

  export interface SourceContext<TArgs = undefined> {
    source: SourceInfo
    env: RuntimeEnv

    /**
     * Entry-specific arguments.
     *
     * For example:
     * - search(ctx).args.keyword
     * - content(ctx).args.chapter
     * - custom action ctx.args.payload
     */
    args: TArgs

    /**
     * Persistent, non-sensitive, source-scoped storage.
     */
    storage: StorageAPI

    /**
     * Sensitive, source-scoped storage.
     */
    secret: SecretAPI

    /**
     * Temporary source-scoped cache.
     */
    cache: CacheAPI

    /**
     * Source-scoped cookie store.
     *
     * This is separate from fetch. The runtime may automatically use this jar
     * for standard fetch requests according to source permissions.
     */
    cookie: CookieStoreAPI

    browser: BrowserAPI
    log: LogAPI
    utils: UtilsAPI
  }

  export interface SourceInfo {
    id: SourceId
    name: string
    version: string
    baseUrl?: string

    /**
     * Resolved user settings from manifest.settings.
     */
    settings: Record<string, unknown>
  }

  export interface RuntimeEnv {
    platform: RuntimePlatform

    appVersion: string
    sdkVersion: string

    language: string
    timezone: string

    userAgent?: string

    capabilities: RuntimeCapabilities
  }

  export type RuntimePlatform =
    | 'ios'
    | 'macos'
    | 'android'
    | 'windows'
    | 'linux'
    | 'web'
    | 'node'
    | 'unknown'

  export interface RuntimeCapabilities {
    fetch: FetchCapabilities
    crypto: CryptoCapabilities
    binary: BinaryCapabilities
    timer: TimerCapabilities
    module: ModuleCapabilities
  }

  export interface FetchCapabilities {
    streamingResponseBody: boolean
    streamingRequestBody: boolean

    blob: boolean
    file: boolean
    formData: boolean

    /**
     * Runtime supports automatically storing Set-Cookie into source cookie jar.
     */
    automaticCookieJar: boolean

    /**
     * Runtime implements redirect: "manual" accurately.
     */
    manualRedirect: boolean
  }

  export interface CryptoCapabilities {
    subtle: boolean

    /**
     * Informational only. Prefer Web Crypto or bundled JS libraries.
     */
    md5?: boolean
    sha1?: boolean
    sha256?: boolean
    hmac?: boolean
  }

  export interface BinaryCapabilities {
    textEncoder: boolean
    textDecoder: boolean
    atob: boolean
    btoa: boolean
    compressionStream: boolean
    decompressionStream: boolean
  }

  export interface TimerCapabilities {
    setTimeout: boolean
    clearTimeout: boolean
    setInterval?: boolean
    clearInterval?: boolean
  }

  export interface ModuleCapabilities {
    esm: boolean
    dynamicImport: boolean
    commonjs?: boolean
  }

  /**
   * ============================================================
   * Entry Context Specializations
   * ============================================================
   */

  export type ExploreContext = SourceContext<ExploreArgs>
  export type SearchContext = SourceContext<SearchArgs>
  export type BookInfoContext = SourceContext<BookInfoArgs>
  export type TocContext = SourceContext<TocArgs>
  export type ContentContext = SourceContext<ContentArgs>

  export type ImageContext = SourceContext<ImageArgs>
  export type AudioContext = SourceContext<AudioArgs>
  export type DownloadContext = SourceContext<DownloadArgs>

  export type LoginContext = SourceContext<LoginArgs>
  export type LogoutContext = SourceContext<LogoutArgs>
  export type CheckLoginContext = SourceContext<CheckLoginArgs>

  export type InstallContext = SourceContext<InstallArgs>
  export type UpdateContext = SourceContext<UpdateArgs>

  /**
   * For custom actions/functions.
   */
  export type CustomContext<TPayload = unknown> = SourceContext<CustomArgs<TPayload>>

  /**
   * ============================================================
   * Entry Args
   * ============================================================
   */

  export interface ExploreArgs {
    page: number
    pageSize?: number

    /**
     * Empty or undefined means root explore page.
     */
    sectionId?: string

    filters?: Record<string, unknown>

    /**
     * Payload from OpenExploreAction.
     */
    payload?: Record<string, unknown>
  }

  export interface SearchArgs {
    keyword: string
    page: number
    pageSize?: number
    filters?: Record<string, unknown>
  }

  export interface BookInfoArgs {
    book: BookRef
  }

  export interface TocArgs {
    book: BookRef | BookInfo
    page?: number
    pageSize?: number
  }

  export interface ContentArgs {
    book: BookRef | BookInfo
    chapter: Chapter
  }

  export interface ImageArgs {
    url: string
    book?: BookRef | BookInfo
    chapter?: Chapter
    item?: ImageBlock
  }

  export interface AudioArgs {
    url: string
    book?: BookRef | BookInfo
    chapter?: Chapter
    item?: AudioBlock
  }

  export interface DownloadArgs {
    book: BookRef | BookInfo
    chapter?: Chapter
    target?: DownloadTarget
  }

  export interface LoginArgs {
    method?: string
    payload?: Record<string, unknown>
  }

  export interface LogoutArgs {
    method?: string
    payload?: Record<string, unknown>
  }

  export interface CheckLoginArgs {
    method?: string
    payload?: Record<string, unknown>
  }

  export interface InstallArgs {
    /**
     * Reserved for future migration/import data.
     */
    payload?: Record<string, unknown>
  }

  export interface UpdateArgs {
    fromVersion: string
    payload?: Record<string, unknown>
  }

  export interface CustomArgs<TPayload = unknown> {
    name: string
    payload?: TPayload
  }

  export interface DownloadTarget {
    type: 'book' | 'chapter' | 'image' | 'audio' | 'custom'
    url?: string
    id?: string
  }

  /**
   * ============================================================
   * Explore
   * ============================================================
   */

  export interface ExploreResult {
    items: ExploreItem[]
    page?: number
    hasMore?: boolean
    nextPage?: number
    extra?: Record<string, unknown>
  }

  export type ExploreItem =
    | ExploreCategory
    | ExploreBook
    | ExploreAction
    | ExploreDivider
    | ExploreText
    | ExploreGroup

  export interface ExploreCategory {
    type: 'category'
    id?: string
    title: string
    subtitle?: string
    action: SourceAction
    layout?: LayoutInfo
    extra?: Record<string, unknown>
  }

  export interface ExploreBook {
    type: 'book'
    book: BookRef
    layout?: LayoutInfo
    extra?: Record<string, unknown>
  }

  export interface ExploreAction {
    type: 'action'
    title: string
    subtitle?: string
    action: SourceAction
    layout?: LayoutInfo
    extra?: Record<string, unknown>
  }

  export interface ExploreDivider {
    type: 'divider'
    title?: string
    extra?: Record<string, unknown>
  }

  export interface ExploreText {
    type: 'text'
    title?: string
    text: string
    layout?: LayoutInfo
    extra?: Record<string, unknown>
  }

  export interface ExploreGroup {
    type: 'group'
    title?: string
    items: ExploreItem[]
    layout?: LayoutInfo
    extra?: Record<string, unknown>
  }

  export interface LayoutInfo {
    /**
     * Flex basis ratio, e.g. 0.25 means 25%.
     */
    basis?: number

    grow?: number
    columns?: number
    width?: number
    height?: number
  }

  /**
   * ============================================================
   * Book / Search / TOC
   * ============================================================
   */

  export interface SearchResult {
    books: BookRef[]
    page?: number
    hasMore?: boolean
    nextPage?: number
    extra?: Record<string, unknown>
  }

  export interface BookRef {
    /**
     * Source-specific stable book id if available.
     */
    id?: string

    sourceId: SourceId

    name: string
    author?: string

    /**
     * Source-specific book URL or opaque book key.
     *
     * It does not have to be a real URL. Source JS owns its meaning.
     */
    bookUrl: string

    cover?: string
    intro?: string

    /**
     * Tags / categories / genres.
     */
    kind?: string[]

    status?: BookStatus

    wordCount?: number
    lastChapterName?: string

    extra?: Record<string, unknown>
  }

  export interface BookInfo extends BookRef {
    /**
     * Source-specific TOC URL or opaque TOC key.
     */
    tocUrl?: string

    latestChapter?: ChapterRef

    updateTime?: TimestampMs

    canRename?: boolean
  }

  export interface ChapterRef {
    id?: string
    name: string

    /**
     * Source-specific chapter URL or opaque chapter key.
     */
    chapterUrl: string
  }

  export type BookStatus =
    | 'ongoing'
    | 'completed'
    | 'paused'
    | 'removed'
    | 'unknown'

  export interface TocResult {
    /**
     * Flat reading order.
     */
    chapters: Chapter[]

    /**
     * Optional structured volumes.
     */
    volumes?: Volume[]

    page?: number
    hasMore?: boolean
    nextPage?: number

    extra?: Record<string, unknown>
  }

  export interface Volume {
    id?: string
    name: string
    index?: number
    chapters: Chapter[]
    extra?: Record<string, unknown>
  }

  export interface Chapter {
    id?: string
    sourceId: SourceId

    name: string

    /**
     * Source-specific chapter URL or opaque chapter key.
     */
    chapterUrl: string

    index?: number

    volumeId?: string
    volumeName?: string

    updateTime?: TimestampMs
    wordCount?: number

    isVip?: boolean
    isPaid?: boolean

    extra?: Record<string, unknown>
  }

  /**
   * ============================================================
   * Content
   * ============================================================
   */

  export interface ContentResult {
    title?: string
    chapterId?: string

    /**
     * text:
     *   content must be string.
     *
     * html:
     *   content must be string.
     *
     * blocks:
     *   content must be ContentBlock[].
     */
    format: 'text' | 'html' | 'blocks'

    content: string | ContentBlock[]

    /**
     * Source-specific URL/key if source supports adjacent navigation.
     */
    nextChapterUrl?: string
    prevChapterUrl?: string

    isPaid?: boolean
    payAction?: SourceAction

    extra?: Record<string, unknown>
  }

  export type ContentBlock =
    | ParagraphBlock
    | HtmlBlock
    | ImageBlock
    | AudioBlock
    | CommentBlock
    | DividerBlock
    | ErrorBlock
    | CustomBlock

  export interface ParagraphBlock {
    type: 'paragraph'
    text: string
    extra?: Record<string, unknown>
  }

  export interface HtmlBlock {
    type: 'html'
    html: string
    extra?: Record<string, unknown>
  }

  export interface ImageBlock {
    type: 'image'
    url: string
    alt?: string
    width?: number
    height?: number

    /**
     * Optional request headers for app renderer/downloader.
     *
     * Renderer must still obey source network permission.
     */
    headers?: Record<string, string>

    extra?: Record<string, unknown>
  }

  export interface AudioBlock {
    type: 'audio'
    url: string
    title?: string
    duration?: number
    headers?: Record<string, string>
    extra?: Record<string, unknown>
  }

  export interface CommentBlock {
    type: 'comment'
    id: string
    text?: string
    action?: SourceAction
    extra?: Record<string, unknown>
  }

  export interface DividerBlock {
    type: 'divider'
    title?: string
    extra?: Record<string, unknown>
  }

  export interface ErrorBlock {
    type: 'error'
    message: string
    code?: string
    extra?: Record<string, unknown>
  }

  export interface CustomBlock {
    type: 'custom'
    name: string
    payload?: Record<string, unknown>
  }

  export interface ImageResult {
    url?: string
    data?: ArrayBuffer | Uint8Array | string
    mimeType?: string
    headers?: Record<string, string>
    extra?: Record<string, unknown>
  }

  export interface AudioResult {
    url?: string
    data?: ArrayBuffer | Uint8Array | string
    mimeType?: string
    headers?: Record<string, string>
    extra?: Record<string, unknown>
  }

  export interface DownloadResult {
    files: DownloadFile[]
    extra?: Record<string, unknown>
  }

  export interface DownloadFile {
    name: string
    url?: string
    data?: ArrayBuffer | Uint8Array | string
    mimeType?: string
    headers?: Record<string, string>
    extra?: Record<string, unknown>
  }

  /**
   * ============================================================
   * Actions
   * ============================================================
   */

  export type SourceAction =
    | OpenUrlAction
    | OpenBookAction
    | OpenExploreAction
    | RunFunctionAction
    | OpenBrowserAction
    | ShowSettingsAction
    | CopyTextAction
    | ExternalAppAction

  export interface OpenUrlAction {
    type: 'openUrl'
    url: string
  }

  export interface OpenBookAction {
    type: 'openBook'
    book: BookRef
  }

  export interface OpenExploreAction {
    type: 'openExplore'
    sectionId: string
    payload?: Record<string, unknown>
  }

  export interface RunFunctionAction<TPayload = unknown> {
    type: 'run'

    /**
     * Exported function name declared in manifest.exports or available in module.
     */
    name: string

    payload?: TPayload
  }

  export interface OpenBrowserAction {
    type: 'openBrowser'
    url: string
    title?: string
    waitForClose?: boolean
  }

  export interface ShowSettingsAction {
    type: 'showSettings'
  }

  export interface CopyTextAction {
    type: 'copyText'
    text: string
  }

  export interface ExternalAppAction {
    type: 'externalApp'
    url: string
  }

  /**
   * ============================================================
   * Settings / Login
   * ============================================================
   */

  export type SourceSetting =
    | TextSetting
    | PasswordSetting
    | TokenSetting
    | SelectSetting
    | SwitchSetting
    | NumberSetting
    | ColorSetting
    | ButtonSetting
    | GroupSetting

  export interface BaseSetting {
    key: string
    title: string
    description?: string
    required?: boolean
    group?: string
  }

  export interface TextSetting extends BaseSetting {
    type: 'text'
    defaultValue?: string
    placeholder?: string
  }

  export interface PasswordSetting extends BaseSetting {
    type: 'password'
    placeholder?: string
  }

  export interface TokenSetting extends BaseSetting {
    type: 'token'
    placeholder?: string
  }

  export interface SelectSetting extends BaseSetting {
    type: 'select'
    options: SourceSettingOption[]
    defaultValue?: string
  }

  export interface SourceSettingOption {
    title: string
    value: string
  }

  export interface SwitchSetting extends BaseSetting {
    type: 'switch'
    defaultValue?: boolean
  }

  export interface NumberSetting extends BaseSetting {
    type: 'number'
    min?: number
    max?: number
    step?: number
    defaultValue?: number
  }

  export interface ColorSetting extends BaseSetting {
    type: 'color'
    defaultValue?: string
  }

  export interface ButtonSetting extends BaseSetting {
    type: 'button'
    action: SourceAction
  }

  export interface GroupSetting extends BaseSetting {
    type: 'group'
    children: SourceSetting[]
  }

  export interface LoginDeclaration {
    required?: boolean
    checkOnStartup?: boolean
    methods: LoginMethod[]
  }

  export type LoginMethod =
    | BrowserLoginMethod
    | TokenLoginMethod
    | PasswordLoginMethod
    | CustomLoginMethod

  export interface BrowserLoginMethod {
    type: 'browser'
    id: string
    title: string
    url: string
    cookieDomains?: string[]

    /**
     * Optional exported function called after browser closes.
     */
    callback?: string
  }

  export interface TokenLoginMethod {
    type: 'token'
    id: string
    title: string
    secretKey: string
  }

  export interface PasswordLoginMethod {
    type: 'password'
    id: string
    title: string
    usernameKey: string
    passwordKey: string
  }

  export interface CustomLoginMethod {
    type: 'custom'
    id: string
    title: string

    /**
     * Exported function name.
     */
    function: string
  }

  export interface LoginResult {
    success: boolean
    message?: string
    userName?: string
    extra?: Record<string, unknown>
  }

  export interface LoginStatus {
    loggedIn: boolean
    userName?: string
    message?: string
    expiresAt?: TimestampMs
    extra?: Record<string, unknown>
  }

  /**
   * ============================================================
   * App-specific Host APIs
   * ============================================================
   */

  export interface StorageAPI {
    get<T = unknown>(key: string): Promise<T | null>
    set<T = unknown>(key: string, value: T): Promise<void>
    remove(key: string): Promise<void>
    clear?(): Promise<void>
  }

  export interface SecretAPI {
    get(key: string): Promise<string | null>
    set(key: string, value: string): Promise<void>
    remove(key: string): Promise<void>
    clear?(): Promise<void>
  }

  export interface CacheAPI {
    get<T = unknown>(key: string): Promise<T | null>
    set<T = unknown>(key: string, value: T, ttlSeconds?: number): Promise<void>
    remove(key: string): Promise<void>
    clear(): Promise<void>
  }

  export interface CookieStoreAPI {
    get(domainOrUrl: string, name?: string): Promise<string | null>
    getAll(domainOrUrl: string): Promise<CookieRecord[]>

    set(domainOrUrl: string, cookie: string | CookieRecord): Promise<void>
    remove(domainOrUrl: string, name?: string): Promise<void>
    clear(domainOrUrl?: string): Promise<void>
  }

  export interface CookieRecord {
    name: string
    value: string
    domain?: string
    path?: string
    expires?: TimestampMs
    httpOnly?: boolean
    secure?: boolean
    sameSite?: 'lax' | 'strict' | 'none'
  }

  export interface BrowserAPI {
    open(input: BrowserOpenInput): Promise<BrowserResult>
  }

  export interface BrowserOpenInput {
    url: string
    title?: string
    waitForClose?: boolean

    /**
     * Optional script injected into browser.
     *
     * Runtime may reject this unless browser permission allows it.
     */
    injectScript?: string
  }

  export interface BrowserResult {
    url?: string
    cookies?: CookieRecord[]
    data?: unknown
  }

  export interface LogAPI {
    debug(...args: unknown[]): void
    info(...args: unknown[]): void
    warn(...args: unknown[]): void
    error(...args: unknown[]): void
  }

  export interface UtilsAPI {
    sleep(ms: number): Promise<void>
    now(): TimestampMs
    uuid(): string

    /**
     * Construct a structured runtime error.
     */
    error(input: SourceErrorInput): SourceRuntimeError

    /**
     * Validate a condition and throw a structured error if it fails.
     */
    assert(condition: unknown, input: SourceErrorInput): asserts condition
  }

  /**
   * ============================================================
   * Error / Trace / Validation
   * ============================================================
   */

  export interface SourceErrorInput {
    code: SourceErrorCode
    message: string
    stage?: SourceStage
    recoverable?: boolean
    data?: Record<string, unknown>
  }

  export interface SourceRuntimeError extends Error {
    code: SourceErrorCode
    stage?: SourceStage
    recoverable?: boolean
    data?: Record<string, unknown>
  }

  export type SourceStage =
    | 'install'
    | 'update'
    | 'explore'
    | 'search'
    | 'bookInfo'
    | 'toc'
    | 'content'
    | 'image'
    | 'audio'
    | 'download'
    | 'login'
    | 'logout'
    | 'checkLogin'
    | 'custom'

  export type SourceErrorCode =
    | 'NETWORK_ERROR'
    | 'HTTP_STATUS_ERROR'
    | 'PARSE_ERROR'
    | 'LOGIN_REQUIRED'
    | 'PERMISSION_DENIED'
    | 'RATE_LIMITED'
    | 'CONTENT_EMPTY'
    | 'SOURCE_BROKEN'
    | 'INVALID_RETURN_VALUE'
    | 'INVALID_MANIFEST'
    | 'EXPORT_NOT_FOUND'
    | 'TIMEOUT'
    | 'ABORTED'
    | 'UNKNOWN'

  export interface SourceTrace<TArgs = unknown, TResult = unknown> {
    sourceId: SourceId
    function: string
    stage: SourceStage
    args?: TArgs
    requests: FetchTrace[]
    logs: LogItem[]
    result?: TResult
    error?: SourceRuntimeError
    durationMs: number
  }

  export interface FetchTrace {
    url: string
    method: string
    status?: number
    durationMs?: number
    error?: string
  }

  export interface LogItem {
    level: 'debug' | 'info' | 'warn' | 'error'
    message: string
    time: TimestampMs
    data?: unknown
  }

  export interface ValidationIssue {
    path: string
    message: string
    expected?: string
    received?: string
  }

  export interface ValidationResult {
    ok: boolean
    issues?: ValidationIssue[]
  }
}

/**
 * Optional single-file source plugin shape:
 *
 * import type { SourceManifest, SearchContext, SearchResult } from '@source/sdk'
 *
 * export const manifest: SourceManifest = { ... }
 *
 * export async function search(ctx: SearchContext): Promise<SearchResult> {
 *   const { keyword, page } = ctx.args
 *   const url = new URL('/search', ctx.source.baseUrl)
 *   url.searchParams.set('key', keyword)
 *   url.searchParams.set('page', String(page))
 *
 *   const res = await fetch(url)
 *   const json = await res.json()
 *
 *   return { books: ... }
 * }
 */

export {}
