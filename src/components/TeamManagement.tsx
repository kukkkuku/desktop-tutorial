import { useMemo, useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Level, MemberTableConfig, PeerReview, TeamMember } from '../types'
import { LEVEL_OPTIONS } from '../types'
import { calcMemberParticipation, GRADE_COLORS } from '../utils/calculations'
import { calcServiceYearMonth, calcYearOrdinal, countFoundingAnniversaries, readFoundingDay, writeFoundingDay } from '../utils/tenure'
import { unmatchedAssigneeSummary } from '../utils/workBoard'
import { useStateHistory } from '../hooks/useStateHistory'
import { normalizeDateText } from '../utils/sheetImport'
import ConfirmDialog from './ConfirmDialog'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import { downloadCurrentMembersExcel } from '../utils/excel'
import { downloadMembersPdf } from '../utils/pdfReports'
import Button from './Button'
import HRCardImportModal from './HRCardImportModal'
import DataGrid, { CHIP_BASE, type CellEdit, type GridColumn } from './grid/DataGrid'
import IconButton from './IconButton'
import { Check, ChevronDown, ChevronRight, IdCard, PanelRightOpen, Redo2, Settings2, Undo2, X } from 'lucide-react'
import { ic, icLg, icSm } from './ui/icon'

// 입사일이 있으면 자동 계산한 근속연차를 우선 쓰고, 없으면 예전처럼 수동 입력된
// yearsOfService(엑셀 업로드 등으로 채워질 수 있음)로 대체 표시한다.
// 근속년월(창립기념일 기준): "1년 8개월(1년)" -- 앞은 입사일부터 만, 괄호는 지난 창립기념일 횟수.
function displayServiceYears(member: TeamMember, foundingDay: string | null): string {
  const ym = calcServiceYearMonth(member.hireDate)
  if (ym) {
    const base = `${ym.years}년 ${ym.months}개월`
    const f = countFoundingAnniversaries(member.hireDate, foundingDay)
    return f === null ? base : `${base}(${f}년)`
  }
  return member.yearsOfService != null ? `${member.yearsOfService}년` : '-'
}

// "직급" 컬럼이 바로 옆에 따로 있으므로, 여기서는 연차만 표시하고 직급명은
// 반복하지 않는다(formatLevelTenureLabel은 "대리 1년차"처럼 직급명을
// 포함해서 다른 화면(성장 관리 등, 직급 컬럼이 따로 없는 곳)에서 쓴다).
function formatTenureOnly(ordinal: number | null): string {
  return ordinal === null ? '-' : `${ordinal}년차`
}

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const { openMemberDetail } = useMemberDetail()
  const history = useStateHistory()
  const [deleting, setDeleting] = useState<TeamMember[] | null>(null)
  const [viewingPeerReviewsFor, setViewingPeerReviewsFor] = useState<TeamMember | null>(null)
  const [deletingPeerReview, setDeletingPeerReview] = useState<PeerReview | null>(null)
  const [pickedUnmatched, setPickedUnmatched] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState('')
  // 시트 담당자 중 팀원 아닌 사람 목록 -- 평소엔 한 줄로 접어 둔다.
  const [unmatchedOpen, setUnmatchedOpen] = useState(false)
  const [hrOpen, setHrOpen] = useState(false)
  function applyHRCards(updates: TeamMember[], adds: TeamMember[]) {
    history.record()
    for (const m of updates) dispatch({ type: 'UPDATE_MEMBER', payload: m })
    for (const m of adds) dispatch({ type: 'ADD_MEMBER', payload: m })
    setHrOpen(false)
    setNotice('')
  }

  const boardTeams = useMemo(
    () => Array.from(new Set(state.workBoard.items.map((i) => i.fields.team).filter(Boolean) as string[])).sort(),
    [state.workBoard.items],
  )
  const workCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of state.workBoard.items) for (const id of i.assigneeIds) m.set(id, (m.get(id) ?? 0) + 1)
    return m
  }, [state.workBoard.items])
  const peerCount = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of state.peerReviews) m.set(r.targetMemberId, (m.get(r.targetMemberId) ?? 0) + 1)
    return m
  }, [state.peerReviews])

  const baseColumns: GridColumn[] = [
    { id: 'name', label: '이름', type: 'text', width: 110, system: true },
    { id: 'hireDate', label: '입사일', type: 'date', width: 110, system: true },
    { id: 'service', label: '근속년월(창립기념일 기준)', type: 'text', width: 170, system: true, readOnly: true },
    { id: 'level', label: '직급', type: 'select', width: 80, system: true, picker: { options: LEVEL_OPTIONS, tone: () => 'bg-black/[0.05] text-label' } },
    { id: 'currentLevelSince', label: '직급 발령일', type: 'date', width: 115, system: true },
    { id: 'levelTenure', label: '직급 연차', type: 'text', width: 80, system: true, readOnly: true },
    { id: 'role', label: '역할', type: 'text', width: 100, system: true },
    { id: 'team', label: '담당팀', type: 'select', width: 125, system: true, picker: { options: boardTeams, allowNew: true, tone: () => 'bg-black/[0.05] text-label' } },
    { id: 'email', label: '이메일', type: 'text', width: 170, system: true },
    {
      id: 'active',
      label: '상태',
      type: 'select',
      width: 80,
      system: true,
      picker: { options: ['활성', '비활성'], tone: (v) => (v === '활성' ? 'bg-success/10 text-success' : 'bg-black/[0.05] text-label-2') },
    },
    { id: 'work', label: '담당 L3', type: 'text', width: 75, system: true, readOnly: true },
    { id: 'tasks', label: '평가과제', type: 'text', width: 80, system: true, readOnly: true },
    { id: 'peer', label: '피어리뷰', type: 'text', width: 95, system: true, readOnly: true },
  ]
  // 열 설정(순서·숨김·폭·이름·추가 열)은 이 평가 프로젝트에 저장한다.
  const cfg: MemberTableConfig = state.memberTable ?? { order: [], hidden: [], widths: {}, labels: {}, custom: [] }
  const customCols: GridColumn[] = cfg.custom.map((c) => ({ id: c.id, label: c.label, type: 'text', width: 140, system: false }))
  const allCols = [...baseColumns, ...customCols]
  const orderIds = [...cfg.order.filter((id) => allCols.some((c) => c.id === id)), ...allCols.map((c) => c.id).filter((id) => !cfg.order.includes(id))]
  const hiddenSet = new Set(cfg.hidden.filter((id) => id !== 'name'))
  const columns: GridColumn[] = orderIds
    .map((id) => allCols.find((c) => c.id === id)!)
    .filter((c) => !hiddenSet.has(c.id))
    .map((c) => ({ ...c, width: cfg.widths[c.id] ?? c.width, label: cfg.labels[c.id] ?? c.label }))
  function saveCfg(patch: Partial<MemberTableConfig>) {
    dispatch({ type: 'SET_MEMBER_TABLE', payload: { ...cfg, order: orderIds, ...patch } })
  }
  function insertColumn(visIndex: number) {
    const id = `c_${uuidv4().slice(0, 8)}`
    let n = cfg.custom.length + 1
    while (allCols.some((c) => c.label === `새 열 ${n}`)) n += 1
    const at = visIndex < columns.length ? orderIds.indexOf(columns[visIndex].id) : orderIds.length
    saveCfg({ custom: [...cfg.custom, { id, label: `새 열 ${n}` }], order: [...orderIds.slice(0, at), id, ...orderIds.slice(at)] })
    setNotice('')
  }
  function deleteColumns(ids: string[]) {
    const custom = ids.filter((id) => cfg.custom.some((c) => c.id === id))
    if (custom.length === 0) {
      setNotice('기본 열은 지울 수 없습니다. 대신 숨길 수 있습니다.')
      return
    }
    history.record()
    saveCfg({ custom: cfg.custom.filter((c) => !custom.includes(c.id)), order: orderIds.filter((id) => !custom.includes(id)) })
  }
  function moveColumns(ids: string[], toVisIndex: number) {
    const moving = orderIds.filter((id) => ids.includes(id))
    const rest = orderIds.filter((id) => !ids.includes(id))
    const target = columns[toVisIndex]?.id
    const at = target && !ids.includes(target) ? rest.indexOf(target) : rest.length
    saveCfg({ order: [...rest.slice(0, at), ...moving, ...rest.slice(at)] })
  }
  const [colMenuOpen, setColMenuOpen] = useState(false)
  const [foundingDay, setFoundingDayState] = useState<string | null>(() => readFoundingDay())
  function setFoundingDay(v: string | null) {
    writeFoundingDay(v)
    setFoundingDayState(v)
  }

  function textOf(m: TeamMember, colId: string): string {
    switch (colId) {
      case 'name':
        return m.name
      case 'hireDate':
        return m.hireDate ?? ''
      case 'service':
        return displayServiceYears(m, foundingDay)
      case 'level':
        return m.level
      case 'currentLevelSince':
        return m.currentLevelSince ?? ''
      case 'levelTenure':
        return formatTenureOnly(calcYearOrdinal(m.currentLevelSince))
      case 'role':
        return m.role
      case 'team':
        return m.team ?? ''
      case 'email':
        return m.email ?? ''
      case 'active':
        return m.active ? '활성' : '비활성'
      case 'work':
        return `${workCount.get(m.id) ?? 0}건`
      case 'tasks':
        return `${calcMemberParticipation(m, state.tasks, state.contributions).count}건`
      case 'peer':
        return `${peerCount.get(m.id) ?? 0}건`
      default:
        return m.extra?.[colId] ?? ''
    }
  }

  // 이름은 비울 수 없고 겹치면 안 된다. 새 행은 "새 팀원"으로 만들어 두고 바로 덮어쓰게 한다.
  function freshName(taken: Set<string>): string {
    let name = '새 팀원'
    for (let n = 2; taken.has(name); n += 1) name = `새 팀원 ${n}`
    taken.add(name)
    return name
  }
  function blankMember(name: string): TeamMember {
    return { id: uuidv4(), name, active: true, level: '', yearsOfService: null, role: '', comment: '', hireDate: null, currentLevelSince: null }
  }

  // edits를 list에 적용한 새 목록. 맞지 않는 값은 건너뛰고 problems에 적는다.
  function withEdits(list: TeamMember[], edits: CellEdit[], problems: string[]): TeamMember[] {
    const next = list.map((m) => ({ ...m }))
    const byId = new Map(next.map((m) => [m.id, m]))
    for (const e of edits) {
      const m = byId.get(e.rowId)
      if (!m) continue
      const v = e.text.trim()
      switch (e.colId) {
        case 'name':
          if (!v) problems.push('이름은 비울 수 없습니다')
          else if (next.some((o) => o.id !== m.id && o.name === v)) problems.push(`'${v}' 팀원이 이미 있습니다`)
          else m.name = v
          break
        case 'hireDate':
        case 'currentLevelSince': {
          const d = v ? normalizeDateText(v) : ''
          if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) problems.push(`'${v}'은(는) 날짜로 읽을 수 없습니다 (예: 2024-03-02)`)
          else m[e.colId] = d || null
          break
        }
        case 'level':
          if (!v || LEVEL_OPTIONS.includes(v as Level)) m.level = v as Level | ''
          else problems.push(`직급 '${v}'은(는) 없는 값입니다`)
          break
        case 'role':
          m.role = v
          break
        case 'team':
          m.team = v || undefined
          break
        case 'email':
          m.email = v || undefined
          break
        case 'active':
          if (v === '활성' || v === '비활성') m.active = v === '활성'
          break
        default:
          if (cfg.custom.some((c) => c.id === e.colId)) {
            const extra = { ...(m.extra ?? {}) }
            if (v) extra[e.colId] = v
            else delete extra[e.colId]
            m.extra = Object.keys(extra).length ? extra : undefined
          }
      }
    }
    return next
  }

  function save(next: TeamMember[], problems: string[]) {
    setNotice(problems.length ? Array.from(new Set(problems)).join(' · ') : '')
    if (JSON.stringify(next) === JSON.stringify(state.members)) return
    history.record()
    // 활성 여부가 바뀐 팀원은 기여도 자동 배분을 다시 해야 해서 UPDATE_MEMBER로 보낸다.
    const prev = new Map(state.members.map((m) => [m.id, m]))
    const sameSet = next.length === state.members.length && next.every((m) => prev.has(m.id))
    if (sameSet) {
      for (const m of next) if (JSON.stringify(m) !== JSON.stringify(prev.get(m.id))) dispatch({ type: 'UPDATE_MEMBER', payload: m })
    } else dispatch({ type: 'IMPORT_MEMBERS', payload: next })
  }

  function commit(edits: CellEdit[]) {
    const problems: string[] = []
    save(withEdits(state.members, edits, problems), problems)
  }

  function insertRows(index: number, count: number) {
    const taken = new Set(state.members.map((m) => m.name))
    const added = Array.from({ length: count }, () => blankMember(freshName(taken)))
    history.record()
    dispatch({ type: 'IMPORT_MEMBERS', payload: [...state.members.slice(0, index), ...added, ...state.members.slice(index)] })
  }

  // 붙여넣기: 표보다 긴 줄은 새 팀원으로 추가한다.
  function paste(rowIndex: number, colIndex: number, matrix: string[][]) {
    const taken = new Set(state.members.map((m) => m.name))
    const nameCol = columns.findIndex((c) => c.id === 'name')
    const list = [...state.members]
    const edits: CellEdit[] = []
    matrix.forEach((line, i) => {
      let m = list[rowIndex + i]
      if (!m) {
        const typed = nameCol >= colIndex ? (line[nameCol - colIndex] ?? '').trim() : ''
        m = blankMember(typed && !taken.has(typed) ? typed : freshName(taken))
        taken.add(m.name)
        list.push(m)
      }
      line.forEach((text, j) => {
        const col = columns[colIndex + j]
        if (col && !col.readOnly) edits.push({ rowId: m!.id, colId: col.id, text })
      })
    })
    const problems: string[] = []
    save(withEdits(list, edits, problems), problems)
  }

  function moveRows(ids: string[], toIndex: number) {
    const set = new Set(ids)
    const moving = state.members.filter((m) => set.has(m.id))
    const rest = state.members.filter((m) => !set.has(m.id))
    const at = state.members.slice(0, toIndex).filter((m) => !set.has(m.id)).length
    history.record()
    dispatch({ type: 'IMPORT_MEMBERS', payload: [...rest.slice(0, at), ...moving, ...rest.slice(at)] })
  }

  function confirmDelete() {
    if (!deleting) return
    history.record()
    for (const m of deleting) dispatch({ type: 'DELETE_MEMBER', payload: { id: m.id } })
    setDeleting(null)
  }

  function renderCell(m: TeamMember, col: GridColumn) {
    if (col.id === 'name')
      return (
        <div className="group/name flex items-center gap-1 py-1.5">
          <span className="min-w-0 flex-1 truncate">{m.name}</span>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => openMemberDetail(m.id)}
            title="팀원 상세 열기"
            className="shrink-0 rounded-control p-0.5 text-label-3 opacity-0 hover:bg-black/[0.07] hover:text-label group-hover/row:opacity-100"
          >
            <PanelRightOpen {...icSm} />
          </button>
        </div>
      )
    if (col.id === 'level') return m.level ? <span className={`${CHIP_BASE} bg-black/[0.05] text-label`}>{m.level}</span> : null
    if (col.id === 'team') return m.team ? <span className={`${CHIP_BASE} bg-black/[0.05] text-label`}>{m.team}</span> : null
    if (col.id === 'active')
      return (
        <span className={`${CHIP_BASE} gap-1.5 ${m.active ? 'bg-success/10 text-success' : 'bg-black/[0.05] text-label-2'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${m.active ? 'bg-success' : 'bg-label-3'}`} />
          {m.active ? '활성' : '비활성'}
        </span>
      )
    if (col.id === 'service' || col.id === 'levelTenure' || col.id === 'work' || col.id === 'tasks')
      return <span className="tabular-nums text-label-2">{textOf(m, col.id)}</span>
    if (col.id === 'peer')
      return (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setViewingPeerReviewsFor(m)}
          className="rounded-full bg-black/[0.05] px-2.5 py-0.5 text-xs font-medium text-label-2 hover:bg-black/[0.08]"
        >
          {textOf(m, 'peer')} 확인
        </button>
      )
    return undefined
  }

  function handleDeletePeerReviewConfirm() {
    if (deletingPeerReview) {
      dispatch({ type: 'DELETE_PEER_REVIEW', payload: { id: deletingPeerReview.id } })
      setDeletingPeerReview(null)
    }
  }

  const peerReviewsForViewing = viewingPeerReviewsFor
    ? state.peerReviews.filter((r) => r.targetMemberId === viewingPeerReviewsFor.id)
    : []


  // 과제관리(시트)에 담당자로 나오지만 팀원 목록에 없는 사람들
  const unmatched = unmatchedAssigneeSummary(state.workBoard)
  function addFromWork(names: string[]) {
    const existingNames = new Set(state.members.map((m) => m.name))
    const added: TeamMember[] = unmatched
      .filter((u) => names.includes(u.name) && !existingNames.has(u.name))
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
    if (added.length > 0) dispatch({ type: 'IMPORT_MEMBERS', payload: [...state.members, ...added] })
    setPickedUnmatched(new Set())
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h3 className="mr-2 text-[17px] font-semibold text-label">팀원 관리</h3>
          <IconButton onClick={history.undo} disabled={!history.canUndo} title="되돌리기 (⌘Z)" aria-label="되돌리기">
            <Undo2 {...ic} />
          </IconButton>
          <IconButton onClick={history.redo} disabled={!history.canRedo} title="다시 하기 (⌘⇧Z)" aria-label="다시 하기">
            <Redo2 {...ic} />
          </IconButton>
          <div className="relative">
            <IconButton onClick={() => setColMenuOpen((v) => !v)} title="표시할 열 · 근속 기준" aria-label="열 표시 설정" className={colMenuOpen ? 'bg-black/[0.05] text-label' : ''}>
              <Settings2 {...ic} />
            </IconButton>
            {colMenuOpen && (
              <div className="mac-pop absolute left-0 top-9 z-30 max-h-[70vh] w-64 overflow-y-auto py-1 text-[13px]" onMouseLeave={() => setColMenuOpen(false)}>
                <label className="flex items-center gap-2 px-3 py-2 text-label-2">
                  창립기념일
                  <input
                    type="text"
                    placeholder="MM-DD"
                    defaultValue={foundingDay ?? ''}
                    onBlur={(e) => {
                      const v = e.target.value.trim().replace(/[./]/g, '-')
                      const m = v.match(/^(\d{1,2})-(\d{1,2})$/)
                      setFoundingDay(m ? `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null)
                    }}
                    className="h-7 w-20 rounded-control border border-hairline px-2 text-center text-[13px]"
                    title="근속년월 괄호 안의 '창립기념일 기준' 년수를 세는 날짜(월-일)"
                  />
                </label>
                <div className="mac-menu-sep" />
                {orderIds.map((id) => {
                  const c = allCols.find((x) => x.id === id)!
                  return (
                    <label key={id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-black/[0.04]">
                      <input
                        type="checkbox"
                        checked={!hiddenSet.has(id)}
                        disabled={id === 'name'}
                        onChange={() => saveCfg({ hidden: hiddenSet.has(id) ? cfg.hidden.filter((x) => x !== id) : [...cfg.hidden, id] })}
                      />
                      <span className="truncate">{cfg.labels[id] ?? c.label}</span>
                      {!c.system && <span className="ml-auto text-[11px] text-label-3">추가</span>}
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            disabled={state.members.length === 0}
            onExcelDownload={() => downloadCurrentMembersExcel(state.members, state.tasks, state.contributions, state.peerReviews)}
            onPdfDownload={() => downloadMembersPdf(teamName, periodName, state.members, state.tasks, state.contributions, state.peerReviews)}
          />
          <Button variant="secondary" onClick={() => setHrOpen(true)} title="종합 인사기록카드 엑셀로 직급·입사일·발령일·소속 맞추기">
            <IdCard {...ic} />
            인사기록 불러오기
          </Button>
        </div>
      </div>
      <p className="mt-1 text-[13px] text-label-2">
        칸을 눌러 바로 입력하고, 표 아래 "팀원 추가"로 한 줄씩 늘립니다. 엑셀에서 여러 줄을 복사해 붙여넣어도 됩니다. 삭제하면 그 팀원의 평가 데이터도 함께 지워집니다.
      </p>

      {unmatched.length > 0 && !unmatchedOpen && (
        <button
          onClick={() => setUnmatchedOpen(true)}
          className="mt-3 flex items-center gap-1 text-[13px] text-label-2 hover:text-accent"
        >
          <ChevronRight {...icSm} />
          과제 담당자 중 팀원 목록에 없는 사람 <span className="font-semibold text-label">{unmatched.length}명</span> · 눌러서 추가
        </button>
      )}
      {unmatched.length > 0 && unmatchedOpen && (
        <div className="mt-4 rounded-card border border-dashed border-separator bg-[#F7F7F9] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <button onClick={() => setUnmatchedOpen(false)} className="flex items-center gap-1 text-[13px] font-semibold text-label hover:text-accent" title="접기">
                <ChevronDown {...icSm} />
                과제 담당자 중 팀원 목록에 없는 사람 {unmatched.length}명
              </button>
              <p className="mt-0.5 text-[13px] text-label-2">
                시트에서 가져온 과제의 담당자입니다. 추가하면 과제관리의 담당자와 자동으로 연결됩니다. 팀원은 평가하기의 기여도 배분에도 들어가니 우리 팀 사람만 추가하세요.
              </p>
            </div>
            <Button variant="primary" onClick={() => addFromWork(Array.from(pickedUnmatched))} disabled={pickedUnmatched.size === 0} size="sm">
              선택한 {pickedUnmatched.size}명 추가
            </Button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unmatched.map((u) => {
              const on = pickedUnmatched.has(u.name)
              return (
                <button
                  key={u.name}
                  onClick={() => {
                    const next = new Set(pickedUnmatched)
                    if (on) next.delete(u.name)
                    else next.add(u.name)
                    setPickedUnmatched(next)
                  }}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${on ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-separator bg-white text-label-2 hover:border-black/25'}`}
                >
                  {on && <Check {...icSm} />}
                  {u.name} <span className="text-label-3">{u.team ? `${u.team} · ` : ''}L3 {u.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="mt-4">
        {notice && <p className="mb-2 text-[13px] text-danger">{notice}</p>}
        <DataGrid
          columns={columns}
          rows={state.members}
          getText={textOf}
          onInsertColumn={insertColumn}
          onDeleteColumns={deleteColumns}
          onHideColumns={(ids) => saveCfg({ hidden: Array.from(new Set([...cfg.hidden, ...ids.filter((id) => id !== 'name')])) })}
          onRenameColumn={(id, label) =>
            cfg.custom.some((c) => c.id === id)
              ? saveCfg({ custom: cfg.custom.map((c) => (c.id === id ? { ...c, label } : c)) })
              : saveCfg({ labels: { ...cfg.labels, [id]: label } })
          }
          onMoveColumns={moveColumns}
          renderCell={renderCell}
          rowClassName={(m) => (m.active ? '' : 'text-label-2')}
          onCommit={commit}
          onPaste={paste}
          onInsertRows={insertRows}
          onDeleteRows={(ids) => setDeleting(state.members.filter((m) => ids.includes(m.id)))}
          onMoveRows={moveRows}
          onResizeColumn={(id, w) => saveCfg({ widths: { ...cfg.widths, [id]: w } })}
          onUndo={history.undo}
          onRedo={history.redo}
          storageKey="members"
          addRowLabel="팀원 추가"
          emptyText="등록된 팀원이 없습니다. 아래 '팀원 추가'를 누르거나 인사기록을 불러오세요."
        />
      </div>

      {hrOpen && <HRCardImportModal members={state.members} onApply={applyHRCards} onClose={() => setHrOpen(false)} />}

      <ConfirmDialog
        open={deleting !== null}
        title={deleting && deleting.length > 1 ? `팀원 ${deleting.length}명 삭제` : '팀원 삭제'}
        message={
          deleting
            ? `${deleting
                .slice(0, 8)
                .map((m) => m.name)
                .join(', ')}${deleting.length > 8 ? ` 외 ${deleting.length - 8}명` : ''}\n\n기여도·피어리뷰·면담 기록도 함께 지워집니다.\n과제관리의 담당자 표시는 이름만 남습니다.\n⌘Z로 되돌릴 수 있습니다.`
            : ''
        }
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />

      {viewingPeerReviewsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="w-full max-w-sm rounded-[12px] bg-white p-5 shadow-dialog">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-[15px] font-semibold text-label">{viewingPeerReviewsFor.name}님이 받은 피어리뷰</h3>
              <IconButton onClick={() => setViewingPeerReviewsFor(null)} aria-label="닫기" className="shrink-0">
                <X {...icLg} />
              </IconButton>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {peerReviewsForViewing.length === 0 ? (
                <p className="rounded-control bg-black/[0.03] px-4 py-4 text-center text-[13px] text-label-2">
                  아직 받은 피어리뷰가 없습니다.
                </p>
              ) : (
                peerReviewsForViewing.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-center justify-between gap-3 rounded-control border border-separator px-4 py-2"
                  >
                    <span className="text-[13px] font-medium text-label">{review.reviewerName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GRADE_COLORS[review.grade]}`}>
                        {review.grade}
                      </span>
                      <Button variant="danger" onClick={() => setDeletingPeerReview(review)} size="sm">
                        삭제
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingPeerReview !== null}
        title="피어리뷰 삭제"
        message={`${deletingPeerReview?.reviewerName}님이 남긴 피어리뷰를 삭제하시겠습니까?`}
        onConfirm={handleDeletePeerReviewConfirm}
        onCancel={() => setDeletingPeerReview(null)}
      />

    </div>
  )
}
