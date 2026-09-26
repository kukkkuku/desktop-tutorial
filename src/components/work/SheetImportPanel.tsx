// 데이터 관리 › 구글시트 연결. 회사 과제관리 시트에서 필요한 L2만 골라
// 과제관리 보드로 가져온다.
//   ① 불러올 곳(링크 또는 xlsx) → ② 탭 → ③ 열 매칭 → ④ L2 고르기 → ⑤ 확인·가져오기
// 다시 가져오기 규칙(앱에서 고친 값 유지, 사라진 행은 표시만, 지운 행은
// 되살리지 않음)은 utils/sheetImport.ts의 applySheetImport.

import { useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../../state/AppContext'
import { useWorkspaces } from '../../state/WorkspaceContext'
import type { TeamMember } from '../../types'
import {
  applySheetImport,
  collectWarnings,
  columnMapFromNames,
  columnMapToNames,
  fillMerges,
  filterRows,
  parseHeader,
  parseRows,
  summarizeGroups,
  yearFromTitle,
  type ImportResult,
  type ParsedHeader,
  type RawSheet,
} from '../../utils/sheetImport'
import {
  fetchSheetTab,
  fetchSpreadsheetTabs,
  isSheetsApiConfigured,
  parseSheetUrl,
  pickDefaultTab,
  readXlsxBook,
  sheetUrl,
  type XlsxBook,
  SheetsAuthError,
  chooseSheetsAccountNext,
  DEFAULT_SHEET_URL,
} from '../../utils/sheetSources'
import { COL_NAME, SYSTEM_COLUMNS as ALL_SYSTEM_COLUMNS } from '../../utils/workBoard'
import { progressColumnMap, progressHeader, progressParsedRows, type ProgressSource } from '../../utils/progressImport'
import { countDrafts } from '../../utils/progressBoard'

// 시트 머리글과 짝을 맞추는 열만(상태 원문처럼 앱이 만드는 열은 빼고).
const SYSTEM_COLUMNS = ALL_SYSTEM_COLUMNS.filter((c) => c.sheetHeaders.length > 0)
import { AlertTriangle, Check, ExternalLink, X } from 'lucide-react'
import SheetsIcon from '../SheetsIcon'
import { withGoogleAccount } from '../../utils/googleDrive'
import Button from '../Button'
import { icSm } from '../ui/icon'
import Spinner from '../Spinner'

// 연결된 시트가 없을 때 기본으로 채워 두는 팀 과제관리 시트(바꿔 넣을 수 있음)

interface Props {
  onDone?: () => void
  onCancel?: () => void
  // 시트 목록을 불러와 L2 고르기 화면이 됐는지(창을 넓히는 데 씀)
  onLoadedChange?: (loaded: boolean) => void
  // 시트 칩에서 넣은 새 링크 -- 열리자마자 이 링크로 읽는다.
  initialUrl?: string
  // 'sheet' = 구글시트 링크로 읽기(기본), 'xlsx' = 시트에서 받은 xlsx 파일로 읽기(Excel로 시작 탭),
  // 'progress' = 이 앱 과제 입력 › 추진현황에 불러온 데이터(저장 안 한 변경 포함)
  source?: 'sheet' | 'xlsx' | 'progress'
  progress?: ProgressSource | null
  // L1 탭 줄이 한 줄로 들어가는 폭(px) -- 빠른 시작 창이 이 폭에 딱 맞게 넓어진다
  onNaturalWidth?: (w: number) => void
  // 추진현황에서 가져올 때 미리 고를 L1들 -- 첫 L1 탭을 열고 그 아래 L2를 모두 골라 둔다
  initialL1s?: string[]
  // 'export' = 과제 입력에서 여는 "내보내기" 창(같은 화면, 문구만 내보내기로)
  verb?: 'import' | 'export'
}


interface TabOption {
  title: string
  hidden: boolean
  sheetId?: number
}

export default function SheetImportPanel({ onDone, onCancel, onLoadedChange, initialUrl, source = 'sheet', onNaturalWidth, initialL1s, progress: progressProp, verb = 'import' }: Props) {
  const V = verb === 'export' ? { go: '내보내기', done: '내보냈습니다', doing: '내보냅니다', badge: '내보냄' } : { go: '가져오기', done: '가져왔습니다', doing: '가져옵니다', badge: '가져옴' }
  const progress = source === 'progress' ? (progressProp ?? null) : null
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const board = state.workBoard
  const link = board.sheetLink

  const [urlInput, setUrlInput] = useState(initialUrl ?? (link?.spreadsheetId ? sheetUrl(link.spreadsheetId) : DEFAULT_SHEET_URL))
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(null)
  const [book, setBook] = useState<XlsxBook | null>(null)
  const [bookTitle, setBookTitle] = useState('')
  const [tabs, setTabs] = useState<TabOption[]>([])
  const [tabName, setTabName] = useState<string | null>(null)
  const [raw, setRaw] = useState<RawSheet | null>(null)
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [mapOpen, setMapOpen] = useState(false)
  const [columnMap, setColumnMap] = useState<Record<string, number | null>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addNames, setAddNames] = useState<Set<string>>(new Set())
  const [result, setResult] = useState<ImportResult | null>(null)

  const [authTrouble, setAuthTrouble] = useState(false)
  async function run(label: string, fn: () => Promise<void>) {
    setLoading(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
      setAuthTrouble(e instanceof SheetsAuthError || /권한|로그인|계정/.test(e instanceof Error ? e.message : ''))
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(null)
    }
  }

  // ---------- ① 불러오기 ----------

  function loadFromLink() {
    const parsed = parseSheetUrl(urlInput)
    if (!parsed) {
      setError('구글시트 링크를 알아볼 수 없습니다. 주소창의 https://docs.google.com/spreadsheets/d/... 전체를 붙여넣어 주세요.')
      return
    }
    void run('시트 목록을 읽는 중', async () => {
      const info = await fetchSpreadsheetTabs(parsed.spreadsheetId)
      setSpreadsheetId(parsed.spreadsheetId)
      setBook(null)
      setBookTitle(info.title)
      setTabs(info.tabs)
      const fromGid = parsed.gid !== null ? info.tabs.find((t) => t.sheetId === parsed.gid) : undefined
      const remembered = link && link.spreadsheetId === parsed.spreadsheetId ? info.tabs.find((t) => t.title === link.tabName) : undefined
      // 과제 입력에서 내보냈으면 그 링크의 탭(gid)을 먼저 연다.
      const pick = (initialL1s?.length ? fromGid?.title : undefined) ?? remembered?.title ?? fromGid?.title ?? pickDefaultTab(info.tabs, currentWorkspace?.evaluationYear ?? null)
      if (pick) await loadTab(pick, parsed.spreadsheetId, null)
    })
  }

  // 시트 칩에서 새 링크로 연결했으면 열자마자 그 링크를 읽는다(한 번만).
  useEffect(() => {
    if (initialUrl) loadFromLink()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function loadFromFile(file: File) {
    void run('파일을 읽는 중', async () => {
      const buf = await file.arrayBuffer()
      const b = readXlsxBook(buf, file.name)
      setBook(b)
      setSpreadsheetId(null)
      setBookTitle(b.title)
      setTabs(b.sheets.map((s) => ({ title: s.title, hidden: s.hidden === true })))
      const remembered = link ? b.sheets.find((s) => s.title === link.tabName) : undefined
      const pick = remembered?.title ?? pickDefaultTab(b.sheets.map((s) => ({ title: s.title, hidden: s.hidden === true })), currentWorkspace?.evaluationYear ?? null)
      if (pick) await loadTab(pick, null, b)
    })
  }

  async function loadTab(title: string, sid: string | null, b: XlsxBook | null) {
    setTabName(title)
    setResult(null)
    const sheet = sid ? await fetchSheetTab(sid, title) : b?.sheets.find((s) => s.title === title) ?? null
    setRaw(sheet)
  }

  function changeTab(title: string) {
    void run('탭을 읽는 중', () => loadTab(title, spreadsheetId, book))
  }

  // ---------- ② 해석 ----------

  const filled = useMemo(() => (raw ? fillMerges(raw.rows, raw.merges) : null), [raw])
  const header: ParsedHeader | null = useMemo(() => (progress ? progressHeader(progress.data) : filled ? parseHeader(filled) : null), [filled, progress])

  // 탭을 새로 읽으면 매칭·선택을 다시 잡는다(같은 탭이면 지난번 선택을 살린다).
  // 추진현황에서 가져올 때는 열 짝이 이미 정해져 있다(같은 시트 · 탭이면 지난번 선택을 살린다).
  useEffect(() => {
    if (!progress) return
    setColumnMap(progressColumnMap(progress.data))
    const same = link && link.tabName === progress.data.tabTitle && (link.spreadsheetId || '') === (progress.data.spreadsheetId ?? '')
    // 내보내기에서 연 경우: 보고 있던 그룹(L1)의 L2를 미리 골라 두고 그 L1 탭을 연다
    const picked = initialL1s?.length ? summarizeGroups(progressParsedRows(progress)).filter((g) => initialL1s.includes(g.l1 ?? '(L1 없음)')) : []
    setSelected(new Set([...(same ? link.selectedGroups : []), ...picked.map((g) => g.name)]))
    if (picked.length) setActiveL1(picked[0].l1 ?? '(L1 없음)')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress])
  useEffect(() => {
    if (!header || !raw) return
    const sameTab = link && link.tabName === raw.title
    setColumnMap(sameTab ? columnMapFromNames(header, link.columnMap) : columnMapFromNames(header, {}))
    setSelected(new Set(sameTab ? link.selectedGroups : []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, raw])

  const rows = useMemo(
    () => (progress ? progressParsedRows(progress) : filled && header ? parseRows(filled, header, columnMap) : []),
    [progress, filled, header, columnMap],
  )
  const groups = useMemo(() => summarizeGroups(rows), [rows])
  const importRows = useMemo(() => filterRows(rows, Array.from(selected), null), [rows, selected])
  const warnings = useMemo(() => collectWarnings(importRows, state.members), [importRows, state.members])

  // 기본으로 체크할 새 팀원: 고른 L2에서 2건 이상 맡은 사람만. 팀원으로 넣으면
  // 평가의 기여도 자동 배분에도 들어가고, 담당자 칸에는 "방인용\n국내"처럼
  // 이름이 아닌 값도 섞여 있어서 한 번만 나온 이름은 사람이 직접 고르게 둔다.
  useEffect(() => {
    setAddNames(new Set(warnings.unknownAssignees.filter((u) => u.count >= 2).map((u) => u.name)))
  }, [warnings.unknownAssignees])

  // L1을 탭으로, 그 아래 L2 목록 (시트 순서 유지)
  const l1Tabs = useMemo(() => {
    const m = new Map<string, typeof groups>()
    for (const g of groups) {
      const l1 = g.l1 ?? '(L1 없음)'
      if (!m.has(l1)) m.set(l1, [])
      m.get(l1)!.push(g)
    }
    return Array.from(m.entries())
  }, [groups])
  const [activeL1, setActiveL1] = useState<string | null>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = measureRef.current
    if (el && onNaturalWidth) onNaturalWidth(Math.ceil(el.getBoundingClientRect().width))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l1Tabs.map(([l1]) => l1).join('|'), selected, activeL1])
  const currentL1 = l1Tabs.find(([l1]) => l1 === activeL1) ?? l1Tabs[0]
  const [confirming, setConfirming] = useState(false)

  function toggle(names: string[], on: boolean) {
    const next = new Set(selected)
    names.forEach((n) => (on ? next.add(n) : next.delete(n)))
    setSelected(next)
  }


  // ---------- ⑤ 가져오기 ----------

  function doImport() {
    if (!header || (!raw && !progress)) return
    const tabTitle = progress ? progress.data.tabTitle : raw!.title
    const newMembers: TeamMember[] = warnings.unknownAssignees
      .filter((u) => addNames.has(u.name))
      .map((u) => ({
        id: uuidv4(),
        name: u.name,
        active: true,
        level: '',
        yearsOfService: null,
        role: '',
        comment: '',
        hireDate: null,
        currentLevelSince: null,
        team: u.team ?? undefined,
      }))
    const members = [...state.members, ...newMembers]
    const nextLink = {
      spreadsheetId: progress ? (progress.data.spreadsheetId ?? '') : (spreadsheetId ?? link?.spreadsheetId ?? ''),
      tabName: tabTitle,
      gid: progress
        ? (progress.data.sheetGid ?? undefined)
        : spreadsheetId
          ? tabs.find((t) => t.title === tabTitle)?.sheetId
          : link?.tabName === tabTitle
            ? link.gid
            : undefined,
      columnMap: columnMapToNames(header, columnMap),
      selectedGroups: Array.from(selected),
      teamFilter: null,
      lastFetchedAt: new Date().toISOString(),
      fileTitle: progress ? progress.data.fileTitle : bookTitle || link?.fileTitle,
    }
    const res = applySheetImport(board, importRows, header, members, nextLink, yearFromTitle(tabTitle) ?? currentWorkspace?.evaluationYear ?? null)
    if (newMembers.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: members })
    dispatch({ type: 'SET_WORK_BOARD', payload: res.board })
    setResult(res)
    setConfirming(false)
  }

  const unmapped = SYSTEM_COLUMNS.filter((c) => c.id !== COL_NAME && (columnMap[c.id] === null || columnMap[c.id] === undefined))
  const loaded = !!header
  useEffect(() => {
    onLoadedChange?.(loaded)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded])
  const selectedGroups = groups.filter((g) => selected.has(g.name))

  // ---------- 화면 ----------

  return (
    <div className="flex min-h-full flex-col">
      {source === 'progress' ? (
        <div>
          <h3 className="text-[15px] font-semibold text-label">{verb === 'export' ? '추진현황 과제 내보내기' : '추진현황에서 과제 가져오기'}</h3>
          <p className="mt-1 text-[13px] text-label-2">
            {verb === 'export'
              ? '추진현황에서 L1/L2 분류를 골라 L3 과제와 담당자를 성과관리 과제리스트로 내보냅니다. 내보낸 L2는 과제관리의 탭이 됩니다.'
              : '과제 입력 › 추진현황에 불러온 과제에서 L1/L2 분류를 골라 L3 과제와 담당자를 가져옵니다. 가져온 L2는 과제관리의 탭이 됩니다.'}
          </p>
          {progress ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-label">
              <SheetsIcon className="h-4 w-3.5 shrink-0" />
              <span className="font-semibold">
                {progress.data.fileTitle ? (
                  <>
                    {progress.data.fileTitle}
                    <span className="font-normal text-label-3"> › </span>
                    {progress.data.tabTitle}
                  </>
                ) : (
                  progress.data.source
                )}
              </span>
              <span className="text-label-3">·</span>
              <span>L2 분류 {groups.length}개</span>
              {countDrafts(progress.drafts) > 0 && (
                <>
                  <span className="text-label-3">·</span>
                  <span className="text-orange-600">저장 안 한 변경 {countDrafts(progress.drafts)}건 포함</span>
                </>
              )}
            </p>
          ) : (
            <p className="mt-3 rounded-card bg-black/[0.04] px-3 py-2.5 text-[13px] text-label-2">
              아직 과제 입력 › 추진현황을 불러온 적이 없습니다. 맨 위 「과제 입력」에서 추진현황을 먼저 불러와 주세요.
            </p>
          )}
          {progress && board.sheetLink && (
            <p className="mt-1 text-[13px] text-label-2">앱에서 고친 칸과 지운 행은 유지합니다. 선택을 뺀 L2의 기존 과제는 지우지 않습니다.</p>
          )}
        </div>
      ) : source === 'sheet' ? (
        <>
          <div>
            <h3 className="text-[15px] font-semibold text-label">구글시트에서 과제 가져오기</h3>
            <p className="mt-1 text-[13px] text-label-2">시트의 L1/L2 분류를 골라 L3 과제와 담당자를 가져옵니다. 가져온 L2는 과제관리의 탭이 됩니다.</p>
            <p className="mt-1 text-[13px] text-label-2">
              추진현황 양식의 H·L1·L2·L3 열과 담당자·상태 등을 머리글 이름으로 찾아 읽습니다. 원본 시트는 바꾸지 않습니다.
            </p>
          </div>

          {/* 지금 연결된(또는 방금 읽은) 시트 -- 눌러서 바로 가기 */}
          {(spreadsheetId ?? link?.spreadsheetId) && (
            <a
              href={withGoogleAccount(sheetUrl((spreadsheetId ?? link?.spreadsheetId)!, spreadsheetId ? tabs.find((t) => t.title === tabName)?.sheetId : link?.gid))}
              target="_blank"
              rel="noreferrer"
              title="구글시트로 바로 가기"
              className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-control px-1 py-0.5 text-[13px] text-label-2 hover:bg-black/[0.04] hover:text-label"
            >
              <span className="shrink-0 text-label-3">{spreadsheetId ? '읽은 시트' : '현재 연결'}</span>
              <SheetsIcon className="h-4 w-3.5 shrink-0" />
              <span className="truncate font-semibold text-label">
                {(spreadsheetId ? bookTitle : link?.fileTitle) || '구글시트'}
                <span className="font-normal text-label-3"> › </span>
                {spreadsheetId ? (tabName ?? '') : link?.tabName}
              </span>
              <ExternalLink {...icSm} className="shrink-0" />
            </a>
          )}

          {/* 링크 */}
          <div className="mt-2 flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFromLink()}
              disabled={!isSheetsApiConfigured()}
              placeholder={isSheetsApiConfigured() ? 'https://docs.google.com/spreadsheets/d/...' : '이 빌드에는 구글 연동이 없어 링크로 읽을 수 없습니다 -- Excel로 시작 탭에서 xlsx 파일로 올려 주세요'}
              className="h-8 rounded-control border border-hairline px-2.5 text-[13px] min-w-0 flex-1 disabled:bg-black/[0.03]"
            />
            <Button variant="secondary" onClick={loadFromLink} disabled={!urlInput.trim() || loading !== null || !isSheetsApiConfigured()}>
              목록 확인
            </Button>
          </div>
        </>
      ) : (
        <>
          <div>
            <h3 className="text-[15px] font-semibold text-label">추진현황 xlsx로 과제 가져오기</h3>
            <p className="mt-1 text-[13px] text-label-2">구글시트에서 「파일 › 다운로드 › Microsoft Excel(.xlsx)」로 받은 파일을 올리면, 구글시트 연결과 똑같이 L1/L2를 골라 가져옵니다.</p>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) loadFromFile(f)
                e.target.value = ''
              }}
            />
            <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={loading !== null}>
              xlsx 파일 고르기
            </Button>
            {book && <span className="truncate text-[13px] text-label-2">{bookTitle}</span>}
          </div>
        </>
      )}
      {loading && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-label-2">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {loading}
        </p>
      )}
      {error && (
        <div className="mt-2 rounded-card bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">
          <p>{error}</p>
          {authTrouble && (
            <button
              onClick={() => {
                chooseSheetsAccountNext()
                loadFromLink()
              }}
              className="mt-1.5 inline-flex h-7 items-center rounded-control bg-white px-2.5 font-medium text-danger shadow-control hover:bg-[#FAFAFA]"
            >
              계정 골라서 다시 연결
            </button>
          )}
        </div>
      )}

      {/* 불러온 탭 */}
      {tabs.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-label">
            <span title={bookTitle}>불러온 탭:</span>
            <select value={tabName ?? ''} onChange={(e) => changeTab(e.target.value)} className="h-8 rounded-control border border-hairline px-2.5 text-[13px] font-semibold text-label">
              {tabs.map((t) => (
                <option key={t.title} value={t.title}>
                  {t.title}
                  {t.hidden ? ' (숨김)' : ''}
                </option>
              ))}
            </select>
            {header && (
              <>
                <span className="text-label-3">·</span>
                <span>시트 L2 분류 {groups.length}개</span>
                <span className="text-label-3">·</span>
                <button
                  onClick={() => setMapOpen((v) => !v)}
                  title={
                    unmapped.length
                      ? '앱의 이 열과 같은 이름의 머리글을 시트에서 찾지 못해 그 칸은 가져오지 않습니다(시작일은 주차 칸의 첫 표시로 추정). 눌러서 시트의 다른 열과 짝지을 수 있습니다.'
                      : '앱의 열과 시트 머리글이 모두 짝지어졌습니다'
                  }
                  className={`text-[13px] hover:underline ${unmapped.length ? 'text-warning' : 'text-label-2'}`}
                >
                  {unmapped.length ? `시트에 없는 열: ${unmapped.map((c) => c.label).join(', ')} · 열 매칭` : '열 매칭 확인'}
                </button>
              </>
            )}
          </div>
          {raw && !header && (
            <p className="rounded-card bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">
              이 탭에서 'L2'·'L3' 머리글을 찾지 못했습니다. 「YYYY 추진현황」처럼 H/L1/L2/L3 열이 있는 탭을 골라 주세요.
            </p>
          )}
          {board.sheetLink && (
            <p className="text-[13px] text-label-2">앱에서 고친 칸과 지운 행은 유지합니다. 선택을 뺀 L2의 기존 과제는 지우지 않습니다.</p>
          )}
        </div>
      )}

      {header && mapOpen && (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-card border border-separator p-3 sm:grid-cols-2">
          {SYSTEM_COLUMNS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[13px]">
              <span className="w-28 shrink-0 text-label-2">{c.label}</span>
              <select
                value={columnMap[c.id] ?? ''}
                disabled={c.id === COL_NAME}
                onChange={(e) => setColumnMap({ ...columnMap, [c.id]: e.target.value === '' ? null : Number(e.target.value) })}
                className="h-8 rounded-control border border-hairline px-2.5 text-[13px] min-w-0 flex-1"
              >
                <option value="">(가져오지 않음)</option>
                {header.labels.map((label, idx) =>
                  label && !header.weekCols.some((w) => w.col === idx) ? (
                    <option key={idx} value={idx}>
                      {label}
                    </option>
                  ) : null,
                )}
              </select>
            </label>
          ))}
        </div>
      )}

      {/* L1 탭 + L2 목록 */}
      {header && groups.length > 0 && !confirming && !result && currentL1 && (
        <>
          <div className="relative mt-4 overflow-hidden rounded-card border border-separator bg-[#F7F7F9]">
            {/* 한 줄로 늘어놓았을 때의 폭을 재는 보이지 않는 복사본 */}
            <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0 h-0 overflow-hidden">
              <div ref={measureRef} className="mac-seg w-max">
                {l1Tabs.map(([l1, gs]) => {
                  const picked = gs.filter((g) => selected.has(g.name)).length
                  return (
                    <span key={l1} className={`mac-seg-item ${l1 === currentL1[0] ? 'mac-seg-item-on' : ''}`}>
                      {l1} <span>{picked > 0 ? `${picked}/${gs.length}` : gs.length}</span>
                    </span>
                  )
                })}
              </div>
            </div>
            {/* 한 줄로: 폭이 모자라면 탭이 함께 줄고 이름은 말줄임(브라우저 탭처럼) */}
            <div className="mac-seg m-2.5 flex max-w-[calc(100%-1.25rem)] overflow-hidden">
              {l1Tabs.map(([l1, gs]) => {
                const on = l1 === currentL1[0]
                const picked = gs.filter((g) => selected.has(g.name)).length
                return (
                  <button
                    key={l1}
                    onClick={() => setActiveL1(l1)}
                    title={l1}
                    className={`mac-seg-item flex min-w-[48px] flex-[0_1_auto] items-center gap-1 ${on ? 'mac-seg-item-on' : ''}`}
                  >
                    <span className="min-w-0 truncate break-all">{l1}</span>
                    <span className={`shrink-0 ${picked > 0 ? 'font-semibold text-accent' : 'text-label-3'}`}>{picked > 0 ? `${picked}/${gs.length}` : gs.length}</span>
                  </button>
                )
              })}
            </div>
            <div className="divide-y divide-separator border-t border-separator bg-white">
              {currentL1[1].map((g) => {
                const on = selected.has(g.name)
                const already = board.groups.some((bg) => bg.name === g.name)
                return (
                  <label key={g.name} className={`flex cursor-pointer gap-3 px-4 py-3.5 ${on ? 'bg-accent-soft/40' : 'hover:bg-black/[0.02]'}`}>
                    <input type="checkbox" className="mt-0.5 shrink-0" checked={on} onChange={(e) => toggle([g.name], e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-[14px] font-semibold text-label">
                        {g.name}
                        {g.tag ? ` [${g.tag}]` : ''}
                        {already && <span className="mac-badge bg-success/15 text-success">{V.badge}</span>}
                        {g.inferred && (
                          <span className="text-[13px] font-normal text-warning" title="시트의 H/L1 병합이 끊겨 위 행 값으로 채웠습니다">
                            H/L1 추정
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-[13px] text-label-2">
                        L3 하위과제 {g.count}개{g.assignees.length > 0 && ` · 담당자 ${g.assignees.join(', ')}`}
                        {g.teams.length > 0 && <span className="text-label-3"> · {g.teams.map((t) => `${t.team} ${t.count}`).join(' / ')}</span>}
                      </span>
                      <span className="mt-2 block truncate border-l-2 border-warning/50 pl-3 text-[13px] text-label">
                        {g.l3Names.slice(0, 4).join(' · ')}
                        {g.l3Names.length > 4 && ` 외 ${g.l3Names.length - 4}개`}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="sticky bottom-0 mt-3 flex flex-wrap items-end gap-3 border-t border-separator bg-white pb-1 pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-[13px] text-label-2">
                선택한 시트 L2 분류 {selectedGroups.length}개{selectedGroups.length > 0 && ` · L3 ${importRows.length}건`}
              </p>
              {selectedGroups.length > 0 && (
                <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {selectedGroups.map((g) => (
                    <span
                      key={g.name}
                      className="inline-flex max-w-full items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-3 pr-1 text-[13px] font-medium text-accent"
                    >
                      <button onClick={() => setActiveL1(g.l1 ?? '(L1 없음)')} className="truncate hover:underline" title={`${g.l1 ?? ''} › ${g.name}`}>
                        {g.name}
                        {g.tag ? ` [${g.tag}]` : ''}
                      </button>
                      <button
                        onClick={() => toggle([g.name], false)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full hover:bg-accent/15"
                        aria-label={`${g.name} 선택 해제`}
                        title="선택 해제"
                      >
                        <X size={12} strokeWidth={2} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <span className="ml-auto flex gap-2">
              {onCancel && (
                <Button variant="secondary" onClick={onCancel}>
                  취소
                </Button>
              )}
              <Button variant="primary" onClick={() => setConfirming(true)} disabled={importRows.length === 0}>
                선택 과제 {V.go}
              </Button>
            </span>
          </div>
        </>
      )}

      {/* 확인 */}
      {header && confirming && !result && (
        <div className="mt-4 rounded-card border border-separator p-4">
          <p className="text-[13px] font-semibold text-label">
            L2 {selectedGroups.length}개 · L3 {importRows.length}건을 {V.doing}
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            {warnings.inferredRows.length > 0 && (
              <li className="flex items-start gap-1.5 text-warning">
                <AlertTriangle {...icSm} className="mt-0.5 shrink-0" />
                <span>H/L1이 비어 있어 위 행 값으로 채운 행 {warnings.inferredRows.length}건 (시트 {warnings.inferredRows.slice(0, 5).map((r) => r.row + 1).join(', ')}
                {warnings.inferredRows.length > 5 ? ' …' : ''}행)</span>
              </li>
            )}
            {warnings.oddCategory.length > 0 && (
              <li className="flex items-start gap-1.5 text-warning">
                <AlertTriangle {...icSm} className="mt-0.5 shrink-0" />
                <span>분류가 과제/일반/일상이 아닌 행 {warnings.oddCategory.length}건 ({Array.from(new Set(warnings.oddCategory.map((o) => o.value))).join(', ')}) -- 과제등급
                "미입력"으로 두고 원문은 보존합니다</span>
              </li>
            )}
            {warnings.emptyCategory.length > 0 && <li className="text-label-2">분류가 빈 행 {warnings.emptyCategory.length}건 -- 과제등급 "미입력"</li>}
            {board.excludedSheetKeys.length > 0 && <li className="text-label-2">앱에서 지운 시트 행은 다시 가져오지 않습니다.</li>}
            {board.items.some((i) => i.editedAt) && <li className="text-label-2">앱에서 고친 칸은 시트 값으로 덮지 않습니다.</li>}
          </ul>

          {warnings.unknownAssignees.length > 0 && (
            <div className="mt-3 rounded-card bg-[#F7F7F9] p-3">
              <p className="text-[13px] font-semibold text-label">팀원 목록에 없는 담당자 {warnings.unknownAssignees.length}명 -- 팀원으로 추가할 사람을 고르세요</p>
              <p className="mt-0.5 text-[13px] text-label-2">
                추가하지 않아도 과제관리에는 이름이 그대로 보이고, 나중에 팀원관리에서 추가하면 자동으로 연결됩니다. 팀원은 평가하기의 기여도 자동 배분에도 들어가니 우리
                팀 사람만 고르세요.
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {warnings.unknownAssignees.map((u) => {
                  const on = addNames.has(u.name)
                  return (
                    <button
                      key={u.name}
                      onClick={() => {
                        const next = new Set(addNames)
                        if (on) next.delete(u.name)
                        else next.add(u.name)
                        setAddNames(next)
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] ${on ? 'bg-accent-soft font-semibold text-accent' : 'bg-white text-label-2 shadow-control hover:text-label'}`}
                      title={u.team ?? undefined}
                    >
                      {on && <Check {...icSm} />}
                      {u.name} <span className="text-label-3">{u.count}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              뒤로
            </Button>
            <Button variant="primary" onClick={doImport}>
              {V.go}
              {addNames.size > 0 ? ` · 팀원 ${addNames.size}명 추가` : ''}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-card border border-success/25 bg-success/[0.08] p-4">
          <p className="text-[13px] font-semibold text-success">{V.done}</p>
          <p className="mt-1 text-[13px] text-success">
            새 L2 {result.newGroups}개 · 새 L3 {result.added}건 · 바뀐 L3 {result.updated}건
            {result.keptEdits > 0 && ` · 앱에서 고친 값 ${result.keptEdits}칸 유지`}
            {result.missing > 0 && ` · 시트에 없어진 행 ${result.missing}건 표시`}
            {result.skippedDeleted > 0 && ` · 앱에서 지운 행 ${result.skippedDeleted}건 건너뜀`}
          </p>
          <div className="mt-3 flex gap-2">
            {onDone && <Button variant="primary" onClick={onDone}>과제관리에서 보기</Button>}
            <Button
              variant="secondary"
              onClick={() => {
                setResult(null)
                setConfirming(false)
              }}
            >
              다시 고르기
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
