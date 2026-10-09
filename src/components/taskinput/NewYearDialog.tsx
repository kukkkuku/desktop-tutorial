// 과제 입력 › 새 연도 만들기: 구글시트 없이 이 화면에서 한 해의 추진현황 표를 시작한다.
//   빈 표로 시작하거나, 지금 보는 연도의 그룹 · 구분 · 열 구성을 이어받는다(과제는 고른 만큼 이월).
//   저장 위치: 이 브라우저, 또는(관리자 · 시트 연결됨) 연결된 구글시트 파일에 「YYYY 추진현황」 탭을 바로 만든다.
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
  target: 'sheet' | 'file' | 'local'
}

export default function NewYearDialog({
  defaultYear,
  taken,
  inheritFrom,
  onCreate,
  onClose,
  sheetName,
  canCreateFile,
}: {
  defaultYear: number
  taken: string[] // 이미 있는 탭 이름(「YYYY 추진현황」)
  inheritFrom: string | null // 이어받을 수 있는 연도(지금 보는 표) 이름
  onCreate: (o: NewYearOptions) => void
  onClose: () => void
  sheetName?: string // 있으면(관리자 · 시트 연결됨) 저장 위치로 연결된 시트의 탭을 고를 수 있다
  canCreateFile?: boolean // 관리자: 새 구글시트 파일을 만들 수 있다
}) {
  const [year, setYear] = useState(defaultYear)
  const [mode, setMode] = useState<'blank' | 'inherit'>(inheritFrom ? 'inherit' : 'blank')
  const [carry, setCarry] = useState<Carry>('open')
  const [l1, setL1] = useState('')
  const [target, setTarget] = useState<'sheet' | 'file' | 'local'>(sheetName ? 'sheet' : canCreateFile ? 'file' : 'local')
  // 시트는 이름(L3)이 있는 줄만 과제로 읽으니, 과제 없이 시작(빈 표 · 구분만)은 이 브라우저에 먼저 만든다
  const sheetBlocked = mode === 'blank' || carry === 'structure'
  const canSheet = !!sheetName || !!canCreateFile
  const to: 'sheet' | 'file' | 'local' = canSheet && !sheetBlocked && !(target === 'sheet' && !sheetName) && !(target === 'file' && !canCreateFile) ? target : 'local'
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
          onCreate({ year, mode, carry, l1: l1.trim() || '새 그룹', target: to })
        }}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-[length:calc(17px*var(--ui-fs,1))] font-bold text-label">
              <FilePlus2 size={19} strokeWidth={1.9} className="text-accent" />새 연도 만들기
            </h2>
            <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] leading-relaxed text-label-2">
              한 해의 추진현황 표를 시작합니다.{' '}
              {canSheet
                ? '연결된 구글시트에 탭으로 만들거나, 새 구글시트를 만들거나, 이 브라우저에 먼저 만들 수 있습니다.'
                : '이 브라우저에 저장되고, 관리자가 나중에 구글시트에 탭으로 만들 수 있습니다.'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="-mr-2 -mt-1 rounded-full p-1.5 text-label-3 hover:bg-black/[0.06]" aria-label="닫기">
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className="w-14 shrink-0 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">연도</span>
          <YearPicker year={year} onChange={setYear} />
          <span className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">→ {year} 실적관리</span>
        </div>
        {clash && <p className="ml-[68px] mt-1 text-[length:calc(13px*var(--ui-fs,1))] text-danger">「{title}」은(는) 이미 있습니다. 다른 연도를 고르세요.</p>}

        <p className="mb-2 mt-5 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">시작 방법</p>
        <div className="space-y-2">
          {inheritFrom && (
            <button type="button" onClick={() => setMode('inherit')} className={opt(mode === 'inherit')}>
              <span className={radio(mode === 'inherit')} />
              <span className="min-w-0 flex-1">
                <span className="block text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">{inheritFrom.replace(/추진현황/, '실적관리')}에서 이어받기</span>
                <span className="block text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">
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
                        className={`rounded-full px-2.5 py-1 text-[length:calc(13px*var(--ui-fs,1))] font-medium ${carry === k ? 'bg-accent text-white' : 'bg-black/[0.05] text-label-2 hover:bg-black/[0.08]'}`}
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
              <span className="block text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">빈 표로 시작</span>
              <span className="block text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">기본 열: {DEFAULT_FIELD_LABELS.join(' · ')} (나중에 "+ 열"로 바꿀 수 있음)</span>
              {mode === 'blank' && (
                <input
                  value={l1}
                  onChange={(e) => setL1(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="첫 그룹(L1) 이름 · 예: 브랜드 디자인"
                  className="mt-2 h-8 w-full rounded-control border border-hairline bg-white px-2 text-[length:calc(14px*var(--ui-fs,1))]"
                />
              )}
            </span>
          </button>
        </div>

        {canSheet && (
          <>
            <p className="mb-2 mt-5 text-[length:calc(14px*var(--ui-fs,1))] font-semibold text-label">저장 위치</p>
            <div className="space-y-2">
              {sheetName && (
                <button type="button" disabled={sheetBlocked} onClick={() => setTarget('sheet')} className={`${opt(to === 'sheet')} disabled:opacity-50`}>
                  <span className={radio(to === 'sheet')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">연결된 시트에 탭 추가</span>
                    <span className="block text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2" title={sheetName}>
                      「{sheetName}」에 「{title}」 탭을 만듭니다
                    </span>
                  </span>
                </button>
              )}
              {canCreateFile && (
                <button type="button" disabled={sheetBlocked} onClick={() => setTarget('file')} className={`${opt(to === 'file')} disabled:opacity-50`}>
                  <span className={radio(to === 'file')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">새 시트 만들기</span>
                    <span className="block text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">
                      「{year} 실적관리」 구글시트 파일을 새로 만들고 연결합니다. 팀원 공유와 권한 시트의 시트 주소 변경은 직접 해야 합니다.
                    </span>
                  </span>
                </button>
              )}
              <button type="button" onClick={() => setTarget('local')} className={opt(to === 'local')}>
                <span className={radio(to === 'local')} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[length:calc(14.5px*var(--ui-fs,1))] font-semibold text-label">이 브라우저에 저장</span>
                  <span className="block text-[length:calc(13px*var(--ui-fs,1))] leading-snug text-label-2">나중에 구글시트로 만들기</span>
                </span>
              </button>
            </div>
            {sheetBlocked && (
              <p className="mt-1.5 text-[length:calc(13px*var(--ui-fs,1))] text-label-3">과제 없이 시작하면 이 브라우저에 먼저 만듭니다. 과제 이름을 넣은 뒤 「시트 › 탭 ⌄」 메뉴의 구글시트로 만들기.</p>
            )}
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            취소
          </Button>
          <Button type="submit" variant="primary" disabled={clash}>
            {to === 'sheet' ? '시트에 탭 만들기' : to === 'file' ? '새 시트 만들기' : '만들기'}
          </Button>
        </div>
      </form>
    </div>
  )
}
