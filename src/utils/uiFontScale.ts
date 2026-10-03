// 화면 글자 크기: 창 너비에 맞춰 자동으로 키우거나(기본), 계정 메뉴에서 직접 고른다(작게 · 보통 · 크게 · 아주 크게)(이 브라우저에 기억).
// 글자 크기만 --ui-fs 배율로 바뀐다(여백 · 버튼 높이 · 메뉴 위치는 그대로). 추진현황 입력 표는 이 배율을 쓰지 않는다.
export type FontPref = 'auto' | 'small' | 'normal' | 'large' | 'xlarge'
const KEY = 'ui-font-scale'
const EVENT = 'ui-font-scale-change'
const FIXED: Record<Exclude<FontPref, 'auto'>, number> = { small: 0.93, normal: 1, large: 1.1, xlarge: 1.2 }
export const FONT_PREF_LABEL: Record<FontPref, string> = { auto: '자동', small: '작게', normal: '보통', large: '크게', xlarge: '아주 크게' }

// 창 너비(CSS px) → 배율: 노트북 그대로, 큰 모니터일수록 조금씩
export function autoScale(width: number): number {
  if (width >= 2560) return 1.25
  if (width >= 1920) return 1.14
  if (width >= 1680) return 1.07
  return 1
}

export function readFontPref(): FontPref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'small' || v === 'normal' || v === 'large' || v === 'xlarge' ? v : 'auto'
  } catch {
    return 'auto'
  }
}

export function currentScale(pref = readFontPref()): number {
  return pref === 'auto' ? autoScale(window.innerWidth) : FIXED[pref]
}

function apply() {
  document.documentElement.style.setProperty('--ui-fs', String(currentScale()))
}

export function setFontPref(pref: FontPref) {
  try {
    if (pref === 'auto') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // 기억 못 해도 지금 화면엔 반영
  }
  apply()
  window.dispatchEvent(new Event(EVENT))
}

export function onFontPrefChange(fn: () => void) {
  window.addEventListener(EVENT, fn)
  return () => window.removeEventListener(EVENT, fn)
}

// 앱을 열 때 한 번: 지금 배율을 걸고, 창 크기가 바뀌면(자동일 때) 다시 맞춘다
export function startUiFontScale() {
  apply()
  let t = 0
  window.addEventListener('resize', () => {
    window.clearTimeout(t)
    t = window.setTimeout(apply, 120)
  })
}
