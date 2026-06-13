import { mkdir, readdir } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

type SourceManifest = {
  name?: string
  description?: string
  groups?: string[]
}

type Options = {
  prefix: string
  output: string
  selected: string[]
}

const root = new URL('..', import.meta.url).pathname
const sourcesDir = join(root, 'src', 'sources')
const distDir = join(root, 'dist')
const defaultOutput = join(distDir, 'subscription.json')

function usage(): never {
  throw new Error([
    'Usage:',
    '  bun run build:subscription -- --prefix https://example.com/sources',
    '  bun run build:subscription -- --prefix https://example.com/sources qimaoJh fanqieFqgo',
    '',
    'Options:',
    '  --prefix, --prefix-url <url>  Base URL used to build each JS source URL',
    '  --out <path>                 Output JSON file, default: dist/subscription.json',
    '',
    'Env:',
    '  ITURN_SOURCE_PREFIX          Fallback prefix URL',
  ].join('\n'))
}

function parseArgs(argv: string[]): Options {
  let prefix = Bun.env.ITURN_SOURCE_PREFIX || ''
  let output = defaultOutput
  const selected: string[] = []

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]

    if (arg === '--prefix' || arg === '--prefix-url') {
      prefix = argv[++index] || ''
      continue
    }
    if (arg.startsWith('--prefix=')) {
      prefix = arg.slice('--prefix='.length)
      continue
    }
    if (arg.startsWith('--prefix-url=')) {
      prefix = arg.slice('--prefix-url='.length)
      continue
    }
    if (arg === '--out') {
      output = argv[++index] || ''
      continue
    }
    if (arg.startsWith('--out=')) {
      output = arg.slice('--out='.length)
      continue
    }
    if (arg === '-h' || arg === '--help') {
      usage()
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
    selected.push(arg.replace(/\.tsx?$/, ''))
  }

  if (!prefix.trim()) usage()

  return { prefix: prefix.trim(), output, selected }
}

async function sourceNames(selected: string[]) {
  const selectedSet = new Set(selected)
  const entries = await readdir(sourcesDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .map((name) => basename(name, '.ts'))
    .filter((name) => selectedSet.size === 0 || selectedSet.has(name))
    .sort((a, b) => a.localeCompare(b))
}

async function buildSources(names: string[]) {
  const proc = Bun.spawn(['bun', 'run', 'scripts/build-sources.ts', ...names], {
    cwd: root,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`build:sources failed with exit code ${exitCode}`)
  }
}

function sourceURL(prefix: string, filename: string) {
  const normalizedPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
  return new URL(encodeURI(filename), normalizedPrefix).toString()
}

async function manifestFor(name: string): Promise<SourceManifest> {
  const moduleURL = new URL(`../src/sources/${name}.ts`, import.meta.url).href
  const module = await import(`${moduleURL}?subscription=${Date.now()}`)
  return module.default || {}
}

const options = parseArgs(process.argv.slice(2))
const names = await sourceNames(options.selected)
if (names.length === 0) {
  throw new Error(options.selected.length === 0 ? 'No source files found' : `No matching sources: ${options.selected.join(', ')}`)
}

await buildSources(names)

const subscription = []
for (const name of names) {
  const manifest = await manifestFor(name)
  subscription.push({
    name: manifest.name || name,
    source: sourceURL(options.prefix, `${name}.js`),
    kind: 'iturn',
    comment: manifest.description || manifest.groups?.join(', ') || '',
  })
}

await mkdir(dirname(options.output), { recursive: true })
await Bun.write(options.output, `${JSON.stringify(subscription, null, 2)}\n`)
console.log(`built subscription -> ${options.output}`)
