import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 버전 표시 = 마지막 커밋 시각(UTC ISO). 앱은 이 값을 품고, 배포된 version.json이 더 새것이면 「새 버전 · 새로고침」 알림을 띄운다.
// 빌드 시각을 쓰면 코드가 같아도 배포를 다시 돌릴 때마다(main 푸시 · 미리보기 배포) 번호가 바뀌어 알림이 또 떴다.
// 시각 문자열이라 크기 비교로 어느 쪽이 새것인지 안다. git을 못 읽으면 빌드 시각.
function buildId(): string {
  try {
    return new Date(execSync('git log -1 --format=%cI', { encoding: 'utf8' }).trim()).toISOString()
  } catch {
    return new Date().toISOString()
  }
}
const BUILD_ID = buildId()

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
