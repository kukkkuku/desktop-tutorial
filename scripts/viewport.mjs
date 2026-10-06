// Chrome을 띄워 원하는 해상도로 앱을 확인하는 개발용 도구.
//   npm run viewport -- [url] [--size 1440x900 | --preset tablet] [--headless] [--shot out.png]
// 실행 중에는 터미널에서 해상도를 바꿀 수 있다: "1280x720", "mobile", "list", "shot", "q"
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const PRESETS = {
  mobile: [390, 844],
  'mobile-small': [360, 640],
  tablet: [768, 1024],
  'tablet-landscape': [1024, 768],
  laptop: [1366, 768],
  desktop: [1440, 900],
  fhd: [1920, 1080],
  qhd: [2560, 1440],
}

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const url = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? 'http://localhost:5173/'

const parseSize = (s) => {
  if (!s) return null
  if (PRESETS[s]) return PRESETS[s]
  const m = /^(\d{2,5})\s*[x×*]\s*(\d{2,5})$/i.exec(s.trim())
  return m ? [Number(m[1]), Number(m[2])] : null
}

let [width, height] = parseSize(opt('size') ?? opt('preset')) ?? PRESETS.desktop
const headless = args.includes('--headless') || (!process.env.DISPLAY && process.platform === 'linux')
const shotPath = opt('shot')

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/opt/pw-browsers/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ]
  return candidates.find(existsSync)
}

const isUp = () => fetch(url).then(() => true, () => false)
let devServer
if (!(await isUp()) && /^https?:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
  console.log('개발 서버를 시작합니다...')
  devServer = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'dev'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'ignore', shell: process.platform === 'win32' })
  for (let i = 0; i < 60 && !(await isUp()); i++) await new Promise((r) => setTimeout(r, 500))
}
process.on('exit', () => devServer?.kill())

const browser = await chromium.launch({
  headless,
  executablePath: findChrome(),
  args: headless ? [] : [`--window-size=${width},${height + 90}`],
})
const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
const page = await context.newPage()
await page.goto(url, { waitUntil: 'load' })

const resize = async (w, h) => {
  ;[width, height] = [w, h]
  await page.setViewportSize({ width, height })
  console.log(`해상도: ${width}x${height}`)
}
const shot = async (path = `viewport-${width}x${height}.png`) => {
  await page.screenshot({ path, fullPage: false })
  console.log(`저장: ${path}`)
}

console.log(`${url} — ${width}x${height}${headless ? ' (headless)' : ''}`)
if (shotPath) {
  await shot(shotPath)
  await browser.close()
  process.exit(0)
}

if (!headless && !args.includes('--no-panel')) {
  const panel = await (await browser.newContext({ viewport: { width: 340, height: 360 } })).newPage()
  await panel.exposeFunction('setSize', (w, h) => resize(w, h))
  await panel.exposeFunction('takeShot', () => shot())
  await panel.setContent(`<!doctype html><meta charset="utf-8"><title>해상도 조절</title>
<style>body{font:14px system-ui;margin:16px}button{margin:3px;padding:6px 10px;cursor:pointer}input{width:60px;padding:5px}#cur{font-weight:700;margin:8px 0}</style>
<div id="cur">${width} x ${height}</div>
<div id="p"></div><hr>
<input id="w" type="number" value="${width}"> x <input id="h" type="number" value="${height}">
<button onclick="go(+w.value,+h.value)">적용</button><br>
<button onclick="takeShot()">스크린샷 저장</button>
<script>
const P=${JSON.stringify(PRESETS)};
function go(a,b){setSize(a,b);cur.textContent=a+' x '+b;w.value=a;h.value=b}
for(const [k,[a,b]] of Object.entries(P)){const e=document.createElement('button');e.textContent=k+' '+a+'x'+b;e.onclick=()=>go(a,b);p.append(e)}
</script>`)
}

console.log(`입력: WxH | ${Object.keys(PRESETS).join(' | ')} | shot | q`)
const rl = createInterface({ input: process.stdin })
const quit = async () => {
  await browser.close().catch(() => {})
  process.exit(0)
}
browser.on('disconnected', () => process.exit(0))
let queue = Promise.resolve()
rl.on('close', () => queue.then(quit))
rl.on('line', (line) => {
  queue = queue.then(() => handle(line)).catch((e) => console.error(e.message))
})
async function handle(line) {
  const cmd = line.trim()
  if (cmd === 'q' || cmd === 'quit') return quit()
  if (cmd === 'list') return console.log(Object.entries(PRESETS).map(([k, [w, h]]) => `${k}: ${w}x${h}`).join('\n'))
  if (cmd === 'shot') return shot()
  const size = parseSize(cmd)
  if (size) await resize(...size)
  else if (cmd) console.log('알 수 없는 입력 (예: 1280x720, tablet, list, shot, q)')
}
