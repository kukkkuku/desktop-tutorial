// 화면 테마(색 · 모서리 · 그림자 묶음). 값은 src/theme.css, 고른 것은 이 브라우저에 기억하고 <html data-theme>에 건다.
// 새 테마 = theme.css에 블록 하나 + 아래 목록에 한 줄.
export type ThemeKey = 'classic' | 'orange' | 'black' | 'blue'

export const THEMES: { key: ThemeKey; label: string; desc: string; dots: [string, string] }[] = [
  { key: 'classic', label: '원래 디자인', desc: '회색 바탕 · 파란 포인트', dots: ['#F4F4F5', '#2563EB'] },
  { key: 'orange', label: '오렌지 포인트', desc: '심플 · 오렌지', dots: ['#F6F6F7', '#F26B1D'] },
  { key: 'black', label: '블랙 포인트', desc: '유리 카드 · 검정', dots: ['#EEEEF1', '#18181B'] },
  { key: 'blue', label: '블루 포인트', desc: '푸른 유리 · 파랑', dots: ['#E8EEF5', '#0A72F5'] },
]

const KEY = 'ui-theme'
const EVENT = 'ui-theme-change'
export const DEFAULT_THEME: ThemeKey = 'orange'

export function readTheme(): ThemeKey {
  try {
    const v = localStorage.getItem(KEY)
    if (THEMES.some((t) => t.key === v)) return v as ThemeKey
  } catch {
    // 못 읽으면 기본 테마
  }
  return DEFAULT_THEME
}

function apply(t: ThemeKey) {
  document.documentElement.setAttribute('data-theme', t)
}

export function setTheme(t: ThemeKey) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // 기억 못 해도 지금 화면에는 반영
  }
  apply(t)
  window.dispatchEvent(new Event(EVENT))
}

export function onThemeChange(fn: () => void) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

// 앱을 그리기 전에 한 번 -- 깜빡임 없이 고른 테마로 시작
export function startUiTheme() {
  apply(readTheme())
}
