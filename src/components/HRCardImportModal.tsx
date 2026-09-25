// 종합 인사기록카드 엑셀을 올려 팀원 정보(직급·입사일·직급 발령일·담당팀)를 맞추는 팝업.
// 이름으로 현재 팀원과 매칭하고, 바뀌는 값만 보여 준 뒤 고른 사람만 적용한다.
import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { X } from 'lucide-react'
import type { TeamMember } from '../types'
import { parseHRCards, type HRCardPerson } from '../utils/hrCard'
import Button from './Button'
import IconButton from './IconButton'
import Spinner from './Spinner'
import { ic } from './ui/icon'

interface Change {
  label: string
  from: string
  to: string
}

interface Row {
  person: HRCardPerson
  candidates: TeamMember[]
  memberId: string | null // null = 매칭 없음(새로 추가 대상)
  changes: Change[]
  patch: Partial<TeamMember>
  on: boolean
}

function diff(person: HRCardPerson, m: TeamMember | null): { changes: Change[]; patch: Partial<TeamMember> } {
  const changes: Change[] = []
  const patch: Partial<TeamMember> = {}
  const cur = m ?? ({ level: '', hireDate: null, currentLevelSince: null, team: undefined, role: '' } as unknown as TeamMember)
  if (person.level && person.level !== cur.level) {
    changes.push({ label: '직급', from: cur.level || '-', to: person.level })
    patch.level = person.level
  }
  if (person.hireDate && person.hireDate !== (cur.hireDate ?? null)) {
    changes.push({ label: '입사일', from: cur.hireDate || '-', to: person.hireDate })
    patch.hireDate = person.hireDate
  }
  if (person.currentLevelSince && person.currentLevelSince !== (cur.currentLevelSince ?? null)) {
    changes.push({ label: '직급 발령일', from: cur.currentLevelSince || '-', to: person.currentLevelSince })
    patch.currentLevelSince = person.currentLevelSince
  }
  if (person.team && person.team !== (cur.team ?? '')) {
    changes.push({ label: '담당팀', from: cur.team || '-', to: person.team })
    patch.team = person.team
  }
  // 역할은 비어 있을 때만 카드의 직책으로 채운다(팀장이 적어 둔 역할을 덮지 않음).
  if (person.position && !cur.role) {
    changes.push({ label: '역할', from: '-', to: person.position })
    patch.role = person.position
  }
  return { changes, patch }
}

export default function HRCardImportModal({
  members,
  onApply,
  onClose,
}: {
  members: TeamMember[]
  onApply: (updates: TeamMember[], adds: TeamMember[]) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [fileNames, setFileNames] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [dragActive, setDragActive] = useState(false)

  async function handleFiles(files: File[]) {
    setError('')
    setLoading(true)
    try {
      const people: HRCardPerson[] = []
      for (const f of files) people.push(...parseHRCards(await f.arrayBuffer(), f.name))
      if (people.length === 0) {
        setError('인사기록카드에서 사람을 찾지 못했습니다. "종합 인사기록카드" 양식(.xls/.xlsx)인지 확인하세요.')
        return
      }
      const key = (s: string) => s.replace(/\s+/g, '')
      setRows(
        people.map((person) => {
          const candidates = members.filter((m) => key(m.name) === key(person.name))
          const m = candidates.length === 1 ? candidates[0] : null
          const { changes, patch } = diff(person, m)
          return { person, candidates, memberId: m?.id ?? null, changes, patch, on: !!m && changes.length > 0 }
        }),
      )
      setFileNames(files.map((f) => f.name).join(', '))
    } catch {
      setError('파일을 읽지 못했습니다. 엑셀 파일(.xls/.xlsx)인지 확인하세요.')
    } finally {
      setLoading(false)
    }
  }

  function pickMember(i: number, memberId: string) {
    setRows((cur) =>
      cur!.map((r, k) => {
        if (k !== i) return r
        const m = members.find((x) => x.id === memberId) ?? null
        const { changes, patch } = diff(r.person, m)
        return { ...r, memberId: m?.id ?? null, changes, patch, on: !!m && changes.length > 0 }
      }),
    )
  }

  function apply() {
    if (!rows) return
    const updates: TeamMember[] = []
    const adds: TeamMember[] = []
    for (const r of rows) {
      if (!r.on) continue
      const m = members.find((x) => x.id === r.memberId)
      if (m) updates.push({ ...m, ...r.patch })
      else
        adds.push({
          id: uuidv4(),
          name: r.person.name,
          active: true,
          level: '',
          yearsOfService: null,
          role: '',
          comment: '',
          hireDate: null,
          currentLevelSince: null,
          ...r.patch,
        })
    }
    onApply(updates, adds)
  }

  const count = rows?.filter((r) => r.on).length ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-2xl rounded-[12px] bg-white p-5 shadow-dialog" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-label">인사기록카드로 팀원 정보 맞추기</h3>
            <p className="mt-1 text-[13px] text-label-2">
              종합 인사기록카드에서 직위·입사일·최종승진일·소속을 읽어, 이름이 같은 팀원에게 적용합니다.
              <br />
              주민번호·연락처·주소·가족 등 다른 정보는 읽지도 저장하지도 않습니다.
            </p>
          </div>
          <IconButton onClick={onClose} aria-label="닫기" className="shrink-0">
            <X {...ic} />
          </IconButton>
        </div>

        {!rows && (
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragActive(true)
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragActive(false)
              const fs = Array.from(e.dataTransfer.files ?? [])
              if (fs.length) handleFiles(fs)
            }}
            className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
              dragActive ? 'border-accent bg-accent-soft' : 'border-separator hover:border-accent/50'
            }`}
          >
            {loading ? (
              <Spinner className="h-6 w-6 text-accent" />
            ) : (
              <>
                <span className="text-[13px] font-medium text-label">{dragActive ? '여기에 놓아 업로드' : '클릭하거나 파일을 끌어다 놓으세요'}</span>
                <span className="text-[13px] text-label-3">.xls · .xlsx · 여러 명 한 번에 가능</span>
              </>
            )}
            <input
              type="file"
              accept=".xls,.xlsx"
              multiple
              className="hidden"
              disabled={loading}
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? [])
                if (fs.length) handleFiles(fs)
              }}
            />
          </label>
        )}

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        {rows && (
          <div className="mt-4">
            <div className="flex items-center justify-between gap-2 text-[13px] text-label-2">
              <span className="truncate">{fileNames}</span>
              <button onClick={() => setRows(null)} className="shrink-0 text-accent hover:underline">
                다른 파일 선택
              </button>
            </div>
            <ul className="mt-3 max-h-[50vh] divide-y divide-separator overflow-y-auto rounded-card border border-separator">
              {rows.map((r, i) => {
                const matched = !!r.memberId
                return (
                  <li key={`${r.person.source}-${i}`} className="flex items-start gap-3 px-3 py-2.5 text-[13px]">
                    <input
                      type="checkbox"
                      checked={r.on}
                      disabled={matched && r.changes.length === 0}
                      onChange={(e) => setRows((cur) => cur!.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))}
                      className="mt-0.5"
                      title={matched ? '이 팀원에게 적용' : '새 팀원으로 추가'}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-label">{r.person.name}</span>
                        {r.candidates.length > 1 ? (
                          <select value={r.memberId ?? ''} onChange={(e) => pickMember(i, e.target.value)} className="h-7 rounded-control border border-hairline px-2 text-xs">
                            <option value="">동명이인 {r.candidates.length}명 -- 선택</option>
                            {r.candidates.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} · {c.team || c.role || c.level || '정보 없음'}
                              </option>
                            ))}
                          </select>
                        ) : matched ? (
                          <span className="mac-badge bg-success/15 text-success">팀원 연결</span>
                        ) : (
                          <span className="mac-badge bg-black/[0.05] text-label-2">팀원 목록에 없음 · 체크하면 새로 추가</span>
                        )}
                        {!r.person.level && r.person.levelRaw && <span className="text-xs text-warning">직위 "{r.person.levelRaw}"는 직급 목록에 없어 건너뜀</span>}
                      </div>
                      {r.changes.length === 0 ? (
                        <p className="mt-0.5 text-xs text-label-3">{matched ? '바뀌는 값 없음' : '가져올 값 없음'}</p>
                      ) : (
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                          {r.changes.map((c) => (
                            <span key={c.label} className="text-label-2">
                              {c.label} <span className="text-label-3">{c.from}</span> → <span className="font-medium text-label">{c.to}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                취소
              </Button>
              <Button variant="primary" onClick={apply} disabled={count === 0}>
                {count}명 적용
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
