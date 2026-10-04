import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 빌드마다 바뀌는 버전 표시. 앱은 이 값을 품고, 배포된 version.json과 다르면 「새 버전 · 새로고침」 알림을 띄운다.
const BUILD_ID = new Date().toISOString()

// 업데이트 내용: release-notes.json 맨 위 항목(배포할 때 한 줄씩 적는다)
function latestNotes(): string[] {
  try {
    const list = JSON.parse(readFileSync(new URL('./release-notes.json', import.meta.url), 'utf8')) as { items?: string[] }[]
    return list[0]?.items ?? []
  } catch {
    return []
  }
}

function versionFile(): Plugin {
  return {
    name: 'version-file',
    apply: 'build',
    // index.html에도 같은 id를 적어 둔다 -- 새로고침 전에 새 index.html이 정말 내려오는지 확인용(UpdateToast)
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'app-build', content: BUILD_ID }, injectTo: 'head' }]
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD_ID, notes: latestNotes() }) })
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE_PATH ?? '/desktop-tutorial/') : '/',
  plugins: [react(), versionFile()],
  define: { __APP_BUILD__: JSON.stringify(BUILD_ID) },
}))
