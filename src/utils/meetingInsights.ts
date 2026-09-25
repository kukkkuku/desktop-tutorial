// 면담 인사이트 -- 팀원마다 실제 데이터(개인 메모·참여 과제·개인등급·L3 진행 상황·
// 고과 추이·승진 점수·동료 평가·지난 면담)에서 나온 것만 문장으로 만든다.
// 해당하는 상황이 없으면 그 인사이트는 만들지 않는다(뻔한 일반 문장으로 채우지 않음).
// 각 인사이트는 제목(무엇이 보였나) + 추천 질문(면담에서 물어볼 말) + 근거(어디서 나왔나).
import type { EvaluationGrade, MeetingNote, PersonalNote, PerformanceGrade, Task, WorkItem } from '../types'

export interface MeetingInsight {
  id: string
  title: string
  question: string
  basis: string
}

export interface InsightInput {
  personalNotes: PersonalNote[]
  // 이번 기간 참여한 평가과제(개인 점수 높은 순)
  tasks: { task: Task; contributionPercent: number; personalGrade: PerformanceGrade | null; personalScore: number }[]
  workItems: WorkItem[] // 이 팀원이 담당자인 L3
  halfYearGrades: { period: string; grade: EvaluationGrade }[]
  promotion: { reviewYear: number; gap: number } | null
  peer: { count: number; firstPlace: number; average: number | null; reasons: string[] }
  lastMeeting: MeetingNote | null
  today: string // YYYY-MM-DD
}

const GRADE_RANK: Record<string, number> = { S: 5, A: 4, B: 3, C: 2, D: 1 }
const cut = (s: string, n = 40) => {
  const one = s.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, n)}…` : one
}

export function buildMeetingInsights(inp: InsightInput): MeetingInsight[] {
  const out: MeetingInsight[] = []
  const add = (id: string, title: string, question: string, basis: string) => out.push({ id, title, question, basis })

  for (const n of inp.personalNotes)
    add(`note-${n.id}`, `개인 메모: ${cut(n.content)}`, '요즘 업무와 병행하면서 팀에서 도와줄 부분이 있을까요?', '팀장이 남긴 개인 메모')

  const top = inp.tasks[0]
  if (top)
    add(
      `top-${top.task.id}`,
      `${cut(top.task.name, 34)}에서 가장 큰 기여(${top.contributionPercent}%)를 보였습니다`,
      '이 성과를 만들 때 본인이 가장 잘했다고 생각하는 부분은 무엇인가요?',
      `이번 기간 개인 점수 1위 과제 · 개인 점수 ${top.personalScore.toFixed(1)}`,
    )
  for (const t of inp.tasks) {
    if (t === top || !t.personalGrade) continue
    if (t.personalGrade === 'S')
      add(
        `s-${t.task.id}`,
        `${cut(t.task.name, 34)} 개인등급 S`,
        '이 과제에서 얻은 노하우를 팀에 공유한다면 무엇을 알려 주고 싶나요?',
        '평가하기에서 매긴 개인등급',
      )
    if (t.personalGrade === 'C' || t.personalGrade === 'D')
      add(
        `low-${t.task.id}`,
        `${cut(t.task.name, 34)} 개인등급 ${t.personalGrade}`,
        '진행하면서 가장 막혔던 지점과 그때 필요했던 지원은 무엇이었나요?',
        '평가하기에서 매긴 개인등급',
      )
  }
  if (inp.tasks.length === 0)
    add('no-task', '이번 기간 참여한 평가과제가 없습니다', '지금 주로 시간을 쓰고 있는 업무는 무엇인가요?', '평가과제 기여도 입력 없음')

  const status = (w: WorkItem) => w.fields.status ?? ''
  const running = inp.workItems.filter((w) => status(w) === '진행중')
  const overdue = running.filter((w) => {
    const due = w.fields.dueDate || ''
    return /^\d{4}-\d{2}-\d{2}$/.test(due) && due < inp.today
  })
  if (overdue.length > 0)
    add(
      'overdue',
      `완료요청일이 지난 진행중 L3 ${overdue.length}건 (${cut(overdue[0].name, 20)}${overdue.length > 1 ? ' 등' : ''})`,
      '일정이 밀린 원인은 무엇이고, 우선순위나 지원을 조정할 부분이 있을까요?',
      '과제리스트 상태·완료요청일',
    )
  if (running.length >= 5)
    add('load', `진행중인 L3가 ${running.length}건입니다`, '지금 업무량은 적정한가요? 우선순위를 낮추거나 넘길 일이 있을까요?', '과제리스트 담당자·상태')
  const stopped = inp.workItems.filter((w) => status(w) === '중단')
  if (stopped.length > 0)
    add(
      'stopped',
      `중단된 L3 ${stopped.length}건 (${cut(stopped[0].name, 20)}${stopped.length > 1 ? ' 등' : ''})`,
      '중단된 일에서 배운 점이나 다시 해 보고 싶은 부분이 있나요?',
      '과제리스트 상태',
    )

  const g = inp.halfYearGrades
  if (g.length >= 2) {
    const [a, b] = [g[g.length - 2], g[g.length - 1]]
    const d = GRADE_RANK[b.grade] - GRADE_RANK[a.grade]
    if (d > 0)
      add('trend-up', `성과 고과 상승 (${a.grade} → ${b.grade})`, '최근 성과가 좋아진 계기는 무엇이라고 생각하나요?', `${a.period} → ${b.period} 성과 고과`)
    if (d < 0)
      add('trend-down', `성과 고과 하락 (${a.grade} → ${b.grade})`, '최근 업무에서 달라진 환경이나 어려움이 있었나요?', `${a.period} → ${b.period} 성과 고과`)
  }

  if (inp.promotion) {
    const { reviewYear, gap } = inp.promotion
    if (gap >= 0)
      add(
        'promo',
        `${reviewYear}년 승진 심사 기준 충족 예상 (+${gap.toFixed(1)}점)`,
        '다음 직급에서 어떤 역할을 맡아 보고 싶나요?',
        '성장 시뮬레이션 최종 기대 점수',
      )
    else
      add(
        'promo',
        `${reviewYear}년 승진 심사까지 ${Math.abs(gap).toFixed(1)}점 필요`,
        '남은 기간 점수를 올리려면 어떤 과제에 집중하면 좋을까요?',
        '성장 시뮬레이션 최종 기대 점수',
      )
  }

  const p = inp.peer
  if (p.firstPlace > 0)
    add(
      'peer-top',
      `동료 평가에서 1위 ${p.firstPlace}회`,
      '동료들이 높게 평가한 협업 방식은 무엇이라고 생각하나요?',
      `피어리뷰 ${p.count}건${p.reasons[0] ? ` · "${cut(p.reasons[0], 30)}"` : ''}`,
    )
  else if (p.average !== null && p.average < 75)
    add(
      'peer-low',
      `동료 평가 평균 ${p.average.toFixed(0)}점`,
      '협업하면서 어려웠던 점이나 오해가 있었던 부분이 있나요?',
      `피어리뷰 ${p.count}건 (점수 환산 S100~D60)`,
    )

  const last = inp.lastMeeting
  if (last) {
    add('last', `지난 면담: ${cut(last.comment, 30)}`, '지난 면담 이후 업무에서 가장 크게 달라진 점은 무엇인가요?', `${last.date} 면담 기록`)
    if (last.improvements?.trim())
      add('last-imp', `지난 보완점: ${cut(last.improvements, 30)}`, '보완하기로 한 부분은 어떻게 되어 가고 있나요?', `${last.date} 육성 포인트`)
    if (last.nextExperience?.trim())
      add(
        'last-next',
        `해 보고 싶은 경험: ${cut(last.nextExperience, 30)}`,
        '그 경험을 해 볼 기회가 있었나요? 팀에서 만들어 줄 수 있는 기회가 있을까요?',
        `${last.date} 육성 포인트`,
      )
    if (last.careerInterest?.trim())
      add('last-career', `Career Goal: ${cut(last.careerInterest, 30)}`, '그 목표에 가까워지려고 이번 기간 무엇을 해 봤나요?', `${last.date} 육성 포인트`)
  }

  return out
}
