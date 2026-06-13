import { readdir, rm, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const sourcesDir = join(root, 'src', 'sources')
const tempDir = join(root, '.source-build')
const outputDir = join(root, 'dist', 'sources')
const selected = new Set(process.argv.slice(2).map((name) => name.replace(/\.tsx?$/, '')))

async function sourceNames() {
  const entries = await readdir(sourcesDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.d.ts'))
    .map((name) => basename(name, '.ts'))
    .filter((name) => selected.size === 0 || selected.has(name))
    .sort((a, b) => a.localeCompare(b))
}

function wrapperSource(name: string) {
  const entry = `${name}.js`
  return `
import source from '../src/sources/${name}.ts'

const { module: sourceModule, ...manifest } = source
const runtimeModule: Record<string, unknown> = {
  ...sourceModule,
  manifest: {
    ...manifest,
    entry: ${JSON.stringify(entry)},
  },
}

;(globalThis as any).__sourceModule = runtimeModule
`
}

async function buildOne(name: string) {
  const wrapperPath = join(tempDir, `${name}.ts`)
  const outputPath = join(outputDir, `${name}.js`)
  await Bun.write(wrapperPath, wrapperSource(name))

  const proc = Bun.spawn(
    [
      'bun',
      'build',
      '--target=browser',
      '--format=iife',
      '--sourcemap=none',
      `--outfile=${outputPath}`,
      wrapperPath,
    ],
    {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    }
  )
  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if (exitCode !== 0) {
    throw new Error(`Build failed for ${name}\n${stdout}${stderr}`)
  }
  console.log(`built ${name} -> dist/sources/${name}.js`)
}

await rm(tempDir, { recursive: true, force: true })
await rm(outputDir, { recursive: true, force: true })
await mkdir(tempDir, { recursive: true })
await mkdir(outputDir, { recursive: true })

const names = await sourceNames()
if (names.length === 0) {
  throw new Error(selected.size === 0 ? 'No source files found' : `No matching sources: ${[...selected].join(', ')}`)
}

for (const name of names) {
  await buildOne(name)
}

await rm(tempDir, { recursive: true, force: true })
console.log(`built ${names.length} source bundle${names.length === 1 ? '' : 's'}`)
