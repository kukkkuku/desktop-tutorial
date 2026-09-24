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
} from '../../utils/sheetSources'
import { COL_NAME, SYSTEM_COLUMNS } from '../../utils/workBoard'
import Button from '../Button'
import Spinner from '../Spinner'

interface Props {
  onDone?: () => void
  onCancel?: () => void
}


interface TabOption {
  title: string
  hidden: boolean
  sheetId?: number
}

export default function SheetImportPanel({ onDone, onCancel }: Props) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const board = state.workBoard
  const link = board.sheetLink

  const [urlInput, setUrlInput] = useState(link ? sheetUrl(link.spreadsheetId) : '')
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

  async function run(label: string, fn: () => Promise<void>) {
    setLoading(label)
    setError(null)
    try {
      await fn()
    } catch (e) {
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
      const pick = remembered?.title ?? fromGid?.title ?? pickDefaultTab(info.tabs, currentWorkspace?.evaluationYear ?? null)
      if (pick) await loadTab(pick, parsed.spreadsheetId, null)
    })
  }

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
  const header: ParsedHeader | null = useMemo(() => (filled ? parseHeader(filled) : null), [filled])

  // 탭을 새로 읽으면 매칭·선택을 다시 잡는다(같은 탭이면 지난번 선택을 살린다).
  useEffect(() => {
    if (!header || !raw) return
    const sameTab = link && link.tabName === raw.title
    setColumnMap(sameTab ? columnMapFromNames(header, link.columnMap) : columnMapFromNames(header, {}))
    setSelected(new Set(sameTab ? link.selectedGroups : []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, raw])

  const rows = useMemo(() => (filled && header ? parseRows(filled, header, columnMap) : []), [filled, header, columnMap])
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
  const currentL1 = l1Tabs.find(([l1]) => l1 === activeL1) ?? l1Tabs[0]
  const [confirming, setConfirming] = useState(false)

  function toggle(names: string[], on: boolean) {
    const next = new Set(selected)
    names.forEach((n) => (on ? next.add(n) : next.delete(n)))
    setSelected(next)
  }


  // ---------- ⑤ 가져오기 ----------

  function doImport() {
    if (!header || !raw) return
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
      spreadsheetId: spreadsheetId ?? link?.spreadsheetId ?? '',
      tabName: raw.title,
      columnMap: columnMapToNames(header, columnMap),
      selectedGroups: Array.from(selected),
      teamFilter: null,
      lastFetchedAt: new Date().toISOString(),
    }
    const res = applySheetImport(board, importRows, header, members, nextLink)
    if (newMembers.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: members })
    dispatch({ type: 'SET_WORK_BOARD', payload: res.board })
    setResult(res)
    setConfirming(false)
  }

  const unmapped = SYSTEM_COLUMNS.filter((c) => c.id !== COL_NAME && (columnMap[c.id] === null || columnMap[c.id] === undefined))
  const selectedGroups = groups.filter((g) => selected.has(g.name))

  // ---------- 화면 ----------

  return (
    <div className="flex min-h-full flex-col">
      <div>
        <h3 className="text-base font-bold text-black">구글시트에서 과제 가져오기</h3>
        <p className="mt-1 text-sm text-gray-600">시트의 L1/L2 분류를 골라 L3 과제와 담당자를 가져옵니다. 가져온 L2는 과제관리의 탭이 됩니다.</p>
        <p className="mt-1 text-xs text-gray-500">
          추진현황 양식의 H·L1·L2·L3 열과 담당자·상태 등을 머리글 이름으로 찾아 읽습니다. 원본 시트는 바꾸지 않습니다.
        </p>
      </div>

      {/* 링크 */}
      <div className="mt-4 flex gap-2">
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && loadFromLink()}
          disabled={!isSheetsApiConfigured()}
          placeholder={isSheetsApiConfigured() ? 'https://docs.google.com/spreadsheets/d/...' : '이 빌드에는 구글 연동이 없어 링크로 읽을 수 없습니다 -- xlsx 파일로 올려 주세요'}
          className="h-10 min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-accent disabled:bg-gray-50"
        />
        <Button variant="secondary" onClick={loadFromLink} disabled={!urlInput.trim() || loading !== null || !isSheetsApiConfigured()} className="h-10 px-4">
          목록 확인
        </Button>
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
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={loading !== null} className="h-10 px-4" title="시트에서 파일 › 다운로드 › xlsx로 받은 파일">
          xlsx 올리기
        </Button>
      </div>
      {loading && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
          <Spinner className="h-3.5 w-3.5 text-accent" />
          {loading}
        </p>
      )}
      {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

      {/* 불러온 탭 */}
      {tabs.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700">
            <span title={bookTitle}>불러온 탭:</span>
            <select value={tabName ?? ''} onChange={(e) => changeTab(e.target.value)} className="h-7 rounded border border-gray-300 px-1 text-sm font-bold text-black">
              {tabs.map((t) => (
                <option key={t.title} value={t.title}>
                  {t.title}
                  {t.hidden ? ' (숨김)' : ''}
                </option>
              ))}
            </select>
            {header && (
              <>
                <span className="text-gray-400">·</span>
                <span>시트 L2 분류 {groups.length}개</span>
                <span className="text-gray-400">·</span>
                <button onClick={() => setMapOpen((v) => !v)} className={`text-xs hover:underline ${unmapped.length ? 'text-orange-600' : 'text-gray-500'}`}>
                  열 매칭 {unmapped.length ? `(못 찾은 열 ${unmapped.length})` : '확인'}
                </button>
              </>
            )}
          </div>
          {raw && !header && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-danger">
              이 탭에서 'L2'·'L3' 머리글을 찾지 못했습니다. 「YYYY 추진현황」처럼 H/L1/L2/L3 열이 있는 탭을 골라 주세요.
            </p>
          )}
          {board.sheetLink && (
            <p className="text-xs text-gray-500">앱에서 고친 칸과 지운 행은 유지합니다. 선택을 뺀 L2의 기존 과제는 지우지 않습니다.</p>
          )}
        </div>
      )}

      {header && mapOpen && (
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-lg border border-gray-200 p-3 sm:grid-cols-2">
          {SYSTEM_COLUMNS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm">
              <span className="w-28 shrink-0 text-gray-600">{c.label}</span>
              <select
                value={columnMap[c.id] ?? ''}
                disabled={c.id === COL_NAME}
                onChange={(e) => setColumnMap({ ...columnMap, [c.id]: e.target.value === '' ? null : Number(e.target.value) })}
                className="h-8 min-w-0 flex-1 rounded-md border border-gray-300 px-1.5 text-sm"
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
          <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-[#F7F8FA]">
            <div className="flex flex-wrap gap-1 border-b border-gray-200 px-3 py-2.5">
              {l1Tabs.map(([l1, gs]) => {
                const on = l1 === currentL1[0]
                const picked = gs.filter((g) => selected.has(g.name)).length
                return (
                  <button
                    key={l1}
                    onClick={() => setActiveL1(l1)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${on ? 'bg-[#14161A] text-white' : 'text-gray-600 hover:bg-white hover:text-black'}`}
                  >
                    {l1} <span className={on ? 'text-white/60' : 'text-gray-400'}>{picked > 0 ? `${picked}/${gs.length}` : gs.length}</span>
                  </button>
                )
              })}
            </div>
            <div className="divide-y divide-gray-100 bg-white">
              {currentL1[1].map((g) => {
                const on = selected.has(g.name)
                const already = board.groups.some((bg) => bg.name === g.name)
                return (
                  <label key={g.name} className={`flex cursor-pointer gap-3 px-4 py-3.5 ${on ? 'bg-blue-50/40' : 'hover:bg-[#FAFAFB]'}`}>
                    <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={on} onChange={(e) => toggle([g.name], e.target.checked)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 text-[15px] font-bold text-black">
                        {g.name}
                        {g.tag ? ` [${g.tag}]` : ''}
                        {already && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-bold text-green-700">가져옴</span>}
                        {g.inferred && (
                          <span className="text-xs font-normal text-orange-500" title="시트의 H/L1 병합이 끊겨 위 행 값으로 채웠습니다">
                            H/L1 추정
                          </span>
                        )}
                      </span>
                      <span className="mt-1 block text-xs text-gray-500">
                        L3 하위과제 {g.count}개{g.assignees.length > 0 && ` · 담당자 ${g.assignees.join(', ')}`}
                        {g.teams.length > 0 && <span className="text-gray-400"> · {g.teams.map((t) => `${t.team} ${t.count}`).join(' / ')}</span>}
                      </span>
                      <span className="mt-2 block truncate border-l-2 border-orange-300 pl-3 text-xs text-gray-700">
                        {g.l3Names.slice(0, 4).join(' · ')}
                        {g.l3Names.length > 4 && ` 외 ${g.l3Names.length - 4}개`}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="sticky bottom-0 mt-auto flex flex-wrap items-end gap-3 border-t border-gray-100 bg-white pt-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-600">
                선택한 시트 L2 분류 {selectedGroups.length}개{selectedGroups.length > 0 && ` · L3 ${importRows.length}건`}
              </p>
              {selectedGroups.length > 0 && (
                <div className="mt-2 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                  {selectedGroups.map((g) => (
                    <span
                      key={g.name}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 py-1 pl-3 pr-1.5 text-xs font-medium text-orange-900"
                    >
                      <button onClick={() => setActiveL1(g.l1 ?? '(L1 없음)')} className="truncate hover:underline" title={`${g.l1 ?? ''} › ${g.name}`}>
                        {g.name}
                        {g.tag ? ` [${g.tag}]` : ''}
                      </button>
                      <button
                        onClick={() => toggle([g.name], false)}
                        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-orange-700 hover:bg-orange-200"
                        aria-label={`${g.name} 선택 해제`}
                        title="선택 해제"
                      >
                        ×
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
                선택 과제 가져오기
              </Button>
            </span>
          </div>
        </>
      )}

      {/* 확인 */}
      {header && confirming && !result && (
        <div className="mt-4 rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-bold text-black">
            L2 {selectedGroups.length}개 · L3 {importRows.length}건을 가져옵니다
          </p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {warnings.inferredRows.length > 0 && (
              <li className="text-orange-700">
                ⚠ H/L1이 비어 있어 위 행 값으로 채운 행 {warnings.inferredRows.length}건 (시트 {warnings.inferredRows.slice(0, 5).map((r) => r.row + 1).join(', ')}
                {warnings.inferredRows.length > 5 ? ' …' : ''}행)
              </li>
            )}
            {warnings.oddCategory.length > 0 && (
              <li className="text-orange-700">
                ⚠ 분류가 과제/일반/일상이 아닌 행 {warnings.oddCategory.length}건 ({Array.from(new Set(warnings.oddCategory.map((o) => o.value))).join(', ')}) -- 과제등급
                "미입력"으로 두고 원문은 보존합니다
              </li>
            )}
            {warnings.emptyCategory.length > 0 && <li className="text-gray-600">분류가 빈 행 {warnings.emptyCategory.length}건 -- 과제등급 "미입력"</li>}
            {board.excludedSheetKeys.length > 0 && <li className="text-gray-600">앱에서 지운 시트 행은 다시 가져오지 않습니다.</li>}
            {board.items.some((i) => i.editedAt) && <li className="text-gray-600">앱에서 고친 칸은 시트 값으로 덮지 않습니다.</li>}
          </ul>

          {warnings.unknownAssignees.length > 0 && (
            <div className="mt-3 rounded-lg bg-[#F7F8FA] p-3">
              <p className="text-sm font-semibold text-black">팀원 목록에 없는 담당자 {warnings.unknownAssignees.length}명 -- 팀원으로 추가할 사람을 고르세요</p>
              <p className="mt-0.5 text-xs text-gray-500">
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
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-accent bg-blue-50 font-semibold text-accent' : 'border-gray-300 bg-white text-gray-600 hover:border-gray-400'}`}
                      title={u.team ?? undefined}
                    >
                      {on ? '✓ ' : ''}
                      {u.name} <span className="text-gray-400">{u.count}</span>
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
              가져오기{addNames.size > 0 ? ` · 팀원 ${addNames.size}명 추가` : ''}
            </Button>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-bold text-green-800">가져왔습니다</p>
          <p className="mt-1 text-sm text-green-800">
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
