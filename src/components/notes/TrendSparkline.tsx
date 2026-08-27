import type { EvaluationGrade } from '../../types'
import { GRADE_ORDER } from '../../utils/promotion'

interface TrendSparklineProps {
  points: { period: string; grade: EvaluationGrade }[]
  // 100~140px 폭 확보 -- 너무 작으면 상승/유지/하락 흐름이 한눈에 안 들어온다.
  width?: number
  // 보여줄 최근 포인트 개수 -- 반기별 추이는 연간 추이보다 포인트가 2배
  // 많아서 기본값(5)보다 넉넉하게 잡아야 "최근 N년"이 실제로 다 보인다.
  maxPoints?: number
  className?: string
}

const DEFAULT_WIDTH = 120
const HEIGHT = 30
const PAD_X = 6
const PAD_Y = 5
const DEFAULT_MAX_POINTS = 5

function yFor(grade: EvaluationGrade, height: number): number {
  const idx = GRADE_ORDER.indexOf(grade) // 0(D) .. 4(S)
  const ratio = idx / (GRADE_ORDER.length - 1) // 0(D, bottom) .. 1(S, top)
  return height - PAD_Y - ratio * (height - PAD_Y * 2)
}

// 대시보드와 팀원 상세에서 함께 쓰는 초소형 고과 추이 그래프. 점수 없이
// S/A/B/C/D 등급만 점+선으로 표시하고, 마지막(현재) 점만 강조한다. hover
// 시 네이티브 <title> 툴팁으로 기간과 등급만 보여준다.
export default function TrendSparkline({ points: allPoints, width = DEFAULT_WIDTH, maxPoints = DEFAULT_MAX_POINTS, className }: TrendSparklineProps) {
  const points = allPoints.slice(-maxPoints)

  if (points.length === 0) {
    return <span className={`text-xs text-gray-300 ${className ?? ''}`}>-</span>
  }

  if (points.length === 1) {
    const p = points[0]
    return (
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className={className} role="img" aria-label={`${p.period}: ${p.grade}`}>
        <circle cx={width / 2} cy={yFor(p.grade, HEIGHT)} r={3.5} className="fill-accent">
          <title>{`${p.period}: ${p.grade}`}</title>
        </circle>
      </svg>
    )
  }

  const stepX = (width - PAD_X * 2) / (points.length - 1)
  const coords = points.map((p, i) => ({ x: PAD_X + i * stepX, y: yFor(p.grade, HEIGHT), point: p }))
  const path = coords.map((c) => `${c.x},${c.y}`).join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${HEIGHT}`} width={width} height={HEIGHT} className={className} role="img" aria-label="고과 추이">
      <polyline points={path} fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => {
        const isLast = i === coords.length - 1
        return (
          <circle key={i} cx={c.x} cy={c.y} r={isLast ? 3.5 : 2} className={isLast ? 'fill-accent' : 'fill-gray-300'}>
            <title>{`${c.point.period}: ${c.point.grade}`}</title>
          </circle>
        )
      })}
    </svg>
  )
}
