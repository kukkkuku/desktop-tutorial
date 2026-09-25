// 과제 입력 › 추진현황 -- 구글시트 「YYYY 추진현황」 탭을 통째로 읽어 L1마다 탭을 만들고,
// 탭마다 일정표(구분=L2, 항목=L3, 월·주 칸)를 시트와 같은 색으로 그린다.
// 입력한 칸은 "구글시트에 저장"으로 시트의 같은 칸(글자 + 배경색)에 쓴다.
import { useMemo, useRef, useState } from 'react'
import { CloudUpload, Eraser, Pencil, RefreshCw, RotateCcw, Search, Upload } from 'lucide-react'
import Button from '../Button'
import ConfirmDialog from '../ConfirmDialog'
import Spinner from '../Spinner'
import { icSm } from '../ui/icon'
import { parseSheet, type ParsedSheet, type RawSheet } from '../../utils/sheetImport'
import {
  chooseSheetsAccountNext,
  fetchSheetFills,
  fetchSheetTab,
  fetchSpreadsheetTabs,
  isSheetsApiConfigured,
  parseSheetUrl,
  pickDefaultTab,
  readXlsxBook,
  sheetUrl,
  writeSheetCells,
} from '../../utils/sheetSources'
import {
  NO_L1,
  TOOL_CELL,
  buildSheetWrites,
  isProtectedSheet,
  TASK_INPUT_SHEET_URL,
  readLinkedSheet,
  writeLinkedSheet,
  countEdits,
  currentWeekKey,
  effectiveCells,
  effectiveStatus,
  loadProgress,
  saveProgressData,
  saveProgressEdits,
  setCellEdit,
  setStatusEdit,
  toProgressRows,
  type PaintTool,
  type ProgressData,
  type ProgressEdits,
  type ProgressRow,
} from '../../utils/progressBoard'
import SheetLinkChip from '../SheetLinkChip'
import { withGoogleAccount } from '../../utils/googleDrive'
import ScheduleTable, { CellSwatch, cellLabel, type ScheduleRowView } from './ScheduleTable'

const CATEGORIES = ['과제', '일반', '일상']
const PERIODS: { label: string; start: number; months: number }[] = [
  { label: '전체', start: 1, months: 12 },
  { label: '상반기', start: 1, months: 6 },
  { label: '하반기', start: 7, months: 6 },
]
const TOOLS: PaintTool[] = ['S-plan', 'plan', 'F', 'S', 'actual', '완']

function splitPeople(raw: string): string[] {
  return raw
    .split(/[/,·\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function fmt(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function toData(parsed: ParsedSheet, meta: Pick<ProgressData, 'spreadsheetId' | 'source' | 'tabTitle' | 'sheetGid'>): ProgressData {
  return {
    ...meta,
    year: Number(meta.tabTitle.match(/(20\d{2})/)?.[1]) || null,
    fetchedAt: new Date().toISOString(),
    weekCols: parsed.header.weekCols.map(({ key, month, week, col }) => ({ key, month, week, col })),
    statusCol: parsed.columnMap.status ?? null,
    rows: toProgressRows(parsed.rows),
  }
}

// 시트에서 추진현황 탭을 값 + 주차 칸 배경색까지 읽는다.
async function readFromSheet(spreadsheetId: string, year: number): Promise<ProgressData> {
  const { title: fileTitle, tabs } = await fetchSpreadsheetTabs(spreadsheetId)
  const title = pickDefaultTab(tabs, year)
  const tab = tabs.find((t) => t.title === title)
  if (!title || !tab) throw new Error('시트에서 「추진현황」 탭을 찾지 못했습니다.')
  const raw: RawSheet = await fetchSheetTab(spreadsheetId, title)
  const first = parseSheet(raw)
  if ('error' in first) throw new Error(first.error)
  const cols = first.header.weekCols.map((w) => w.col)
  if (cols.length > 0 && raw.rows.length > first.header.dataStartRow)
    raw.fills = await fetchSheetFills(spreadsheetId, title, first.header.dataStartRow, raw.rows.length - 1, Math.min(...cols), Math.max(...cols))
  const parsed = parseSheet(raw)
  if ('error' in parsed) throw new Error(parsed.error)
  return { ...toData(parsed, { spreadsheetId, source: title, tabTitle: title, sheetGid: tab.sheetId }), fileTitle }
}

export default function ProgressBoard() {
  const initial = useMemo(() => loadProgress(), [])
  const [data, setData] = useState<ProgressData | null>(initial.data)
  const [edits, setEdits] = useState<ProgressEdits>(initial.edits)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirmSave, setConfirmSave] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const l1s = useMemo(() => Array.from(new Set((data?.rows ?? []).map((r) => r.l1))), [data])
  const [activeL1, setActiveL1] = useState<string | null>(null)
  const l1 = activeL1 && l1s.includes(activeL1) ? activeL1 : (l1s[0] ?? null)

  const now = new Date()
  const [period, setPeriod] = useState<{ start: number; months: number }>({ start: 1, months: 12 })
  const [person, setPerson] = useState('')
  const [cats, setCats] = useState<Set<string>>(new Set(CATEGORIES))
  const [hideDone, setHideDone] = useState(false)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState(false)
  const [tool, setTool] = useState<PaintTool>('S')

  function accept(next: ProgressData) {
    setData(next)
    saveProgressData(next)
    setError('')
  }

  const [sheetLink, setSheetLink] = useState<string>(() => readLinkedSheet() ?? TASK_INPUT_SHEET_URL)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkInput, setLinkInput] = useState('')

  // 다른 시트를 연결하면 그 시트에서 다시 불러온다. 고친 칸은 이전 시트 기준이라 비운다.
  async function connectSheet(url: string) {
    const link = parseSheetUrl(url)
    if (!link) {
      setError('구글시트 링크를 확인해 주세요. (https://docs.google.com/spreadsheets/d/…)')
      return
    }
    const clean = sheetUrl(link.spreadsheetId)
    setSheetLink(clean)
    writeLinkedSheet(clean === TASK_INPUT_SHEET_URL ? null : clean)
    setLinkOpen(false)
    updateEdits({})
    await loadFromSheet(false, clean)
  }

  async function loadFromSheet(pickAccount = false, url = sheetLink) {
    const link = parseSheetUrl(url)
    if (!link) return
    if (pickAccount) chooseSheetsAccountNext()
    setLoading(true)
    setError('')
    setMessage('')
    try {
      accept(await readFromSheet(link.spreadsheetId, now.getFullYear()))
    } catch (e) {
      setError(e instanceof Error ? e.message : '시트를 읽지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function loadFromFile(file: File) {
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const book = readXlsxBook(await file.arrayBuffer(), file.name)
      const title = pickDefaultTab(book.sheets.map((s) => ({ title: s.title, hidden: !!s.hidden })), now.getFullYear())
      const sheet = book.sheets.find((s) => s.title === title)
      if (!sheet) throw new Error('파일에서 「추진현황」 탭을 찾지 못했습니다.')
      const parsed = parseSheet(sheet)
      if ('error' in parsed) throw new Error(parsed.error)
      accept(toData(parsed, { spreadsheetId: null, source: `${file.name} · ${sheet.title}`, tabTitle: sheet.title, sheetGid: null }))
    } catch (e) {
      setError(e instanceof Error ? e.message : '파일을 읽지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function updateEdits(next: ProgressEdits) {
    setEdits(next)
    saveProgressEdits(next)
  }

  // 고친 칸만 시트에 쓴다. 쓰기 직전에 시트를 다시 읽어 행을 L2·L3로 다시 찾고,
  // 그사이 누군가 같은 칸을 바꿨으면(불러올 때와 다르면) 그 칸은 쓰지 않고 남겨 둔다.
  async function saveToSheet() {
    setConfirmSave(false)
    if (!data?.spreadsheetId || data.sheetGid === null) return
    if (isProtectedSheet(data.spreadsheetId)) {
      setError('운영 중인 팀 시트에는 저장하지 않습니다. 테스트 시트를 연결해 주세요.')
      return
    }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const fresh = await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear())
      if (fresh.tabTitle !== data.tabTitle) throw new Error(`시트의 추진현황 탭이 「${fresh.tabTitle}」로 바뀌었습니다. 다시 불러온 뒤 입력해 주세요.`)
      const { writes, kept, conflicts } = buildSheetWrites(data, fresh, edits)
      await writeSheetCells(data.spreadsheetId, data.sheetGid, writes)
      // 저장한 뒤 시트를 다시 읽어 화면을 시트와 맞춘다.
      accept(await readFromSheet(data.spreadsheetId, data.year ?? now.getFullYear()))
      updateEdits(kept)
      setMessage(
        `${writes.length}칸을 구글시트에 저장했습니다.` +
          (conflicts ? ` ${conflicts}칸은 불러온 뒤 시트에서 먼저 바뀌어 저장하지 않았습니다(주황 점으로 남겨 둠 · 확인 후 다시 저장).` : ''),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : '시트에 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const tabRows = useMemo(() => (data?.rows ?? []).filter((r) => r.l1 === l1), [data, l1])
  const people = useMemo(
    () => Array.from(new Set((data?.rows ?? []).flatMap((r) => splitPeople(r.values.assignees ?? '')))).sort((a, b) => a.localeCompare(b, 'ko')),
    [data],
  )

  if (!data) {
    return (
      <div className="mx-auto mt-10 max-w-xl rounded-[14px] border border-separator bg-white p-8 text-center">
        <h2 className="text-[17px] font-bold text-label">추진현황을 불러오세요</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-label-2">
          구글시트의 「{now.getFullYear()} 추진현황」 탭을 읽어 L1마다 일정표를 만듭니다.
          <br />
          시트를 볼 수 있는 구글 계정으로 한 번 권한을 허용하면 됩니다.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {isSheetsApiConfigured() && (
            <Button variant="primary" onClick={() => loadFromSheet()} disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : <RefreshCw {...icSm} />}
              구글시트에서 불러오기
            </Button>
          )}
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={loading} title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)">
            <Upload {...icSm} />
            xlsx 올리기
          </Button>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
        <p className="mt-4 text-[12px] text-label-3">
          {isProtectedSheet(parseSheetUrl(sheetLink)?.spreadsheetId)
            ? '지금 연결: 운영 팀 시트(읽기 전용 · 저장 안 함)'
            : sheetLink === TASK_INPUT_SHEET_URL
              ? '지금 연결: 테스트 시트(운영 시트의 사본)'
              : `지금 연결: ${sheetLink}`}{' '}
          <button onClick={() => setLinkOpen((v) => !v)} className="font-medium text-accent hover:underline">
            시트 바꾸기
          </button>
        </p>
        {linkOpen && <SheetLinkForm value={linkInput} onChange={setLinkInput} onSubmit={() => connectSheet(linkInput)} onCancel={() => setLinkOpen(false)} />}
        {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}
      </div>
    )
  }

  const weekCols = data.weekCols.filter((w) => w.month >= period.start && w.month < period.start + period.months)
  const currentKey = currentWeekKey(data.weekCols, data.year, now)
  const q = query.trim().toLowerCase()
  const views: ScheduleRowView[] = tabRows
    .map((row: ProgressRow) => {
      const e = edits[row.key]
      return {
        row,
        cells: effectiveCells(row, e),
        status: effectiveStatus(row, e),
        editedCells: new Set(Object.keys(e?.cells ?? {})),
        statusEdited: e?.status !== undefined,
      }
    })
    .filter((v) => {
      const cat = v.row.values.category ?? ''
      if (CATEGORIES.includes(cat) && !cats.has(cat)) return false
      if (hideDone && v.status === '완료') return false
      if (person && !splitPeople(v.row.values.assignees ?? '').includes(person)) return false
      if (q && !`${v.row.l2} ${v.row.l3} ${v.row.values.assignees ?? ''}`.toLowerCase().includes(q)) return false
      return true
    })
  const editCount = countEdits(edits)
  const protectedSheet = isProtectedSheet(data.spreadsheetId)
  const canSave = !!data.spreadsheetId && data.sheetGid !== null && isSheetsApiConfigured() && !protectedSheet
  const h = tabRows.find((r) => r.h)?.h
  const l2Count = new Set(tabRows.map((r) => r.l2)).size

  return (
    <div>
      {/* 연결된 시트(눌러서 링크 바꾸기) · 다시 불러오기 */}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-label-2">
        {data.spreadsheetId ? (
          <SheetLinkChip
            label={data.fileTitle || data.source}
            sub={data.fileTitle ? data.tabTitle : undefined}
            meta={
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-label-3">{fmt(data.fetchedAt)} 불러옴 · L3 {data.rows.length}건</span>
                {protectedSheet ? (
                  <span className="mac-badge bg-black/[0.06] text-label-2" title="운영 중인 팀 시트라 읽기만 하고 저장하지 않습니다">
                    운영 시트 · 읽기 전용
                  </span>
                ) : (
                  <span className="mac-badge bg-success/15 text-success">
                    {data.spreadsheetId === parseSheetUrl(TASK_INPUT_SHEET_URL)?.spreadsheetId ? '테스트 시트 · 저장 가능' : '저장 가능한 시트'}
                  </span>
                )}
              </span>
            }
            currentUrl={sheetUrl(data.spreadsheetId, data.sheetGid ?? undefined)}
            openUrl={withGoogleAccount(sheetUrl(data.spreadsheetId, data.sheetGid ?? undefined))}
            note="다른 시트 링크를 넣고 연결하면 그 시트의 「YYYY 추진현황」 탭을 읽고, 저장도 그 시트에 합니다. 운영 팀 시트는 읽기만 합니다."
            onConnect={(url) => connectSheet(url)}
            onReload={isSheetsApiConfigured() ? () => loadFromSheet() : undefined}
            reloadDisabled={saving}
            reloading={loading}
          />
        ) : (
          <span>
            <span className="font-medium text-label">{data.source}</span> · {fmt(data.fetchedAt)} 불러옴 · L3 {data.rows.length}건
            <button onClick={() => { setLinkInput(''); setLinkOpen((v) => !v) }} className="ml-2 font-medium text-accent hover:underline">
              구글시트 연결
            </button>
          </span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()} disabled={loading || saving} title="시트에서 파일 › 다운로드 › xlsx로 받은 파일(보기 전용)">
            <Upload {...icSm} />
            xlsx
          </Button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && loadFromFile(e.target.files[0])} />
        </span>
      </div>
      {linkOpen && (
        <SheetLinkForm
          value={linkInput}
          onChange={setLinkInput}
          onSubmit={() => connectSheet(linkInput)}
          onReset={sheetLink !== TASK_INPUT_SHEET_URL ? () => connectSheet(TASK_INPUT_SHEET_URL) : undefined}
          onCancel={() => setLinkOpen(false)}
        />
      )}
      {error && <ErrorBox error={error} onRetryAccount={() => loadFromSheet(true)} />}
      {message && <p className="mt-3 rounded-card bg-success/10 px-3 py-2 text-[13px] text-success">{message}</p>}

      {/* L1 탭 */}
      <div className="mt-4 flex items-end gap-1 overflow-x-auto border-b border-separator">
        {l1s.map((name) => {
          const n = data.rows.filter((r) => r.l1 === name).length
          const on = name === l1
          return (
            <button
              key={name}
              onClick={() => setActiveL1(name)}
              className={`flex shrink-0 items-center gap-1.5 rounded-t-[9px] border border-b-0 px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                on ? '-mb-px border-separator bg-white text-label' : 'border-transparent bg-black/[0.04] text-label-2 hover:bg-black/[0.07] hover:text-label'
              }`}
            >
              {name === NO_L1 ? 'L1 없음' : name}
              <span className="text-[11px] font-medium text-label-3">{n}</span>
            </button>
          )
        })}
      </div>

      {/* 제목 + 기간 */}
      <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[24px] font-bold leading-tight text-label">{l1 === NO_L1 ? 'L1 없음' : l1}</h2>
          <p className="mt-1 text-[13px] text-label-2">{[h, `L2 ${l2Count}개`, `L3 ${tabRows.length}건`].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <div className="flex overflow-hidden rounded-control border border-hairline">
            {PERIODS.map((p) => {
              const on = period.start === p.start && period.months === p.months
              return (
                <button key={p.label} onClick={() => setPeriod(p)} className={`px-2.5 py-1 ${on ? 'bg-label text-white' : 'bg-white text-label-2 hover:bg-black/[0.04]'}`}>
                  {p.label}
                </button>
              )
            })}
          </div>
          <label className="flex items-center gap-1 text-label-2">
            시작
            <select
              value={period.start}
              onChange={(e) => setPeriod((p) => ({ start: Number(e.target.value), months: Math.min(p.months, 13 - Number(e.target.value)) }))}
              className="h-7 rounded-control border border-hairline px-1.5"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}월
                </option>
              ))}
            </select>
            <select value={period.months} onChange={(e) => setPeriod((p) => ({ ...p, months: Number(e.target.value) }))} className="h-7 rounded-control border border-hairline px-1.5">
              {Array.from({ length: 13 - period.start }, (_, i) => (
                <option key={i} value={i + 1}>
                  {i + 1}개월
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 거르기 · 입력 */}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <label className="relative">
          <Search {...icSm} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-label-3" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="L2 · L3 · 담당자 찾기" className="h-8 w-56 rounded-control border border-hairline pl-7 pr-2" />
        </label>
        <select value={person} onChange={(e) => setPerson(e.target.value)} className="h-8 rounded-control border border-hairline px-2" title="담당자로 거르기">
          <option value="">담당자 전체</option>
          {people.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <span className="flex items-center gap-1">
          {CATEGORIES.map((c) => {
            const on = cats.has(c)
            return (
              <button
                key={c}
                onClick={() =>
                  setCats((cur) => {
                    const next = new Set(cur)
                    if (on) next.delete(c)
                    else next.add(c)
                    return next
                  })
                }
                className={`h-7 rounded-full border px-2.5 text-[12px] font-medium ${on ? 'border-label bg-label text-white' : 'border-hairline bg-white text-label-3'}`}
              >
                {c}
              </button>
            )
          })}
        </span>
        <label className="flex items-center gap-1.5 text-label-2">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          완료 숨기기
        </label>
        <span className="ml-auto flex items-center gap-2">
          {editCount > 0 && (
            <>
              <span className="text-label-2">
                고친 칸 <b className="text-orange-600">{editCount}</b>
              </span>
              <Button variant="secondary" size="sm" onClick={() => updateEdits({})} title="이 화면에서 고친 내용을 모두 지우고 시트 값으로 되돌립니다" disabled={saving}>
                <RotateCcw {...icSm} />
                모두 되돌리기
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setConfirmSave(true)}
                disabled={!canSave || saving}
                title={
                  canSave
                    ? '고친 칸을 연결된 시트에 씁니다'
                    : protectedSheet
                      ? '운영 중인 팀 시트에는 저장하지 않습니다. 위 "시트 바꾸기"로 테스트 시트를 연결하세요.'
                      : 'xlsx로 불러온 경우에는 시트에 저장할 수 없습니다. 구글시트에서 불러오세요.'
                }
              >
                {saving ? <Spinner className="h-3.5 w-3.5" /> : <CloudUpload {...icSm} />}
                구글시트에 저장
              </Button>
            </>
          )}
          <Button variant={editing ? 'primary' : 'secondary'} size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil {...icSm} />
            {editing ? '입력 끝내기' : '입력하기'}
          </Button>
        </span>
      </div>

      {/* 입력 도구 / 범례 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-label-2">
        {editing ? (
          <>
            <span className="mr-1 font-medium text-accent">칠하기</span>
            {TOOLS.map((t, i) => (
              <button
                key={t}
                onClick={() => setTool(t)}
                className={`flex h-7 items-center gap-1.5 rounded-full border px-2 ${tool === t ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-hairline bg-white hover:border-black/25'} ${
                  i === 3 ? 'ml-2' : ''
                }`}
              >
                <CellSwatch cell={TOOL_CELL[t]} size={16} />
                {cellLabel(TOOL_CELL[t])}
              </button>
            ))}
            <button
              onClick={() => setTool('erase')}
              className={`ml-2 flex h-7 items-center gap-1 rounded-full border px-2 ${tool === 'erase' ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-hairline bg-white hover:border-black/25'}`}
            >
              <Eraser {...icSm} />
              지우기
            </button>
            <span className="ml-2 text-label-3">칸을 누르거나 한 줄 안에서 끌어 칠합니다</span>
          </>
        ) : (
          <>
            {TOOLS.filter((t) => t !== 'plan' && t !== 'actual').map((t) => (
              <span key={t} className="mr-2 flex items-center gap-1.5">
                <CellSwatch cell={TOOL_CELL[t]} size={16} />
                {cellLabel(TOOL_CELL[t])}
              </span>
            ))}
            <span className="mr-2 flex items-center gap-1.5">
              <CellSwatch cell={TOOL_CELL.plan} size={16} />
              계획 기간
            </span>
            <span className="mr-2 flex items-center gap-1.5">
              <CellSwatch cell={TOOL_CELL.actual} size={16} />
              진행 기간
            </span>
            <span className="mr-2 flex items-center gap-1.5">
              <span className="h-3 border-l border-dashed border-[#E8342A]" />
              현재 주
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              고쳤지만 아직 저장 안 한 칸
            </span>
          </>
        )}
      </div>

      <div className="mt-3 max-h-[calc(100vh-18rem)] overflow-auto rounded-[4px] border border-[#A6A6A6]">
        {views.length === 0 ? (
          <p className="px-4 py-12 text-center text-[13px] text-label-3">조건에 맞는 과제가 없습니다.</p>
        ) : (
          <ScheduleTable
            weekCols={weekCols}
            rows={views}
            editing={editing}
            currentKey={currentKey}
            onPaint={(row, key) => setEdits((cur) => {
              const next = setCellEdit(cur, row, key, TOOL_CELL[tool])
              saveProgressEdits(next)
              return next
            })}
            onStatus={(row, s) => updateEdits(setStatusEdit(edits, row, s))}
          />
        )}
      </div>
      <p className="mt-2 text-[12px] text-label-3">
        고친 칸은 "구글시트에 저장"을 누르기 전까지 이 브라우저에만 남습니다. 저장할 때 시트를 다시 읽어, 그사이 다른 사람이 바꾼 칸은 덮어쓰지 않습니다.
      </p>

      <ConfirmDialog
        open={confirmSave}
        title="구글시트에 저장"
        message={`고친 ${editCount}칸을 「${data.tabTitle}」 탭에 씁니다. 처음 한 번은 구글 시트 편집 권한을 허용해야 합니다.`}
        confirmLabel="저장"
        tone="accent"
        onConfirm={saveToSheet}
        onCancel={() => setConfirmSave(false)}
      />
    </div>
  )
}

function SheetLinkForm({ value, onChange, onSubmit, onReset, onCancel }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onReset?: () => void; onCancel?: () => void }) {
  return (
    <div className="mt-3 rounded-card border border-separator bg-[#F7F7F9] p-3 text-left text-[13px]">
      <p className="font-semibold text-label">불러오고 저장할 구글시트</p>
      <p className="mt-0.5 text-label-2">
        기본은 운영 시트의 사본(테스트 시트)입니다. 다른 시트를 쓰려면 링크를 붙여 넣으세요. 「YYYY 추진현황」 탭을 찾아 읽고, 저장도 그 시트에만 합니다. 운영 팀 시트는 연결해도 읽기만 합니다.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
        className="mt-2 flex flex-wrap gap-2"
      >
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/..." className="h-8 min-w-[320px] flex-1 rounded-control border border-hairline bg-white px-2.5" />
        <Button variant="primary" size="sm" type="submit" disabled={!value.trim()}>
          연결
        </Button>
        {onReset && (
          <Button variant="secondary" size="sm" type="button" onClick={onReset}>
            기본 테스트 시트로 되돌리기
          </Button>
        )}
        {onCancel && (
          <Button variant="ghost" size="sm" type="button" onClick={onCancel}>
            닫기
          </Button>
        )}
      </form>
    </div>
  )
}

function ErrorBox({ error, onRetryAccount }: { error: string; onRetryAccount: () => void }) {
  return (
    <div className="mt-3 rounded-card bg-danger/[0.06] px-3 py-2 text-left text-[13px] text-danger">
      {error}
      <button onClick={onRetryAccount} className="ml-2 font-medium underline">
        다른 계정으로 다시 시도
      </button>
    </div>
  )
}
