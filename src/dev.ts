const commands = [
  ['bun', 'run', 'dev:server'],
  ['bun', 'run', 'dev:web'],
]

const children = commands.map((cmd) => {
  const child = Bun.spawn(cmd, {
    stdout: 'inherit',
    stderr: 'inherit',
    stdin: 'inherit',
  })
  return child
})

function shutdown() {
  for (const child of children) child.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await Promise.all(children.map((child) => child.exited))

export {}
