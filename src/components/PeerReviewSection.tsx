import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { useWorkspace } from '../state/WorkspaceContext'
import { downloadMemberPeerReviewTemplates, parseProjectPeerReviewWorkbook } from '../utils/excel'
import { mergePeerReviews } from '../utils/peerReview'
import { evaluationPeriodFolderName, formatEvaluationPeriod } from '../utils/workspace'
import Badge from './Badge'

export default function PeerReviewSection() {
  const { state, dispatch } = useAppState()
  const { activeProject } = useWorkspace()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [generatedMembers, setGeneratedMembers] = useState<string[]>([])
  const [uploadMessage, setUploadMessage] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  if (!activeProject) return null
  const project = activeProject

  const participantIds = new Set(state.contributions.filter((item) => item.contributionPercent > 0).map((item) => item.memberId))
  const ready = state.tasks.length > 0 && state.tasks.every((task) => state.contributions.some((item) => item.taskId === task.id && item.contributionPercent > 0))
  const submittedIds = new Set(state.peerReviews.map((review) => review.reviewerMemberId).filter(Boolean))
  const expectedCount = participantIds.size
  const submittedCount = submittedIds.size
  const status = state.criteria.peerReviewWeight === 0 ? '미사용' : generatedMembers.length === 0 && submittedCount === 0 ? (ready ? '배포 가능' : '준비 전') : submittedCount >= expectedCount && expectedCount > 0 ? '수집 완료' : submittedCount > 0 ? '수집 중' : '양식 생성됨'

  function setTaskParticipant(taskId: string, memberId: string, participating: boolean) {
    const selectedIds = state.members
      .filter((member) => state.contributions.some((item) => item.taskId === taskId && item.memberId === member.id && item.contributionPercent > 0))
      .map((member) => member.id)
    const nextIds = participating
      ? Array.from(new Set([...selectedIds, memberId]))
      : selectedIds.filter((id) => id !== memberId)
    const base = nextIds.length > 0 ? Math.floor(100 / nextIds.length) : 0
    const remainder = nextIds.length > 0 ? 100 - base * nextIds.length : 0
    state.members.forEach((member) => {
      const index = nextIds.indexOf(member.id)
      const contributionPercent = index < 0 ? 0 : base + (index < remainder ? 1 : 0)
      dispatch({ type: 'SET_CONTRIBUTION_PERCENT', payload: { taskId, memberId: member.id, contributionPercent } })
    })
    setGeneratedMembers([])
  }

  async function generateFiles() {
    const generated = await downloadMemberPeerReviewTemplates({
      projectId: project.id,
      periodLabel: formatEvaluationPeriod(project.period),
      periodFileName: evaluationPeriodFolderName(project.period),
      tasks: state.tasks,
      members: state.members,
      contributions: state.contributions,
      includeGrade: state.criteria.personalGradeWeight > 0,
    })
    setGeneratedMembers(generated)
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    let merged = state.peerReviews
    let validFiles = 0
    let invalidFiles = 0
    const issues: string[] = []
    for (const file of Array.from(files)) {
      if (!/\.xlsx?$/i.test(file.name)) { invalidFiles += 1; continue }
      try {
        const result = parseProjectPeerReviewWorkbook(await file.arrayBuffer(), project.id, state.tasks, state.members, state.contributions, state.criteria.personalGradeWeight > 0, formatEvaluationPeriod(project.period))
        if (result.reviews.length === 0) invalidFiles += 1
        else { merged = mergePeerReviews(merged, result.reviews); validFiles += 1 }
        if (result.errors.length > 0) issues.push(`${file.name}: ${result.errors.slice(0, 2).join(' ')}`)
      } catch { invalidFiles += 1; issues.push(`${file.name}: 파일을 읽을 수 없습니다.`) }
    }
    if (validFiles > 0) dispatch({ type: 'IMPORT_PEER_REVIEWS', payload: merged })
    setUploadMessage(`${files.length}개 중 ${validFiles}개 반영${invalidFiles ? ` / ${invalidFiles}개 확인 필요` : ''}${issues.length ? ` · ${issues.join(' · ')}` : ''}`)
  }

  return (
    <section className="mb-4 space-y-5 py-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3"><h3 className="ui-section-title">피어리뷰</h3><Badge tone={status === '수집 완료' ? 'success' : 'neutral'}>{status}</Badge><span className="text-sm text-gray-500">{submittedCount} / {expectedCount}명 제출</span></div>
        <div className="flex gap-2"><button type="button" disabled={!ready} onClick={() => setDialogOpen(true)} className="ui-button ui-button-primary">팀원별 양식 만들기</button><button type="button" onClick={() => inputRef.current?.click()} className="ui-button ui-button-secondary">결과 업로드</button><input ref={inputRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(event) => { void upload(event.target.files); event.target.value = '' }} /></div>
      </div>

      <div>
        <div className="mb-2 flex items-end justify-between gap-3"><div><h4 className="text-sm font-semibold text-gray-950">과제별 참여 팀원</h4><p className="mt-1 text-xs text-gray-500">체크한 팀원에게 해당 과제가 포함된 피어리뷰 양식을 만듭니다. 기여도는 선택 인원에게 합계 100%로 균등 배분됩니다.</p></div><span className="text-xs font-medium text-gray-500">{ready ? '배정 완료' : '배정 필요'}</span></div>
        {state.tasks.length === 0 || state.members.length === 0 ? <p className="ui-empty">과제와 팀원을 먼저 등록하세요.</p> : <div className="ui-table-wrap"><table className="ui-table min-w-[720px]"><thead><tr><th>과제</th>{state.members.map((member) => <th key={member.id} className="text-center">{member.name}</th>)}</tr></thead><tbody>{state.tasks.map((task) => <tr key={task.id}><td className="font-medium text-gray-950">{task.name}</td>{state.members.map((member) => { const checked = state.contributions.some((item) => item.taskId === task.id && item.memberId === member.id && item.contributionPercent > 0); return <td key={member.id} className="text-center"><label className="inline-flex cursor-pointer items-center justify-center"><input type="checkbox" checked={checked} onChange={(event) => setTaskParticipant(task.id, member.id, event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-accent focus:ring-accent" /><span className="sr-only">{task.name} - {member.name} 참여</span></label></td> })}</tr>)}</tbody></table></div>}
      </div>

      {!ready && state.tasks.length > 0 && state.members.length > 0 && <p className="text-sm text-gray-500">모든 과제에 참여 팀원을 한 명 이상 배정하면 양식을 만들 수 있습니다.</p>}
      {state.criteria.peerReviewWeight === 0 && <p className="text-sm text-gray-500">현재 평가기준에서 피어리뷰가 미사용 상태입니다. 데이터는 생성·업로드할 수 있으며 계산에는 반영되지 않습니다.</p>}
      {generatedMembers.length > 0 && <p className="text-sm text-success">팀원별 양식 {generatedMembers.length}개가 생성되었습니다. 다운로드된 파일을 각 팀원에게 배포하세요.</p>}
      {uploadMessage && <p className="text-sm text-gray-600">{uploadMessage}</p>}
      {dialogOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4"><div role="dialog" aria-modal="true" aria-labelledby="peer-template-title" className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-lg"><h2 id="peer-template-title" className="text-lg font-semibold text-gray-950">피어리뷰 양식 만들기</h2><dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm"><dt className="text-gray-500">대상 평가기간</dt><dd>{formatEvaluationPeriod(activeProject.period)}</dd><dt className="text-gray-500">과제</dt><dd>{state.tasks.length}개</dd><dt className="text-gray-500">참여 팀원</dt><dd>{expectedCount}명</dd><dt className="text-gray-500">생성 방식</dt><dd className="font-medium">팀원별 개별 파일 생성</dd></dl><p className="mt-4 text-sm leading-6 text-gray-600">각 팀원에게 본인이 참여한 과제만 포함된 파일이 생성됩니다.</p>{generatedMembers.length > 0 && <p className="mt-3 text-sm text-success">{generatedMembers.length}명 파일 생성 완료</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setDialogOpen(false)} className="ui-button ui-button-secondary">닫기</button><button type="button" onClick={() => void generateFiles()} className="ui-button ui-button-primary">Excel 양식 생성</button></div></div></div>}
    </section>
  )
}
