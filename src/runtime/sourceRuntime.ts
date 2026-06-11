import type {
  FetchTrace,
  RuntimeEnv,
  SourceContext,
  SourceManifest,
  SourceModule,
  SourceStage,
  SourceTrace,
} from '@source/sdk'
import { MemoryCache, MemoryCookieStore, MemoryKV } from './memoryStores.ts'
import { isAllowedByDomainPermission } from './permissions.ts'

export interface RuntimeCallInput<TArgs = unknown> {
  name: string
  args: TArgs
  settings?: Record<string, unknown>
}

export interface RuntimeCallOutput<TResult = unknown> {
  result: TResult
  trace: SourceTrace
}

export class SourceRuntime {
  private storage = new MemoryKV()
  private secret = new MemoryKV()
  private cache = new MemoryCache()
  private cookie = new MemoryCookieStore()

  constructor(
    private readonly sourceModule: SourceModule & { manifest: SourceManifest },
  ) {}

  get manifest() {
    return this.sourceModule.manifest
  }

  async call<TArgs = unknown, TResult = unknown>(input: RuntimeCallInput<TArgs>): Promise<RuntimeCallOutput<TResult>> {
    const exported = this.sourceModule[input.name]
    if (typeof exported !== 'function') {
      throw new Error(`Export not found: ${input.name}`)
    }

    const requests: FetchTrace[] = []
    const logs: SourceTrace['logs'] = []
    const startedAt = Date.now()
    const previousFetch = globalThis.fetch

    const traceLog = (level: 'debug' | 'info' | 'warn' | 'error', args: unknown[]) => {
      logs.push({
        level,
        message: args.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' '),
        time: Date.now(),
        data: args,
      })
    }

    const ctx: SourceContext<TArgs> = {
      source: {
        id: this.manifest.id,
        name: this.manifest.name,
        version: this.manifest.version,
        baseUrl: this.manifest.baseUrl,
        settings: {
          ...defaultSettings(this.manifest),
          ...(input.settings ?? {}),
        },
      },
      env: runtimeEnv(),
      args: input.args,
      storage: this.storage,
      secret: this.secret,
      cache: this.cache,
      cookie: this.cookie,
      browser: {
        async open(browserInput) {
          traceLog('info', ['browser.open', browserInput])
          return { url: browserInput.url }
        },
      },
      log: {
        debug: (...args) => traceLog('debug', args),
        info: (...args) => traceLog('info', args),
        warn: (...args) => traceLog('warn', args),
        error: (...args) => traceLog('error', args),
      },
      utils: {
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
        uuid: () => crypto.randomUUID(),
        error(input) {
          const error = new Error(input.message) as any
          error.code = input.code
          error.stage = input.stage
          error.recoverable = input.recoverable
          error.data = input.data
          return error
        },
        assert(condition, errorInput) {
          if (!condition) throw this.error(errorInput)
        },
      },
    }

    globalThis.fetch = this.createFetchWrapper(previousFetch.bind(globalThis), requests)

    try {
      const result = await exported(ctx)
      return {
        result: result as TResult,
        trace: {
          sourceId: this.manifest.id,
          function: input.name,
          stage: input.name as SourceStage,
          args: input.args,
          requests,
          logs,
          result,
          durationMs: Date.now() - startedAt,
        },
      }
    } catch (error) {
      const runtimeError = normalizeError(error)
      return {
        result: undefined as TResult,
        trace: {
          sourceId: this.manifest.id,
          function: input.name,
          stage: input.name as SourceStage,
          args: input.args,
          requests,
          logs,
          error: runtimeError,
          durationMs: Date.now() - startedAt,
        },
      }
    } finally {
      globalThis.fetch = previousFetch
    }
  }

  private createFetchWrapper(nativeFetch: typeof fetch, requests: FetchTrace[]): typeof fetch {
    const manifest = this.manifest
    const cookie = this.cookie

    return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const request = new Request(input, init)
      const url = request.url
      const method = request.method || 'GET'
      const startedAt = Date.now()
      const item: FetchTrace = { url, method }
      requests.push(item)

      try {
        if (!isAllowedByDomainPermission(url, manifest.permissions?.network)) {
          throw Object.assign(new TypeError(`Network permission denied: ${new URL(url).hostname}`), {
            code: 'PERMISSION_DENIED',
          })
        }

        const headers = new Headers(request.headers)
        if (isAllowedByDomainPermission(url, manifest.permissions?.cookie)) {
          const cookieHeader = await cookie.get(url)
          if (cookieHeader && !headers.has('cookie')) headers.set('cookie', cookieHeader)
        }

        const proxiedRequest = new Request(request, { headers })
        const response = await nativeFetch(proxiedRequest)
        item.status = response.status
        item.durationMs = Date.now() - startedAt

        if (isAllowedByDomainPermission(url, manifest.permissions?.cookie)) {
          await cookie.storeFromResponse(url, response.headers)
        }

        return response
      } catch (error) {
        item.error = String(error)
        item.durationMs = Date.now() - startedAt
        throw error
      }
    }) as typeof fetch
  }
}

function defaultSettings(manifest: SourceManifest): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const setting of manifest.settings ?? []) {
    if ('defaultValue' in setting && setting.defaultValue !== undefined) {
      result[setting.key] = setting.defaultValue
    }
  }
  return result
}

function runtimeEnv(): RuntimeEnv {
  return {
    platform: 'node',
    appVersion: '0.1.0',
    sdkVersion: '0.1.0',
    language: 'zh-CN',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    userAgent: 'SourceRuntimeLab/0.1 Bun',
    capabilities: {
      fetch: {
        streamingResponseBody: true,
        streamingRequestBody: true,
        blob: true,
        file: typeof File !== 'undefined',
        formData: typeof FormData !== 'undefined',
        automaticCookieJar: true,
        manualRedirect: true,
      },
      crypto: {
        subtle: !!globalThis.crypto?.subtle,
      },
      binary: {
        textEncoder: typeof TextEncoder !== 'undefined',
        textDecoder: typeof TextDecoder !== 'undefined',
        atob: typeof atob !== 'undefined',
        btoa: typeof btoa !== 'undefined',
        compressionStream: typeof CompressionStream !== 'undefined',
        decompressionStream: typeof DecompressionStream !== 'undefined',
      },
      timer: {
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
      },
      module: {
        esm: true,
        dynamicImport: true,
      },
    },
  }
}

function normalizeError(error: unknown): any {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code ?? 'UNKNOWN',
      stage: (error as any).stage,
      recoverable: (error as any).recoverable,
      data: (error as any).data,
    }
  }
  return {
    name: 'Error',
    message: String(error),
    code: 'UNKNOWN',
  }
}
