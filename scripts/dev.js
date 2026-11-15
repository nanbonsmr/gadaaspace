import { spawn } from 'node:child_process'

const children = [
  spawn(process.execPath, ['server/index.js'], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: process.env }),
]
let closing = false
const stop = (code = 0) => {
  if (closing) return
  closing = true
  for (const child of children) if (!child.killed) child.kill('SIGTERM')
  process.exitCode = code
}
for (const child of children) {
  child.on('error', (error) => { console.error('Development process failed to start:', error.message); stop(1) })
  child.on('exit', (code) => { if (!closing && code) stop(code) })
}
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
