import JSZip from 'jszip'
import type { Contribution, Criteria, MeetingNote, PeerReview, Task, TeamMember } from '../types'
import { calcAllTaskScores, calcMemberResults, calcTaskScore } from './calculations'
import { calcYearsSince } from './tenure'
import { buildPdfBlob, downloadPdfReport, type ReportSection } from './pdfReport'
import { saveBlobLocally } from './localSave'

// 각 화면(과제/팀원/피어리뷰/평가 매트릭스/결과)의 "지금 입력된 데이터"를
// pdfReport의 공용 리포트 템플릿에 맞춰 채워 넣는다 -- 엑셀(원본 데이터)과
// 달리 한눈에 훑어볼 요약 통계 + 표로 구성된 인쇄용 문서.

export async function downloadTasksPdf(teamName: string, periodName: string, tasks: Task[], criteria: Criteria) {
  const scores = tasks.map((t) => calcTaskScore(t, criteria))
  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const coreCount = tasks.filter((t) => t.importance === '핵심').length

  const section: ReportSection = {
    title: '과제 목록',
    countLabel: `${tasks.length}건`,
    columns: ['과제명', '과제등급', '업무량', '목표', '성과', '성과등급', '점수'],
    rows: tasks.map((task, i) => [
      task.name,
      task.importance,
      task.workload,
      task.objective || '-',
      task.achievement || '-',
      task.performanceGrade,
      scores[i].toFixed(1),
    ]),
    emptyLabel: '등록된 과제가 없습니다.',
  }

  await downloadPdfReport({
    teamName,
    periodName,
    title: '과제 현황 리포트',
    stats: [
      { label: '등록 과제 수', value: `${tasks.length}건` },
      { label: '핵심 과제 수', value: `${coreCount}건`, emphasize: coreCount > 0 },
      { label: '평균 과제 점수', value: avg.toFixed(1) },
    ],
    sections: [section],
    fileName: `과제현황_${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

export async function downloadMembersPdf(
  teamName: string,
  periodName: string,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  peerReviews: PeerReview[],
) {
  const activeCount = members.filter((m) => m.active).length
  const serviceYears = members.map((m) => calcYearsSince(m.hireDate)).filter((y): y is number => y !== null)
  const avgService = serviceYears.length > 0 ? serviceYears.reduce((a, b) => a + b, 0) / serviceYears.length : null

  const section: ReportSection = {
    title: '팀원 목록',
    countLabel: `${members.length}명`,
    columns: ['이름', '근속', '직급', '연차', '역할', '참여 과제', '피어리뷰', '활성여부'],
    rows: members.map((member) => {
      const service = calcYearsSince(member.hireDate)
      const levelTenure = calcYearsSince(member.currentLevelSince)
      const count = tasks.filter((t) => (contributions.find((c) => c.taskId === t.id && c.memberId === member.id)?.contributionPercent ?? 0) > 0).length
      const peerReviewCount = peerReviews.filter((r) => r.targetMemberId === member.id).length
      return [
        member.name,
        service !== null ? `${service}년` : '-',
        member.level || '-',
        levelTenure !== null ? `${levelTenure}년차` : '-',
        member.role || '-',
        `${count}건`,
        `${peerReviewCount}건`,
        { text: member.active ? '활성' : '비활성', emphasize: !member.active },
      ]
    }),
    emptyLabel: '등록된 팀원이 없습니다.',
  }

  await downloadPdfReport({
    teamName,
    periodName,
    title: '팀원 현황 리포트',
    stats: [
      { label: '전체 팀원', value: `${members.length}명` },
      { label: '활성 팀원', value: `${activeCount}명`, emphasize: true },
      { label: '평균 근속', value: avgService !== null ? `${avgService.toFixed(1)}년` : '-' },
    ],
    sections: [section],
    fileName: `팀원현황_${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

export async function downloadPeerReviewsPdf(teamName: string, periodName: string, peerReviews: PeerReview[], members: TeamMember[]) {
  const sorted = [...peerReviews].sort((a, b) => {
    const targetA = members.find((m) => m.id === a.targetMemberId)?.name ?? ''
    const targetB = members.find((m) => m.id === b.targetMemberId)?.name ?? ''
    return targetA.localeCompare(targetB) || a.reviewerName.localeCompare(b.reviewerName)
  })

  const section: ReportSection = {
    title: '피어리뷰 목록',
    countLabel: `${peerReviews.length}건`,
    columns: ['대상팀원', '리뷰어', '등급'],
    rows: sorted
      .map((review): (string | number)[] | null => {
        const target = members.find((m) => m.id === review.targetMemberId)
        if (!target) return null
        return [target.name, review.reviewerName, review.grade]
      })
      .filter((row): row is (string | number)[] => row !== null),
    emptyLabel: '등록된 피어리뷰가 없습니다.',
  }

  await downloadPdfReport({
    teamName,
    periodName,
    title: '피어리뷰 현황 리포트',
    stats: [{ label: '전체 피어리뷰', value: `${peerReviews.length}건` }],
    sections: [section],
    fileName: `피어리뷰현황_${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

export async function downloadMatrixPdf(
  teamName: string,
  periodName: string,
  tasks: Task[],
  members: TeamMember[],
  contributions: Contribution[],
  criteria: Criteria,
) {
  const activeMembers = members.filter((m) => m.active)
  const rows: (string | number)[][] = []
  for (const task of tasks) {
    const taskScore = calcTaskScore(task, criteria)
    for (const member of activeMembers) {
      const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === member.id)
      if (!contribution || contribution.contributionPercent <= 0) continue
      const personalFactor = criteria.personalGradeWeight > 0 ? (contribution.personalPerformanceGrade ?? '미입력') : '미사용'
      rows.push([
        task.name,
        member.name,
        contribution.contributionPercent,
        personalFactor,
        taskScore.toFixed(1),
        (taskScore * (contribution.contributionPercent / 100)).toFixed(1),
      ])
    }
  }

  await downloadPdfReport({
    teamName,
    periodName,
    title: '평가 매트릭스 리포트',
    stats: [
      { label: '과제 수', value: `${tasks.length}건` },
      { label: '참여 조합 수', value: `${rows.length}건`, emphasize: true },
    ],
    sections: [
      {
        title: '과제 × 팀원 기여도',
        countLabel: `${rows.length}건`,
        columns: ['과제명', '팀원', '기여도(%)', '개인수행등급', '과제 점수', '가중 점수'],
        rows,
        emptyLabel: '입력된 기여도가 없습니다.',
      },
    ],
    fileName: `평가매트릭스_${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

export async function downloadResultsPdf(
  teamName: string,
  periodName: string,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  peerReviews: PeerReview[] = [],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const avgScore = results.length > 0 ? results.reduce((s, r) => s + r.cumulativeScore, 0) / results.length : 0
  const topGrade = results[0]?.grade ?? '-'

  const rankSection: ReportSection = {
    title: '순위표',
    countLabel: `${results.length}명`,
    columns: ['순위', '이름', '역할', '직급', '참여 과제', '누적 점수', '등급'],
    rows: results.map((row, i) => [
      { text: `${i + 1}`, emphasize: i === 0 },
      row.member.name,
      row.member.role || '-',
      row.member.level || '-',
      `${row.participatedTaskCount}건`,
      row.cumulativeScore.toFixed(1),
      row.grade,
    ]),
    emptyLabel: '평가 결과가 없습니다.',
  }

  const detailRows: (string | number)[][] = []
  for (const task of tasks) {
    const taskScore = taskScoreMap.get(task.id) ?? 0
    const taskContributions = contributions.filter((c) => c.taskId === task.id && c.contributionPercent > 0)
    for (const c of taskContributions) {
      const member = members.find((m) => m.id === c.memberId)
      if (!member) continue
      const personalFactor = criteria.personalGradeWeight > 0 ? (c.personalPerformanceGrade ?? '미입력') : '미사용'
      detailRows.push([member.name, task.name, c.contributionPercent, personalFactor, taskScore.toFixed(1), (taskScore * (c.contributionPercent / 100)).toFixed(1)])
    }
  }
  const detailSection: ReportSection = {
    title: '과제별 상세',
    countLabel: `${detailRows.length}건`,
    columns: ['이름', '과제명', '기여도(%)', '개인수행등급', '과제 점수', '가중 점수'],
    rows: detailRows,
    emptyLabel: '과제 참여 데이터가 없습니다.',
  }

  await downloadPdfReport({
    teamName,
    periodName,
    title: '성과평가 결과 리포트',
    stats: [
      { label: '참여 팀원', value: `${results.length}명` },
      { label: '평균 누적 점수', value: avgScore.toFixed(1) },
      { label: '최고 등급', value: topGrade, emphasize: true },
    ],
    sections: [rankSection, detailSection],
    fileName: `평가결과_${new Date().toISOString().slice(0, 10)}.pdf`,
  })
}

// 팀원 개개인에게 따로 전달할 개인별 리포트 -- 전체 순위/다른 사람 점수는 빼고
// 본인 참여 과제와 면담 기록만 담는다. excel.ts의 downloadIndividualResultReports와
// 짝을 이루며, 팀원별 PDF를 하나씩 만들어 zip 하나로 묶어 내려받는다(파일별로
// 따로따로 다운로드 창이 뜨는 걸 피하기 위함).
function buildMemberResultPdfOptions(
  teamName: string,
  periodName: string,
  member: TeamMember,
  row: ReturnType<typeof calcMemberResults>[number],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  taskScoreMap: Map<string, number>,
): Parameters<typeof buildPdfBlob>[0] {
  const dateStr = new Date().toISOString().slice(0, 10)

  const taskRows: (string | number)[][] = []
  for (const task of tasks) {
    const contribution = contributions.find((c) => c.taskId === task.id && c.memberId === member.id)
    if (!contribution || contribution.contributionPercent <= 0) continue
    const taskScore = taskScoreMap.get(task.id) ?? 0
    const weighted = taskScore * (contribution.contributionPercent / 100)
    taskRows.push([
      task.name,
      contribution.contributionPercent,
      criteria.personalGradeWeight > 0 ? (contribution.personalPerformanceGrade ?? '미입력') : '미사용',
      taskScore.toFixed(1),
      weighted.toFixed(1),
    ])
  }
  const taskSection: ReportSection = {
    title: '참여 과제',
    countLabel: `${taskRows.length}건`,
    columns: ['과제명', '기여도(%)', '개인수행등급', '과제 점수', '가중 점수'],
    rows: taskRows,
    emptyLabel: '참여한 과제가 없습니다.',
  }

  const memberNotes = meetingNotes.filter((n) => n.memberId === member.id).sort((a, b) => a.date.localeCompare(b.date))
  const notesSection: ReportSection = {
    title: '면담 기록',
    countLabel: `${memberNotes.length}건`,
    columns: ['날짜', '면담 코멘트'],
    rows: memberNotes.map((n) => [n.date, n.comment]),
    emptyLabel: '면담 기록이 없습니다.',
  }

  return {
    teamName,
    periodName,
    title: `${member.name} 개인 평가결과`,
    stats: [
      { label: '참여 과제 수', value: `${row.participatedTaskCount}건` },
      { label: '누적 점수', value: row.cumulativeScore.toFixed(1) },
      { label: '평가등급', value: row.grade, emphasize: true },
    ],
    sections: [taskSection, notesSection],
    fileName: `${member.name}_평가결과_${dateStr}.pdf`,
  }
}

export async function downloadIndividualResultsPdf(
  teamName: string,
  periodName: string,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[] = [],
  peerReviews: PeerReview[] = [],
  selectedMemberIds?: string[],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((row) => [row.task.id, row.score]))
  const dateStr = new Date().toISOString().slice(0, 10)
  const zip = new JSZip()

  const selected = selectedMemberIds ? new Set(selectedMemberIds) : null
  const targetRows = selected ? results.filter((row) => selected.has(row.member.id)) : results

  for (const row of targetRows) {
    const options = buildMemberResultPdfOptions(
      teamName,
      periodName,
      row.member,
      row,
      tasks,
      contributions,
      criteria,
      meetingNotes,
      taskScoreMap,
    )
    const blob = await buildPdfBlob(options)
    zip.file(options.fileName, blob)
  }

  const zipBlob = await zip.generateAsync({ type: 'blob' })
  await saveBlobLocally(zipBlob, `팀원별_평가결과_${dateStr}.zip`)
}

// 결과 테이블의 한 행에서 그 팀원 한 명의 PDF만 내려받거나(다운로드) 새 탭에서
// 바로 열어 확인(미리보기)할 때 쓴다. 다른 팀원의 이름/점수/등급은 이 PDF에
// 전혀 포함되지 않는다 -- buildMemberResultPdfOptions가 그 팀원 데이터만 채운다.
async function buildSingleMemberPdf(
  teamName: string,
  periodName: string,
  member: TeamMember,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  peerReviews: PeerReview[],
) {
  const results = calcMemberResults(members, tasks, contributions, criteria, peerReviews)
  const row = results.find((r) => r.member.id === member.id)
  if (!row) return null
  const taskScores = calcAllTaskScores(tasks, criteria)
  const taskScoreMap = new Map(taskScores.map((r) => [r.task.id, r.score]))
  const options = buildMemberResultPdfOptions(
    teamName,
    periodName,
    member,
    row,
    tasks,
    contributions,
    criteria,
    meetingNotes,
    taskScoreMap,
  )
  return options
}

export async function downloadMemberResultPdf(
  teamName: string,
  periodName: string,
  member: TeamMember,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  peerReviews: PeerReview[],
) {
  const options = await buildSingleMemberPdf(teamName, periodName, member, members, tasks, contributions, criteria, meetingNotes, peerReviews)
  if (!options) return
  await downloadPdfReport(options)
}

export async function previewMemberResultPdf(
  teamName: string,
  periodName: string,
  member: TeamMember,
  members: TeamMember[],
  tasks: Task[],
  contributions: Contribution[],
  criteria: Criteria,
  meetingNotes: MeetingNote[],
  peerReviews: PeerReview[],
) {
  const options = await buildSingleMemberPdf(teamName, periodName, member, members, tasks, contributions, criteria, meetingNotes, peerReviews)
  if (!options) return
  const blob = await buildPdfBlob(options)
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
