import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { getSourceModule, sourceModules } from './sources/index.ts'
import { SourceRuntime } from './runtime/sourceRuntime.ts'

const runtimeCache = new Map<string, SourceRuntime>()
const root = new URL('..', import.meta.url).pathname

function runtimeFor(sourceId?: string) {
  const source = getSourceModule(sourceId)
  let runtime = runtimeCache.get(source.manifest.id)
  if (!runtime) {
    runtime = new SourceRuntime(source)
    runtimeCache.set(source.manifest.id, runtime)
  }
  return runtime
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: { 'content-type': 'application/json; charset=utf-8', ...(init?.headers || {}) },
  })
}

async function readBody(request: Request) {
  try { return await request.json() } catch { return {} }
}

async function serveSourceFile(sourceId?: string) {
  const source = getSourceModule(sourceId)
  const file = join(root, 'src', 'sources', source.manifest.entry)
  return new Response(await readFile(file, 'utf8'), { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

const server = Bun.serve({
  port: 8787,
  async fetch(request) {
    const url = new URL(request.url)
    try {
      if (url.pathname === '/api/sources') {
        return json(sourceModules.map((source) => source.manifest))
      }
      if (url.pathname === '/api/manifest') {
        return json(runtimeFor(url.searchParams.get('sourceId') || undefined).manifest)
      }
      if (url.pathname === '/api/source') {
        return serveSourceFile(url.searchParams.get('sourceId') || undefined)
      }
      if (url.pathname === '/api/call' && request.method === 'POST') {
        const body = await readBody(request)
        const runtime = runtimeFor(body.sourceId)
        const output = await runtime.call({ name: body.name, args: body.args, settings: body.settings })
        return json(output)
      }
      if (url.pathname === '/') {
        return new Response('Source Runtime Lab API is running. Open http://localhost:5173', { headers: { 'content-type': 'text/plain; charset=utf-8' } })
      }
      return json({ error: 'Not found' }, { status: 404 })
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }, { status: 500 })
    }
  },
})

console.log(`Source Runtime Lab API: http://localhost:${server.port}`)
