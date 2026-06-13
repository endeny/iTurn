declare const Bun: {
  serve(options: { port: number; fetch(request: Request): Response | Promise<Response> }): { port: number }
  spawn(command: string[], options?: { stdout?: 'inherit' | 'pipe'; stderr?: 'inherit' | 'pipe'; stdin?: 'inherit' | 'pipe' }): {
    stdout: ReadableStream<Uint8Array>
    stderr: ReadableStream<Uint8Array>
    exited: Promise<number>
    kill(): void
  }
}
