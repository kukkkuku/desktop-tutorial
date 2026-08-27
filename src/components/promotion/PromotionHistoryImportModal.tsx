import { useEffect, useState } from 'react'
import type { TeamMember } from '../../types'
import { useAppState } from '../../state/AppContext'
import { matchToMembers, parsePromotionHistoryWorkbook, type PromotionImportMatch } from '../../utils/promotionImport'
import {
  resolveMatchedMember,
  useApplyPromotionHistory,
  type PromotionManualPicks,
} from '../../hooks/useApplyPromotionHistory'
import Spinner from '../Spinner'
import IconButton from '../IconButton'

// 적용 완료 후 이 시간(ms) 뒤 자동으로 onApplied를 부른다. 초록 버튼을 한 번
// 더 눌러야 다음으로 넘어가는 구조였는데, 스크롤에 가려 그 버튼을 못 보고
// "그대로 멈춰있다"고 느끼는 경우가 있었다. 결과를 잠깐 보여줄 시간만 주고
// 자동으로 진행시키되, 사용자가 먼저 누르면(아래 버튼 onClick) 즉시 진행된다.
const AUTO_ADVANCE_DELAY_MS = 900

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}

interface AppliedSummary {
  memberCount: number
  yearCount: number
  skipped: number
}

interface PromotionHistoryImportPanelProps {
  initialFile?: File
  // 적용 완료 버튼(초록색으로 바뀐 뒤)을 눌렀을 때 -- 호출부가 "다음으로
  // 진행"까지 겸하고 싶으면(예: 빠른 시작에서 과제관리로 이동) 여기서 처리한다.
  onApplied: () => void
  // 우측 상단 닫기(X) -- 적용 여부와 무관하게 이 화면 자체를 치우고 싶을 때.
  onDismiss: () => void
}

// 승진 시뮬레이션 Excel(시트당 팀원 1명, 연도별 업적·역량 등급)이나 이전
// 성과 단순 표(한 시트에 팀원별 여러 행)를 읽어 이름이 일치하는 기존
// 팀원에게 인사평가 이력을 바로 적용한다. 새 팀원을 만들지 않고, 적용 전
// 매칭 결과를 미리 보여준다.
//
// 모달 전용이 아니라 순수 콘텐츠만 담은 패널이다 -- 빠른 시작의 "Excel로
// 시작" 탭(BulkUploadPanel)은 이걸 팝업 위에 또 팝업을 띄우는 대신 같은
// 화면 안에 그대로 이어 붙여서 쓴다(위쪽 드롭존이 그대로 보여야 파일을
// 더 추가하기도 쉽다). 독립된 진입점(팀원 면담의 "지난 성과 엑셀파일
// 불러오기")에서는 아래 PromotionHistoryImportModal로 감싸 모달로 띄운다.
//
// initialFile -- 다른 업로드 경로(예: 전체 일괄 업로드에 이전 성과 파일이
// 섞여 있던 경우)에서 이미 고른 파일을 넘겨주면 드래그·선택 단계를
// 건너뛰고 바로 매칭 미리보기로 시작한다.
export function PromotionHistoryImportPanel({ initialFile, onApplied, onDismiss }: PromotionHistoryImportPanelProps) {
  const { state } = useAppState()
  const applyPromotionHistory = useApplyPromotionHistory()
  const [matches, setMatches] = useState<PromotionImportMatch[] | null>(null)
  const [fileName, setFileName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applyHireDate, setApplyHireDate] = useState(true)
  const [applied, setApplied] = useState<AppliedSummary | null>(null)
  const [dragActive, setDragActive] = useState(false)
  // 동명이인이라 자동 연결이 안 된 행에서 사용자가 고른 팀원 id -- matches
  // 배열의 인덱스로 키를 잡는다(같은 이름이 여러 블록일 수 있어 이름만으로는
  // 구분이 안 된다).
  const [manualPicks, setManualPicks] = useState<PromotionManualPicks>({})

  useEffect(() => {
    if (initialFile) void handleFile(initialFile)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File) {
    setLoading(true)
    setError('')
    setApplied(null)
    try {
      const buffer = await file.arrayBuffer()
      const sheets = parsePromotionHistoryWorkbook(buffer)
      if (sheets.length === 0) {
        setError('이 파일에서 팀원별 인사평가 데이터를 찾지 못했습니다. 승진 시뮬레이션 Excel 형식인지 확인하세요.')
        setMatches(null)
      } else {
        setMatches(matchToMembers(sheets, state.members))
        setFileName(file.name)
      }
    } catch {
      setError('파일을 읽는 중 문제가 발생했습니다.')
      setMatches(null)
    } finally {
      setLoading(false)
    }
  }

  function resolvedMember(match: PromotionImportMatch, index: number): TeamMember | null {
    return resolveMatchedMember(match, index, manualPicks)
  }

  function handleApply() {
    if (!matches) return
    setApplied(applyPromotionHistory(matches, manualPicks, applyHireDate))
  }

  useEffect(() => {
    if (!applied) return
    const timer = setTimeout(() => onApplied(), AUTO_ADVANCE_DELAY_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied])

  const matchedCount = matches?.filter((m, i) => resolvedMember(m, i)).length ?? 0

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-black">인사평가 이력 엑셀로 가져오기</h3>
          <p className="mt-1 text-[13px] text-gray-500">
            승진 시뮬레이션 Excel의 팀원별 연도별 평가등급(업적 상/하, 역량)과 승급심사일, 보조지표를 읽어,
            이름이 일치하는 현재 팀원에게 바로 적용합니다.
          </p>
        </div>
        <IconButton onClick={onDismiss} aria-label="닫기" className="shrink-0">
          <CloseIcon className="h-5 w-5" />
        </IconButton>
      </div>

        {!matches && (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const f = e.dataTransfer.files?.[0]
              if (f) handleFile(f)
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragActive ? 'border-accent bg-blue-50' : 'border-gray-300 hover:border-accent'
            }`}
          >
            {loading ? (
              <Spinner className="h-6 w-6 text-accent" />
            ) : (
              <>
                <span className="text-sm font-medium text-black">
                  {dragActive ? '여기에 놓아 업로드' : '클릭하거나 파일을 끌어다 놓으세요'}
                </span>
                <span className="text-xs text-gray-400">.xlsx</span>
              </>
            )}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
            />
          </label>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        {matches && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-[13px] text-gray-500">
              <span>{fileName}</span>
              <button
                onClick={() => {
                  setMatches(null)
                  setApplied(null)
                }}
                className="text-accent hover:underline"
              >
                다른 파일 선택
              </button>
            </div>

            {/* 매칭은 이름 기준 자동 처리라 뺄 수 있는 항목이 없다(동명이인일
                때만 고르면 됨) -- 시트명은 거의 항상 이름과 같아 별도
                컬럼으로 반복할 필요가 없다. 표 대신 한 줄짜리 리스트로
                압축해 자리를 덜 차지하게 했다. */}
            <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-200">
              {matches.map(({ sheet, member, candidates }, index) => (
                <li key={`${sheet.sheetName}-${sheet.name}-${index}`} className="flex items-center gap-2 px-3 py-1.5 text-sm text-black">
                  <span className="min-w-0 flex-1 truncate font-medium">{sheet.name}</span>
                  <span className="shrink-0">
                    {member ? (
                      <span className="text-xs font-medium text-success">연결됨</span>
                    ) : candidates.length > 1 ? (
                      <select
                        value={manualPicks[index] ?? ''}
                        onChange={(e) => setManualPicks((p) => ({ ...p, [index]: e.target.value }))}
                        className="rounded-md border border-accent px-1.5 py-1 text-xs text-black"
                      >
                        <option value="">동명이인 {candidates.length}명 -- 선택</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.role || c.level || '역할 미지정'})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-400">매칭 안 됨</span>
                    )}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs text-gray-400">{sheet.years.length}개 연도</span>
                </li>
              ))}
            </ul>

            <label className="mt-3 flex items-center gap-2 text-[13px] text-gray-600">
              <input
                type="checkbox"
                checked={applyHireDate}
                onChange={(e) => setApplyHireDate(e.target.checked)}
              />
              입사일 · 승급일 · 보조지표도 함께 적용 (팀원 상세정보에 해당 값이 비어있는 경우만)
            </label>

            {matchedCount === 0 ? (
              <p className="mt-3 text-[13px] text-gray-400">
                매칭되는 팀원이 없어 적용할 수 없습니다. 팀원 이름이 엑셀과 정확히 일치하는지 확인하세요.
              </p>
            ) : (
              <button
                type="button"
                onClick={applied ? onApplied : handleApply}
                className={`mt-4 flex w-full items-center justify-center gap-1.5 rounded-md py-2.5 text-sm font-medium text-white transition-colors ${
                  applied ? 'bg-success' : 'bg-accent hover:opacity-90'
                }`}
              >
                {applied && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4 shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                {applied ? '적용 완료' : `${matchedCount}명에게 적용`}
              </button>
            )}

            {applied && (
              <p className="mt-3 rounded-md bg-success/10 px-3 py-2.5 text-[13px] text-success">
                {applied.memberCount}명, {applied.yearCount}개 연도 기록을 적용했습니다.
                {applied.skipped > 0 && ` (매칭 안 된 ${applied.skipped}명은 건너뜀)`}
              </p>
            )}
          </div>
        )}
    </div>
  )
}

// 독립 진입점(예: 팀원 면담 화면의 "지난 성과 엑셀파일 불러오기")에서만
// 쓰는 모달 래퍼 -- 배경 딤 처리와 카드 틀만 담당하고 실제 내용은 위
// PromotionHistoryImportPanel 그대로 재사용한다.
export default function PromotionHistoryImportModal({ onClose, initialFile }: { onClose: () => void; initialFile?: File }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <PromotionHistoryImportPanel initialFile={initialFile} onApplied={onClose} onDismiss={onClose} />
      </div>
    </div>
  )
}
