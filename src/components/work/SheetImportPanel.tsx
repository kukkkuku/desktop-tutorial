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
  distinctTeams,
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
}

type Source = 'link' | 'file'

interface TabOption {
  title: string
  hidden: boolean
  sheetId?: number
}

export default function SheetImportPanel({ onDone }: Props) {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const board = state.workBoard
  const link = board.sheetLink

  const [source, setSource] = useState<Source>(isSheetsApiConfigured() ? 'link' : 'file')
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
  const [teamFilter, setTeamFilter] = useState<string | null>(null)
  const [onlyTeamRows, setOnlyTeamRows] = useState(false)
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
    setTeamFilter(sameTab ? link.teamFilter : null)
    setOnlyTeamRows(Boolean(sameTab && link.teamFilter))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [header, raw])

  const rows = useMemo(() => (filled && header ? parseRows(filled, header, columnMap) : []), [filled, header, columnMap])
  const groups = useMemo(() => summarizeGroups(rows), [rows])
  const teams = useMemo(() => distinctTeams(rows), [rows])
  const importRows = useMemo(() => filterRows(rows, Array.from(selected), onlyTeamRows ? teamFilter : null), [rows, selected, onlyTeamRows, teamFilter])
  const warnings = useMemo(() => collectWarnings(importRows, state.members), [importRows, state.members])

  // 기본으로 체크할 새 팀원: 고른 담당팀 과제를 2건 이상 맡은 사람만. 다른 팀
  // 사람까지 팀원으로 넣으면 평가의 기여도 자동 배분에도 들어가고, 담당자 칸에는
  // "방인용\n국내"처럼 이름이 아닌 값도 섞여 있어서 한 번만 나온 이름은 사람이
  // 직접 고르게 둔다.
  useEffect(() => {
    setAddNames(new Set(teamFilter ? warnings.unknownAssignees.filter((u) => u.team === teamFilter && u.count >= 2).map((u) => u.name) : []))
  }, [warnings.unknownAssignees, teamFilter])

  // 트리: H › L1 › L2
  const tree = useMemo(() => {
    const byH = new Map<string, Map<string, typeof groups>>()
    for (const g of groups) {
      const h = g.h ?? '(H 없음)'
      const l1 = g.l1 ?? '(L1 없음)'
      if (!byH.has(h)) byH.set(h, new Map())
      const m = byH.get(h)!
      if (!m.has(l1)) m.set(l1, [])
      m.get(l1)!.push(g)
    }
    return byH
  }, [groups])

  function toggle(names: string[], on: boolean) {
    const next = new Set(selected)
    names.forEach((n) => (on ? next.add(n) : next.delete(n)))
    setSelected(next)
  }

  function selectByTeam(team: string | null) {
    setTeamFilter(team)
    if (team) setSelected(new Set(groups.filter((g) => g.teams.some((t) => t.team === team)).map((g) => g.name)))
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
      teamFilter: onlyTeamRows ? teamFilter : null,
      lastFetchedAt: new Date().toISOString(),
    }
    const res = applySheetImport(board, importRows, header, members, nextLink)
    if (newMembers.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: members })
    dispatch({ type: 'SET_WORK_BOARD', payload: res.board })
    setResult(res)
  }

  const mappedCount = SYSTEM_COLUMNS.filter((c) => columnMap[c.id] !== null && columnMap[c.id] !== undefined).length
  const unmapped = SYSTEM_COLUMNS.filter((c) => c.id !== COL_NAME && (columnMap[c.id] === null || columnMap[c.id] === undefined))
  const selectedCount = groups.filter((g) => selected.has(g.name)).reduce((s, g) => s + g.count, 0)

  // ---------- 화면 ----------

  return (
    <div className="space-y-5">
      <Section n={1} title="불러올 곳">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1 text-sm">
          {(
            [
              ['link', '구글시트 링크'],
              ['file', 'xlsx 파일'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSource(k)}
              disabled={k === 'link' && !isSheetsApiConfigured()}
              className={`flex-1 rounded-md py-1.5 font-medium disabled:text-gray-300 ${source === k ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-black'}`}
            >
              {label}
            </button>
          ))}
        </div>
        {source === 'link' ? (
          <div className="mt-3 flex gap-2">
            <input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadFromLink()}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-accent"
            />
            <Button onClick={loadFromLink} disabled={!urlInput.trim() || loading !== null} className="h-9 px-4">
              {link && parseSheetUrl(urlInput)?.spreadsheetId === link.spreadsheetId ? '다시 불러오기' : '불러오기'}
            </Button>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-3">
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
            <Button variant="secondary" onClick={() => fileRef.current?.click()} className="h-9 px-4">
              xlsx 파일 고르기
            </Button>
            <span className="text-xs text-gray-500">구글시트에서 파일 › 다운로드 › Microsoft Excel(.xlsx)로 받은 파일</span>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {source === 'link'
            ? '처음 한 번 "시트 읽기(읽기 전용)" 권한을 묻습니다. 지금 로그인한 계정에 시트 보기 권한이 있어야 합니다. 앱은 시트를 고치지 않습니다.'
            : '링크 연결이 안 될 때 쓰는 대체 경로입니다. 읽는 방식은 같습니다.'}
        </p>
        {loading && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-gray-500">
            <Spinner className="h-3.5 w-3.5 text-accent" />
            {loading}
          </p>
        )}
        {error && <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
      </Section>

      {tabs.length > 0 && (
        <Section n={2} title="탭" hint={bookTitle}>
          <select
            value={tabName ?? ''}
            onChange={(e) => changeTab(e.target.value)}
            className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-accent"
          >
            {tabs.map((t) => (
              <option key={t.title} value={t.title}>
                {t.title}
                {t.hidden ? ' (숨김)' : ''}
              </option>
            ))}
          </select>
          {raw && !header && (
            <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-danger">
              이 탭에서 'L2'·'L3' 머리글을 찾지 못했습니다. 「YYYY 추진현황」처럼 H/L1/L2/L3 열이 있는 탭을 골라 주세요.
            </p>
          )}
        </Section>
      )}

      {header && (
        <Section n={3} title="열 매칭" hint={`시트 머리글 이름으로 ${mappedCount}/${SYSTEM_COLUMNS.length}개를 찾았습니다 · 주차 ${header.weekCols.length}칸`}>
          {unmapped.length > 0 && !mapOpen && (
            <p className="text-xs text-orange-600">못 찾은 열: {unmapped.map((c) => c.label).join(', ')} -- 비워 두면 그 값은 가져오지 않습니다.</p>
          )}
          <button onClick={() => setMapOpen((v) => !v)} className="mt-1 text-xs font-medium text-accent hover:underline">
            {mapOpen ? '접기' : '매칭 확인·수정'}
          </button>
          {mapOpen && (
            <div className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
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
        </Section>
      )}

      {header && groups.length > 0 && (
        <Section n={4} title="L2 고르기" hint={`L2 ${groups.length}개 · L3 ${rows.length}건 중 ${selected.size}개 · ${selectedCount}건 선택`}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-gray-600">담당팀으로 빠르게 고르기</span>
            <select
              value={teamFilter ?? ''}
              onChange={(e) => selectByTeam(e.target.value || null)}
              className="h-8 rounded-md border border-gray-300 px-1.5 text-sm"
            >
              <option value="">(선택 안 함)</option>
              {teams.map((t) => (
                <option key={t.team} value={t.team}>
                  {t.team} ({t.count})
                </option>
              ))}
            </select>
            <label className={`flex items-center gap-1.5 ${teamFilter ? '' : 'text-gray-300'}`}>
              <input type="checkbox" disabled={!teamFilter} checked={onlyTeamRows && Boolean(teamFilter)} onChange={(e) => setOnlyTeamRows(e.target.checked)} />
              고른 L2 안에서도 이 팀 담당 L3만
            </label>
            <span className="ml-auto flex gap-2 text-xs">
              <button onClick={() => toggle(groups.map((g) => g.name), true)} className="text-accent hover:underline">
                전체 선택
              </button>
              <button onClick={() => setSelected(new Set())} className="text-gray-500 hover:underline">
                선택 해제
              </button>
            </span>
          </div>

          <div className="mt-3 max-h-[360px] overflow-y-auto rounded-lg border border-gray-200">
            {Array.from(tree.entries()).map(([h, l1s]) => {
              const hNames = Array.from(l1s.values()).flat().map((g) => g.name)
              const hOn = hNames.every((n) => selected.has(n))
              return (
                <div key={h} className="border-b border-gray-100 last:border-b-0">
                  <label className="flex items-center gap-2 bg-[#F4F5F7] px-3 py-1.5 text-sm font-bold">
                    <input type="checkbox" checked={hOn} ref={(el) => el && (el.indeterminate = !hOn && hNames.some((n) => selected.has(n)))} onChange={(e) => toggle(hNames, e.target.checked)} />
                    {h}
                  </label>
                  {Array.from(l1s.entries()).map(([l1, gs]) => {
                    const l1Names = gs.map((g) => g.name)
                    const l1On = l1Names.every((n) => selected.has(n))
                    return (
                      <div key={l1}>
                        <label className="flex items-center gap-2 px-3 py-1 pl-7 text-sm font-semibold text-gray-700">
                          <input
                            type="checkbox"
                            checked={l1On}
                            ref={(el) => el && (el.indeterminate = !l1On && l1Names.some((n) => selected.has(n)))}
                            onChange={(e) => toggle(l1Names, e.target.checked)}
                          />
                          {l1}
                        </label>
                        {gs.map((g) => (
                          <label key={g.name} className="flex cursor-pointer items-start gap-2 px-3 py-1 pl-12 text-sm hover:bg-blue-50/40">
                            <input type="checkbox" className="mt-1" checked={selected.has(g.name)} onChange={(e) => toggle([g.name], e.target.checked)} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-1.5">
                                {g.tag && <span className="rounded bg-[#14161A] px-1.5 text-[11px] font-bold leading-5 text-white">{g.tag}</span>}
                                <span className="truncate">{g.name}</span>
                                {g.inferred && (
                                  <span className="text-xs text-orange-500" title="시트의 H/L1 병합이 끊겨 위 행 값으로 채웠습니다">
                                    추정
                                  </span>
                                )}
                                {board.groups.some((bg) => bg.name === g.name) && <span className="text-xs text-green-600">가져옴</span>}
                              </span>
                              <span className="block text-xs text-gray-500">
                                L3 {g.count} · {g.teams.map((t) => `${t.team} ${t.count}`).join(' / ') || '담당팀 없음'}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {header && selected.size > 0 && !result && (
        <Section n={5} title="확인하고 가져오기" hint={`L3 ${importRows.length}건`}>
          <ul className="space-y-1.5 text-sm">
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
            <div className="mt-3 rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-semibold text-black">팀원 목록에 없는 담당자 {warnings.unknownAssignees.length}명</p>
              <p className="mt-0.5 text-xs text-gray-500">
                체크한 사람만 팀원으로 추가합니다. 추가하지 않아도 과제관리에는 이름이 그대로 보이고, 나중에 팀원관리에서 추가하면 자동으로 연결됩니다. 팀원으로 추가하면
                평가하기의 기여도 자동 배분에도 들어가니 우리 팀 사람만 고르세요.
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
                      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-accent bg-blue-50 font-semibold text-accent' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}
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

          <div className="mt-4 flex justify-end">
            <Button onClick={doImport} disabled={importRows.length === 0} className="px-5 py-2">
              L3 {importRows.length}건 가져오기{addNames.size > 0 ? ` · 팀원 ${addNames.size}명 추가` : ''}
            </Button>
          </div>
        </Section>
      )}

      {result && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-bold text-green-800">가져왔습니다</p>
          <p className="mt-1 text-sm text-green-800">
            새 L2 {result.newGroups}개 · 새 L3 {result.added}건 · 바뀐 L3 {result.updated}건
            {result.keptEdits > 0 && ` · 앱에서 고친 값 ${result.keptEdits}칸 유지`}
            {result.missing > 0 && ` · 시트에 없어진 행 ${result.missing}건 표시`}
            {result.skippedDeleted > 0 && ` · 앱에서 지운 행 ${result.skippedDeleted}건 건너뜀`}
          </p>
          <div className="mt-3 flex gap-2">
            {onDone && <Button onClick={onDone}>과제관리에서 보기</Button>}
            <Button variant="secondary" onClick={() => setResult(null)}>
              다시 고르기
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#14161A] text-[11px] font-bold text-white">{n}</span>
        <h3 className="text-sm font-bold text-black">{title}</h3>
        {hint && <span className="truncate text-xs text-gray-500">{hint}</span>}
      </div>
      <div className="pl-7">{children}</div>
    </section>
  )
}
