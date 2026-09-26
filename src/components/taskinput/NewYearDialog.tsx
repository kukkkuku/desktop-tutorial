// 과제 입력 › 새 연도 만들기: 구글시트 없이 이 화면에서 한 해의 추진현황 표를 시작한다.
//   빈 표로 시작하거나, 지금 보는 연도의 그룹 · 구분 · 열 구성을 이어받는다(과제는 고른 만큼 이월).
//   만든 표는 이 브라우저에 저장되고, 관리자가 나중에 "구글시트로 만들기"로 연결된 파일에 탭을 만든다.
import { useState } from 'react'
import { FilePlus2, X } from 'lucide-react'
import Button from '../Button'
import YearPicker from '../YearPicker'
import { DEFAULT_FIELD_LABELS } from '../../utils/progressLocal'

export type Carry = 'open' | 'all' | 'structure'
export interface NewYearOptions {
  year: number
  mode: 'blank' | 'inherit'
  carry: Carry
  l1: string
}

export default function NewYearDialog({
  defaultYear,
  taken,
  inheritFrom,
  onCreate,
  onClose,
}: {
  defaultYear: number
  taken: string[] // 이미 있는 탭 이름(「YYYY 추진현황」)
  inheritFrom: string | null // 이어받을 수 있는 연도(지금 보는 표) 이름
  onCreate: (o: NewYearOptions) => void
  onClose: () => void
}) {
  const [year, setYear] = useState(defaultYear)
  const [mode, setMode] = useState<'blank' | 'inherit'>(inheritFrom ? 'inherit' : 'blank')
  const [carry, setCarry] = useState<Carry>('open')
  const [l1, setL1] = useState('')
  const title = `${year} 추진현황`
  const clash = taken.some((t) => t.replace(/\s/g, '') === title.replace(/\s/g, ''))
  const opt = (on: boolean) =>
    `flex w-full items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-left ${on ? 'border-accent bg-accent-soft/60 ring-1 ring-accent' : 'border-hairline hover:bg-black/[0.03]'}`
  const radio = (on: boolean) => `mt-[3px] h-3.5 w-3.5 shrink-0 rounded-full border ${on ? 'border-[4px] border-accent' : 'border-[#C7C7CC]'}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={onClose}>
      <form
        className="w-[min(520px,calc(100vw-2rem))] rounded-[14px] bg-white p-6 shadow-dialog"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          if (clash) return
          onCreate({ year, mode, carry, l1: l1.trim() || '새 그룹' })
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[17px] font-bold text-label">
              <FilePlus2 size={19} strokeWidth={1.9} className="text-accent" />새 연도 만들기
            </h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-label-2">
              구글시트 없이 여기서 표를 시작합니다. 이 브라우저에 저장되고, 관리자가 나중에 연결된 구글시트에 「{title}」 탭으로 만들 수 있습니다.
            </p>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 -mt-1 rounded-full p-1.5 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className="w-14 shrink-0 text-[13px] font-semibold text-label">연도</span>
          <YearPicker year={year} onChange={setYear} />
          <span className="text-[13px] text-label-2">→ {year} 실적관리</span>
        </div>
        {clash && <p className="ml-[68px] mt-1 text-[12px] text-danger">「{title}」은(는) 이미 있습니다. 다른 연도를 고르세요.</p>}

        <p className="mb-2 mt-5 text-[13px] font-semibold text-label">시작 방법</p>
        <div className="space-y-2">
          {inheritFrom && (
            <button type="button" onClick={() => setMode('inherit')} className={opt(mode === 'inherit')}>
              <span className={radio(mode === 'inherit')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-label">{inheritFrom.replace(/추진현황/, '실적관리')}에서 이어받기</span>
                <span className="block text-[12px] leading-snug text-label-2">
                  그룹(L1) · 구분(L2) · 열 구성을 그대로 가져옵니다. 주 칸(계획 · 실적)은 비웁니다.
                </span>
                {mode === 'inherit' && (
                  <span className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {(
                      [
                        ['open', '완료 안 된 과제만 이월'],
                        ['all', '과제 모두'],
                        ['structure', '구분만(과제 없이)'],
                      ] as const
                    ).map(([k, label]) => (
                      <span
                        key={k}
                        role="button"
                        onClick={() => setCarry(k)}
                        className={`rounded-full px-2.5 py-1 text-[12px] font-medium ${carry === k ? 'bg-accent text-white' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'}`}
                      >
                        {label}
                      </span>
                    ))}
                  </span>
                )}
              </span>
            </button>
          )}
          <button type="button" onClick={() => setMode('blank')} className={opt(mode === 'blank')}>
            <span className={radio(mode === 'blank')} />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-label">빈 표로 시작</span>
              <span className="block text-[12px] leading-snug text-label-2">기본 열: {DEFAULT_FIELD_LABELS.join(' · ')} (나중에 "+ 열"로 바꿀 수 있음)</span>
              {mode === 'blank' && (
                <input
                  value={l1}
                  onChange={(e) => setL1(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="첫 그룹(L1) 이름 · 예: 브랜드 디자인"
                  className="mt-2 h-8 w-full rounded-control border border-hairline bg-white px-2 text-[13px]"
                />
              )}
            </span>
          </button>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={clash}>
            만들기
          </Button>
        </div>
      </form>
    </div>
  )
}
