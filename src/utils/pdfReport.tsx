import { createRoot } from 'react-dom/client'
import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
import '@fontsource/pretendard/400.css'
import '@fontsource/pretendard/600.css'
import '@fontsource/pretendard/700.css'
import '@fontsource/pretendard/800.css'

// PDF 리포트 -- 엑셀(원본 데이터 그대로)과 달리 "지금 이 시점의 현황을 한눈에
// 보여주는 인쇄용 보고서"다. 포인트 컬러는 오렌지(브랜드 accent) 하나만
// 쓰고 나머지는 흑백/회색조로 통일한다(참고 이미지 스타일). Pretendard를
// 이 리포트에만 스코프해서 로드한다 -- 앱 전체 폰트를 바꾸는 게 아니라
// 문서 출력물의 톤을 맞추는 용도라서.
const PAGE_WIDTH_PX = 794 // A4 210mm @ 96dpi
const PAGE_HEIGHT_PX = 1123 // A4 297mm @ 96dpi
const CAPTURE_SCALE = 2

const ACCENT = '#2563EB'
const INK = '#111827'
const SUBTLE = '#6B7280'
const LINE = '#E5E7EB'
const PANEL = '#F3F4F6'

export interface ReportStat {
  label: string
  value: string
  emphasize?: boolean
}

export interface ReportSection {
  title: string
  countLabel?: string
  columns: string[]
  // 각 셀은 문자열/숫자, 또는 { text, emphasize }로 강조(오렌지) 표시 가능.
  rows: (string | number | { text: string; emphasize?: boolean })[][]
  emptyLabel?: string
}

export interface ReportOptions {
  teamName: string
  periodName: string
  title: string
  stats: ReportStat[]
  sections: ReportSection[]
  fileName: string
}

function fmtDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${m}.${day}`
}

function Cell({ value }: { value: string | number | { text: string; emphasize?: boolean } }) {
  if (typeof value === 'object') {
    return <span style={{ color: value.emphasize ? ACCENT : INK, fontWeight: value.emphasize ? 700 : 400 }}>{value.text}</span>
  }
  return <>{value}</>
}

function ReportDocument({ teamName, periodName, title, stats, sections }: ReportOptions) {
  return (
    <div style={{ width: PAGE_WIDTH_PX, background: '#fff', color: INK, fontFamily: '"Pretendard", sans-serif' }}>
      <div style={{ height: 6, background: ACCENT }} />
      <div style={{ padding: '32px 44px 48px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: SUBTLE }}>
          <span>
            {teamName} · {periodName} · 생성일 {fmtDate(new Date())}
          </span>
          <span>작성: {teamName} 성과관리</span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginTop: 8, marginBottom: 0 }}>{title}</h1>

        {stats.length > 0 && (
          <div
            data-nosplit
            style={{
              marginTop: 22,
              background: PANEL,
              borderRadius: 10,
              display: 'grid',
              gridTemplateColumns: `repeat(${stats.length}, 1fr)`,
              padding: '18px 0',
            }}
          >
            {stats.map((s, i) => (
              <div key={i} style={{ textAlign: 'center', borderLeft: i > 0 ? `1px solid ${LINE}` : 'none' }}>
                <div style={{ fontSize: 11, color: SUBTLE }}>{s.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6, color: s.emphasize ? ACCENT : INK }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {sections.map((section, si) => (
          <div key={si} style={{ marginTop: 32 }}>
            <div data-nosplit style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{section.title}</h2>
              {section.countLabel && <span style={{ fontSize: 12, fontWeight: 700, color: ACCENT }}>{section.countLabel}</span>}
            </div>
            <table style={{ width: '100%', marginTop: 12, borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr data-nosplit style={{ borderBottom: `2px solid ${INK}` }}>
                  {section.columns.map((c, ci) => (
                    <th key={ci} style={{ textAlign: 'left', padding: '9px 10px', color: SUBTLE, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.length === 0 ? (
                  <tr data-nosplit>
                    <td colSpan={section.columns.length} style={{ padding: '18px 10px', textAlign: 'center', color: SUBTLE }}>
                      {section.emptyLabel ?? '데이터가 없습니다.'}
                    </td>
                  </tr>
                ) : (
                  section.rows.map((row, ri) => (
                    <tr key={ri} data-nosplit style={{ borderBottom: `1px solid ${LINE}` }}>
                      {row.map((cell, ci) => (
                        <td key={ci} style={{ padding: '9px 10px' }}>
                          <Cell value={cell} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  )
}

// html2canvas는 레이아웃을 이해하지 못하고 픽셀 그대로 찍기 때문에, 그냥
// 페이지 높이로 나누면 표의 행 중간이 페이지 경계에서 잘린다. 캡처 전에
// data-nosplit로 표시된 블록(헤더 행/데이터 행/통계 박스)이 페이지 경계를
// 넘어갈 것 같으면 margin-top으로 다음 페이지 시작까지 밀어내서, 자르는
// 시점에는 항상 블록 사이에서만 잘리게 만든다.
function preventBlockSplits(container: HTMLElement, pageHeightPx: number) {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>('[data-nosplit]'))
  const containerTop = container.getBoundingClientRect().top
  let extraShift = 0
  for (const el of blocks) {
    const rect = el.getBoundingClientRect()
    const top = rect.top - containerTop + extraShift
    const height = rect.height
    const bottom = top + height
    if (height >= pageHeightPx) continue // 페이지보다 큰 블록은 어차피 못 피함
    const pageIndexTop = Math.floor(top / pageHeightPx)
    const pageIndexBottom = Math.floor((bottom - 0.01) / pageHeightPx)
    if (pageIndexTop !== pageIndexBottom) {
      const nextPageStart = (pageIndexTop + 1) * pageHeightPx
      const push = nextPageStart - top
      el.style.marginTop = `${parseFloat(getComputedStyle(el).marginTop || '0') + push}px`
      extraShift += push
    }
  }
}

// createRoot().render()는 React 이벤트 핸들러 안에서 호출되면 커밋이
// 비동기로 배치될 수 있어서, 고정된 rAF 횟수만 기다리면 다른 작업(예:
// 같은 핸들러에서 먼저 실행된 엑셀 다운로드)과 겹칠 때 드물게 커밋 전에
// 다음 단계로 넘어가 버린다. 실제로 DOM에 반영될 때까지 폴링해서 기다린다.
async function waitForMount(container: HTMLElement): Promise<HTMLElement> {
  const deadline = Date.now() + 5000
  while (!container.firstElementChild) {
    if (Date.now() > deadline) throw new Error('PDF 렌더링이 시간 내에 완료되지 않았습니다.')
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  return container.firstElementChild as HTMLElement
}

// PDF를 Blob으로 빌드만 하고 저장은 하지 않는다 -- 단일 다운로드(downloadPdfReport)와
// 여러 팀원분을 하나의 zip으로 묶는 경로(pdfReports.ts) 양쪽에서 재사용한다.
export async function buildPdfBlob(options: ReportOptions): Promise<Blob> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-9999px'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  root.render(<ReportDocument {...options} />)

  const docEl = await waitForMount(container)
  // 폰트 로드 + 레이아웃이 안정될 때까지 한 프레임 더 대기.
  await document.fonts.ready
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

  preventBlockSplits(docEl, PAGE_HEIGHT_PX)
  // 마지막 페이지 아래 여백이 표 마지막 줄을 다음 페이지로 밀어내지 않도록
  // 한 번 더 강제 리플로우.
  void docEl.offsetHeight

  const canvas = await html2canvas(docEl, { scale: CAPTURE_SCALE, backgroundColor: '#ffffff', useCORS: true })

  root.unmount()
  document.body.removeChild(container)

  const pdf = new jsPDF({ unit: 'px', format: [PAGE_WIDTH_PX, PAGE_HEIGHT_PX], orientation: 'portrait', compress: true })
  const scaledPageHeight = PAGE_HEIGHT_PX * CAPTURE_SCALE
  let y = 0
  let pageIndex = 0
  while (y < canvas.height) {
    const sliceHeight = Math.min(scaledPageHeight, canvas.height - y)
    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeight
    const ctx = pageCanvas.getContext('2d')!
    // 흰 배경으로 먼저 채워야 한다 -- JPEG는 투명도가 없어서 안 채우면 검은
    // 배경이 된다.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, y, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight)

    if (pageIndex > 0) pdf.addPage([PAGE_WIDTH_PX, PAGE_HEIGHT_PX], 'portrait')
    const imgHeightPx = sliceHeight / CAPTURE_SCALE
    // 대부분 흰 배경+텍스트/표라 PNG보다 JPEG(고품질)가 훨씬 작다 -- PNG로
    // 뽑으면 한 페이지짜리 리포트도 수 MB씩 나갔다.
    pdf.addImage(pageCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_WIDTH_PX, imgHeightPx)

    y += sliceHeight
    pageIndex += 1
  }

  return pdf.output('blob')
}

export async function downloadPdfReport(options: ReportOptions) {
  const blob = await buildPdfBlob(options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = options.fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
