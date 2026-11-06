import { spawn, execFileSync } from 'node:child_process'
import { createServer } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const freePort = () => new Promise((resolve, reject) => {
  const server = createServer()
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => {
    const port = server.address().port
    server.close(error => error ? reject(error) : resolve(port))
  })
})
function findChrome() {
  for (const executable of [process.env.CHROME_BIN, 'google-chrome', 'chromium', 'chromium-browser']) {
    if (!executable) continue
    try { return execFileSync('which', [executable], { encoding: 'utf8' }).trim() }
    catch { continue }
  }
  throw new Error('Chrome or Chromium is required for browser integration')
}
function start(executable, args) {
  const child = spawn(executable, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  const append = buffer => { output = (output + String(buffer)).slice(-25000) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  return { child, output: () => output }
}
async function stop(process) {
  if (!process || process.child.exitCode !== null) return
  const child = process.child
  const closed = new Promise(resolve => child.once('close', resolve))
  child.kill()
  await Promise.race([closed, sleep(5000).then(() => { child.kill('SIGKILL') })])
}
async function poll(operation, timeout = 45000) {
  const end = Date.now() + timeout
  let last
  while (Date.now() < end) {
    try {
      const value = await operation()
      if (value) return value
    } catch (error) { last = error }
    await sleep(100)
  }
  throw new Error('Timed out waiting for browser/server: ' + String(last ?? ''))
}
async function connect(url) {
  const socket = new WebSocket(url)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  socket.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (!message.id) return
    const callback = pending.get(message.id)
    if (!callback) return
    pending.delete(message.id)
    message.error ? callback.reject(new Error(message.error.message)) : callback.resolve(message.result)
  })
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const key = ++id
    pending.set(key, { resolve, reject })
    socket.send(JSON.stringify({ id: key, method, params }))
  })
  return { send, close: () => socket.close() }
}

const port = await freePort(), debugPort = await freePort()
const profile = await mkdtemp(join(tmpdir(), 'rector-toc-chrome-'))
let vite, chrome, cdp
try {
  vite = start(process.execPath, [
    'rector/node_modules/vite/bin/vite.js', '--host', '127.0.0.1',
    '--port', String(port), '--strictPort',
  ])
  await poll(async () => {
    if (vite.child.exitCode !== null) throw new Error('Vite exited: ' + vite.output())
    const response = await fetch('http://127.0.0.1:' + port + '/test/browser/integration.html')
    return response.ok
  })
  chrome = start(findChrome(), [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
    '--remote-allow-origins=*',
    '--remote-debugging-port=' + debugPort,
    '--user-data-dir=' + profile, 'about:blank',
  ])
  const target = await poll(async () => {
    if (chrome.child.exitCode !== null) throw new Error('Chrome exited: ' + chrome.output())
    const response = await fetch('http://127.0.0.1:' + debugPort + '/json/list')
    const pages = await response.json()
    return pages.find(page => page.type === 'page')?.webSocketDebuggerUrl
  })
  cdp = await connect(target)
  await cdp.send('Page.enable')
  await cdp.send('Runtime.enable')
  const url = 'http://127.0.0.1:' + port + '/test/browser/integration.html'
  await cdp.send('Page.navigate', { url })
  const result = await poll(async () => {
    if (chrome.child.exitCode !== null) throw new Error('Chrome exited: ' + chrome.output())
    const response = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify({url:location.href,status:document.body?.dataset.status,result:document.querySelector("#result")?.textContent})',
      returnByValue: true,
    })
    if (response.exceptionDetails) throw new Error('Browser exception: ' + JSON.stringify(response.exceptionDetails))
    const value = JSON.parse(response.result?.value ?? 'null')
    // Fragment navigation is part of the TOC's public behavior. A hash
    // change stays on the same test page and must not hide a completed test.
    if (value?.url?.split('#')[0] !== url || !['pass', 'fail'].includes(value.status)) return null
    return value
  }, 120000)
  if (result.status !== 'pass') throw new Error('Real Rector browser integration failed:\n' + result.result)
  console.log('Real Rector browser integration: ' + result.result)
} finally {
  cdp?.close()
  await stop(chrome)
  await stop(vite)
  await rm(profile, { recursive: true, force: true })
}
