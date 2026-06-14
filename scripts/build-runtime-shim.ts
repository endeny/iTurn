import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const entry = join(root, 'src', 'runtime', 'runtimeShim.ts')
const distOutput = join(root, 'dist', 'runtime', 'RuntimeShim.js')
const packageOutput = join(
  root,
  '..',
  'legado',
  'LegadoSwift',
  'Sources',
  'LegadoSwift',
  'DataSource',
  'RuntimeShim.js',
)

async function runBuild() {
  await mkdir(dirname(distOutput), { recursive: true })

  const proc = Bun.spawn(
    [
      'bun',
      'build',
      '--target=browser',
      '--format=esm',
      '--sourcemap=none',
      '--minify',
      `--outfile=${distOutput}`,
      entry,
    ],
    {
      cwd: root,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const [exitCode, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])

  if (exitCode !== 0) {
    throw new Error(`Build runtime shim failed\n${stdout}${stderr}`)
  }

  const js = await readFile(distOutput, 'utf8')
  if (/\bexport\s+\{/.test(js) || /\bimport\s+/.test(js)) {
    throw new Error('Runtime shim output must be a plain script without import/export syntax')
  }

  await mkdir(dirname(packageOutput), { recursive: true })
  await writeFile(packageOutput, js)
  console.log(`built runtime shim -> ${distOutput}`)
  console.log(`copied runtime shim -> ${packageOutput}`)
}

await runBuild()
