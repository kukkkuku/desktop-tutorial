import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAppState } from '../state/AppContext'
import { useMemberDetail } from '../state/MemberDetailContext'
import { useWorkspaces } from '../state/WorkspaceContext'
import type { Level, PeerReview, TeamMember } from '../types'
import { LEVEL_OPTIONS } from '../types'
import { calcMemberParticipation, GRADE_COLORS } from '../utils/calculations'
import { calcYearsSince } from '../utils/tenure'
import { useResizableColumns } from '../hooks/useResizableColumns'
import ConfirmDialog from './ConfirmDialog'
import ResizableTh from './table/ResizableTh'
import TitleUploadControls from './TitleUploadControls'
import CurrentDataDownloadControls from './CurrentDataDownloadControls'
import EmptyStateDropzone from './EmptyStateDropzone'
import { downloadCurrentMembersExcel, downloadMemberTemplate, parseMemberWorkbook } from '../utils/excel'
import { downloadMembersPdf } from '../utils/pdfReports'
import Button from './Button'
import IconButton from './IconButton'

// service/levelTenure는 수정 모드에서 <input type="date">가 들어가는데,
// 셀 자체의 px-4(32px) 패딩을 빼고도 "mm/dd/yyyy" + 달력 아이콘이 잘리지
// 않을 만큼 넉넉히 잡아야 한다(150px로는 마지막 자리가 잘려 보였다).
const TEAM_COLUMNS = {
  name: 140,
  service: 190,
  level: 90,
  levelTenure: 190,
  role: 140,
  tasks: 110,
  peer: 130,
  active: 100,
  manage: 100,
}

interface MemberFormValues {
  name: string
  level: Level | ''
  role: string
  hireDate: string
  currentLevelSince: string
}

const EMPTY_FORM: MemberFormValues = { name: '', level: '', role: '', hireDate: '', currentLevelSince: '' }

// 입사일이 있으면 자동 계산한 근속연차를 우선 쓰고, 없으면 예전처럼 수동 입력된
// yearsOfService(엑셀 업로드 등으로 채워질 수 있음)로 대체 표시한다.
function displayServiceYears(member: TeamMember): string {
  const auto = calcYearsSince(member.hireDate)
  if (auto !== null) return `${auto}년`
  return member.yearsOfService != null ? `${member.yearsOfService}년` : '-'
}

// "직급" 컬럼이 바로 옆에 따로 있으므로, 여기서는 연차만 표시하고 직급명은
// 반복하지 않는다(formatLevelTenureLabel은 "대리 1년차"처럼 직급명을
// 포함해서 다른 화면(성장 관리 등, 직급 컬럼이 따로 없는 곳)에서 쓴다).
function formatTenureOnly(years: number | null): string {
  if (years === null) return '-'
  return years === 0 ? '1년차 미만' : `${years}년차`
}

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const { currentWorkspace } = useWorkspaces()
  const teamName = currentWorkspace?.teamName ?? ''
  const periodName = currentWorkspace?.periodName ?? ''
  const cols = useResizableColumns(TEAM_COLUMNS)
  const { openMemberDetail } = useMemberDetail()
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null)
  const [viewingPeerReviewsFor, setViewingPeerReviewsFor] = useState<TeamMember | null>(null)
  const [deletingPeerReview, setDeletingPeerReview] = useState<PeerReview | null>(null)

  const [newForm, setNewForm] = useState<MemberFormValues>(EMPTY_FORM)
  const [newFormError, setNewFormError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<MemberFormValues>(EMPTY_FORM)
  const [editFormError, setEditFormError] = useState('')

  function handleQuickAdd() {
    const trimmedName = newForm.name.trim()
    if (!trimmedName) {
      setNewFormError('이름을 입력하세요.')
      return
    }
    if (state.members.some((m) => m.name === trimmedName)) {
      setNewFormError(`팀원명 '${trimmedName}'은(는) 이미 존재합니다.`)
      return
    }
    const member: TeamMember = {
      id: uuidv4(),
      name: trimmedName,
      active: true,
      level: newForm.level,
      yearsOfService: null,
      role: newForm.role.trim(),
      comment: '',
      hireDate: newForm.hireDate || null,
      currentLevelSince: newForm.currentLevelSince || null,
    }
    dispatch({ type: 'ADD_MEMBER', payload: member })
    setNewForm(EMPTY_FORM)
    setNewFormError('')
  }

  function startEdit(member: TeamMember) {
    setEditingId(member.id)
    setEditForm({
      name: member.name,
      level: member.level,
      role: member.role,
      hireDate: member.hireDate ?? '',
      currentLevelSince: member.currentLevelSince ?? '',
    })
    setEditFormError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditFormError('')
  }

  function saveEdit(member: TeamMember) {
    const trimmedName = editForm.name.trim()
    if (!trimmedName) {
      setEditFormError('이름을 입력하세요.')
      return
    }
    if (state.members.some((m) => m.name === trimmedName && m.id !== member.id)) {
      setEditFormError(`팀원명 '${trimmedName}'은(는) 이미 존재합니다.`)
      return
    }
    dispatch({
      type: 'UPDATE_MEMBER',
      payload: {
        ...member,
        name: trimmedName,
        level: editForm.level,
        role: editForm.role.trim(),
        hireDate: editForm.hireDate || null,
        currentLevelSince: editForm.currentLevelSince || null,
      },
    })
    setEditingId(null)
  }

  function toggleActive(member: TeamMember) {
    dispatch({ type: 'UPDATE_MEMBER', payload: { ...member, active: !member.active } })
  }

  function handleDeleteConfirm() {
    if (deletingMember) {
      dispatch({ type: 'DELETE_MEMBER', payload: { id: deletingMember.id } })
      setDeletingMember(null)
    }
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

  async function handleUploadFiles(files: File[]) {
    let list = state.members
    let addedCount = 0
    let updatedCount = 0
    const errors: string[] = []
    for (const file of files) {
      const buffer = await file.arrayBuffer()
      const result = parseMemberWorkbook(buffer, list)
      list = result.members
      addedCount += result.addedCount
      updatedCount += result.updatedCount
      errors.push(...result.errors.map((m) => (files.length > 1 ? `[${file.name}] ${m}` : m)))
    }
    dispatch({ type: 'IMPORT_MEMBERS', payload: list })
    return { addedCount, updatedCount, errors }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-black">팀원 관리</h3>
        <div className="flex flex-wrap items-center gap-2">
          <CurrentDataDownloadControls
            disabled={state.members.length === 0}
            onExcelDownload={() => downloadCurrentMembersExcel(state.members, state.tasks, state.contributions, state.peerReviews)}
            onPdfDownload={() => downloadMembersPdf(teamName, periodName, state.members, state.tasks, state.contributions, state.peerReviews)}
          />
          <TitleUploadControls busyLabel="팀원 업로드 중..." onDownload={downloadMemberTemplate} onFiles={handleUploadFiles} />
        </div>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        팀원을 추가/삭제하면 평가 매트릭스의 열(컬럼)이 자동으로 반영됩니다. 삭제 시 해당 팀원의 모든 평가 데이터도 함께 제거됩니다.
      </p>

      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        {/* 과제 관리의 빠른 추가 폼과 같은 구조: 한 줄짜리 그리드에 모든
            필드 + 버튼을 나란히 배치한다(예전엔 입사일/현 직급 발령일이
            둘째 줄로 밀려서 두 줄짜리 폼이었다). 필드 순서도 아래 표
            컬럼 순서(이름-근속(입사일)-직급-연차(현 직급 발령일)-역할)와
            맞췄다. */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[2fr_1.4fr_1fr_1.4fr_1.6fr_auto]">
          <div>
            <label className="block text-sm font-medium text-black">
              이름 <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              value={newForm.name}
              onChange={(e) => setNewForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="예: 홍길동"
              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-black ${
                newFormError ? 'border-danger' : 'border-gray-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">입사일</label>
            <input
              type="date"
              value={newForm.hireDate}
              onChange={(e) => setNewForm((f) => ({ ...f, hireDate: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">직급</label>
            <select
              value={newForm.level}
              onChange={(e) => setNewForm((f) => ({ ...f, level: e.target.value as Level | '' }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            >
              <option value="">-</option>
              {LEVEL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-black">현 직급 발령일</label>
            <input
              type="date"
              value={newForm.currentLevelSince}
              onChange={(e) => setNewForm((f) => ({ ...f, currentLevelSince: e.target.value }))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-black">역할</label>
            <input
              type="text"
              value={newForm.role}
              onChange={(e) => setNewForm((f) => ({ ...f, role: e.target.value }))}
              placeholder="예: 리드, 기획, 디자인"
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black"
            />
          </div>
          <div className="flex items-end">
            <Button variant="primary" onClick={handleQuickAdd} className="w-full whitespace-nowrap sm:w-auto">
              + 팀원 추가
            </Button>
          </div>
        </div>
        {newFormError && <p className="mt-2 text-xs text-danger">{newFormError}</p>}
      </div>

      {state.members.length === 0 ? (
        <EmptyStateDropzone
          title="등록된 팀원이 없습니다"
          addHint="위의 '+ 팀원 추가' 버튼으로 하나씩 등록하거나, 엑셀 파일로 한 번에 등록하세요"
          busyLabel="팀원 업로드 중..."
          onDownloadTemplate={downloadMemberTemplate}
          onFiles={handleUploadFiles}
        />
      ) : (
      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="table-fixed text-left text-sm" style={{ width: '100%', minWidth: cols.totalWidth - cols.widths.role }}>
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              {(
                [
                  ['name', '이름'],
                  ['service', '근속 (입사일)'],
                  ['level', '직급'],
                  ['levelTenure', '연차 (발령일)'],
                  ['role', '역할'],
                  ['tasks', '참여 과제 수'],
                  ['peer', '받은 피어리뷰'],
                  ['active', '활성여부'],
                  ['manage', '관리'],
                ] as const
              ).map(([key, label]) => (
                <ResizableTh
                  key={key}
                  width={key === 'role' ? undefined : cols.widths[key]}
                  resizable={key !== 'manage'}
                  onResizeStart={cols.startResize(key)}
                  onResizeMove={cols.onResizeMove}
                  onResizeEnd={cols.onResizeEnd}
                >
                  {label}
                </ResizableTh>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.members.map((member) => {
              const { count } = calcMemberParticipation(member, state.tasks, state.contributions)
              const peerReviewCount = state.peerReviews.filter((r) => r.targetMemberId === member.id).length
              const isEditing = editingId === member.id

              if (isEditing) {
                return (
                  <tr key={member.id} className="border-t border-gray-200 bg-blue-50/40 text-black">
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                        className={`w-full rounded-md border px-2 py-1.5 text-sm text-black ${
                          editFormError ? 'border-danger' : 'border-gray-300'
                        }`}
                      />
                      {editFormError && <p className="mt-1 text-xs text-danger">{editFormError}</p>}
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="date"
                        value={editForm.hireDate}
                        onChange={(e) => setEditForm((f) => ({ ...f, hireDate: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <select
                        value={editForm.level}
                        onChange={(e) => setEditForm((f) => ({ ...f, level: e.target.value as Level | '' }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                      >
                        <option value="">-</option>
                        {LEVEL_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="date"
                        value={editForm.currentLevelSince}
                        onChange={(e) => setEditForm((f) => ({ ...f, currentLevelSince: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                      />
                    </td>
                    <td className="px-4 py-2 align-top">
                      <input
                        type="text"
                        value={editForm.role}
                        onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value }))}
                        className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm text-black"
                      />
                    </td>
                    <td className="px-4 py-3 align-top text-gray-500">{count}건</td>
                    <td className="px-4 py-3 align-top text-gray-500">{peerReviewCount}건</td>
                    <td className="px-4 py-3 align-top">
                      <button
                        onClick={() => toggleActive(member)}
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                          member.active ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${member.active ? 'bg-success' : 'bg-gray-400'}`} />
                        {member.active ? '활성' : '비활성'}
                      </button>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-1">
                        <IconButton onClick={() => saveEdit(member)} title="저장" aria-label="저장">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </IconButton>
                        <IconButton onClick={cancelEdit} title="취소" aria-label="취소" tone="danger">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                            <path d="M18 6 6 18" />
                            <path d="m6 6 12 12" />
                          </svg>
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                )
              }

              const levelTenureYears = calcYearsSince(member.currentLevelSince)
              return (
                <tr key={member.id} className="border-t border-gray-200 text-black">
                  <td className="px-4 py-3 font-medium">
                    <button onClick={() => openMemberDetail(member.id)} className="text-left hover:text-accent hover:underline">
                      {member.name}
                    </button>
                  </td>
                  <td className="px-4 py-3">{displayServiceYears(member)}</td>
                  <td className="px-4 py-3">{member.level || '-'}</td>
                  <td className="px-4 py-3">{formatTenureOnly(levelTenureYears)}</td>
                  <td className="px-4 py-3">{member.role || '-'}</td>
                  <td className="px-4 py-3">{count}건</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setViewingPeerReviewsFor(member)}
                      className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      {peerReviewCount}건 확인
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleActive(member)}
                      title="클릭해서 활성/비활성 전환"
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        member.active ? 'bg-success/10 text-success hover:bg-success/20' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${member.active ? 'bg-success' : 'bg-gray-400'}`} />
                      {member.active ? '활성' : '비활성'}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <IconButton onClick={() => startEdit(member)} title="수정" aria-label="수정">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
                        </svg>
                      </IconButton>
                      <span className="h-4 w-px bg-gray-200" />
                      <IconButton onClick={() => setDeletingMember(member)} title="삭제" aria-label="삭제" tone="danger">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                          <path d="M3 6h18" />
                          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          <path d="M10 11v6" />
                          <path d="M14 11v6" />
                        </svg>
                      </IconButton>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      )}

      <ConfirmDialog
        open={deletingMember !== null}
        title="팀원 삭제"
        message={`'${deletingMember?.name}' 팀원을 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingMember(null)}
      />

      {viewingPeerReviewsFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <h3 className="text-lg font-bold text-black">{viewingPeerReviewsFor.name}님이 받은 피어리뷰</h3>
              <IconButton onClick={() => setViewingPeerReviewsFor(null)} aria-label="닫기" className="shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-5 w-5">
                  <path d="M18 6 6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </IconButton>
            </div>
            <div className="mt-4 max-h-[60vh] space-y-2 overflow-y-auto">
              {peerReviewsForViewing.length === 0 ? (
                <p className="rounded-md bg-gray-50 px-4 py-4 text-center text-sm text-gray-500">
                  아직 받은 피어리뷰가 없습니다.
                </p>
              ) : (
                peerReviewsForViewing.map((review) => (
                  <div
                    key={review.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-2"
                  >
                    <span className="text-sm font-medium text-black">{review.reviewerName}</span>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${GRADE_COLORS[review.grade]}`}>
                        {review.grade}
                      </span>
                      <Button variant="danger" onClick={() => setDeletingPeerReview(review)} className="px-2.5 py-1 text-xs">
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
