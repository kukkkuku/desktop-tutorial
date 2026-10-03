// 관리 › 권한 시트: 「사용자」 · 「연결 시트」를 앱에서 바로 고쳐 구글시트에 저장한다.
// 고친 내용은 저장하기 전까지 이 화면에만 있다. 저장하면 시트에 쓰고 「변경 기록」에 한 줄 남긴다(accessSheet.saveAccess).
// 막는 것: 이메일 모양 · 같은 이메일 두 번 · 관리자 0명 · 나 자신의 관리자 해제(잠겨서 못 돌아옴).
import { useEffect, useMemo, useState } from 'react'
import { ClipboardPaste, Plus, RotateCcw, Save, Trash2, UserPlus } from 'lucide-react'
import Button from '../Button'
import Spinner from '../Spinner'
import Select from '../ui/Select'
import ConfirmDialog from '../ConfirmDialog'
import { icSm } from '../ui/icon'
import {
  ALL_TEAMS,
  AccessConflictError,
  LINKS_TAB,
  LOG_TAB,
  ROLE_WORD,
  USERS_TAB,
  describeChanges,
  sameAccess,
  saveAccess,
  type AccessData,
  type AccessLink,
  type AccessRole,
  type AccessUser,
} from '../../utils/accessSheet'
import { hasLoginSheetsToken, parseSheetUrl } from '../../utils/sheetSources'

const ROLES: AccessRole[] = ['admin', 'leader', 'member']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const norm = (e: string) => e.trim().toLowerCase()
// 아이디만 적으면 @gmail.com을 붙인다(초대 메일과 같은 규칙)
const fullEmail = (x: string) => (x.includes('@') ? x.trim() : /^[a-z0-9.]{3,}$/i.test(x.trim()) ? `${x.trim()}@gmail.com` : x.trim())

const input =
  'h-8 w-full min-w-0 rounded-control border border-transparent bg-transparent px-2 text-[13.5px] outline-none hover:border-hairline focus:border-accent focus:bg-white'

export default function AccessEditor({ data, me, onSaved, readOnly }: { data: AccessData; me: string | null; onSaved: () => void; readOnly?: boolean }) {
  const [users, setUsers] = useState<AccessUser[]>(data.users)
  const [links, setLinks] = useState<AccessLink[]>(data.links)
  const [paste, setPaste] = useState<{ text: string; role: AccessRole } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const dirty = !readOnly && !sameAccess(data, { users, links })

  // 시트를 다시 읽으면(다시 읽기 · 저장 · 저장 충돌) 화면을 시트 내용으로
  useEffect(() => {
    setUsers(data.users)
    setLinks(data.links)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.fetchedAt])

  const changes = useMemo(() => (dirty ? describeChanges(data, users, links) : []), [dirty, data, users, links])
  const teams = useMemo(() => [...new Set([...links.map((l) => l.team), ...users.map((u) => u.team)].filter((t) => t && t !== ALL_TEAMS))], [links, users])

  // 막는 것
  const counts = new Map<string, number>()
  users.forEach((u) => counts.set(norm(u.email), (counts.get(norm(u.email)) ?? 0) + 1))
  const badEmail = (u: AccessUser) => !EMAIL_RE.test(u.email.trim()) || (counts.get(norm(u.email)) ?? 0) > 1
  const problems: string[] = []
  if (users.some(badEmail)) problems.push('이메일이 비었거나 모양이 틀렸거나 두 번 적힌 줄이 있습니다(빨간 칸).')
  if (!users.some((u) => u.role === 'admin')) problems.push('관리자가 한 명은 있어야 합니다.')
  const meNow = me ? users.find((u) => norm(u.email) === norm(me)) : null
  const meBefore = me ? data.users.find((u) => norm(u.email) === norm(me)) : null
  if (meBefore?.role === 'admin' && meNow?.role !== 'admin') problems.push('내 계정의 관리자를 풀면 이 화면에 다시 못 들어옵니다. 다른 관리자가 바꿔 주세요.')
  if (links.some((l) => !l.team.trim() || !parseSheetUrl(l.url))) problems.push('연결 시트에 팀이 비었거나 구글시트 링크가 아닌 줄이 있습니다.')

  const setUser = (i: number, patch: Partial<AccessUser>) => setUsers(users.map((u, j) => (j === i ? { ...u, ...patch } : u)))
  const setLink = (i: number, patch: Partial<AccessLink>) => setLinks(links.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  // 여러 명 붙여넣기: 한 줄에 한 명 -- 「이메일 [탭/쉼표] 이름 [팀]」. 이미 있는 이메일은 역할만 바꾸고 빈 이름은 채운다.
  function applyPaste() {
    if (!paste) return
    const next = [...users]
    let added = 0
    let updated = 0
    for (const line of paste.text.split(/\r?\n/)) {
      const [e = '', name = '', team = ''] = line.split(/\t|,|;/).map((x) => x.trim())
      const email = fullEmail(e.replace(/\s*입니다.*$/, '')) // 메신저에서 그대로 붙인 "…@gmail.com 입니다"도
      if (!EMAIL_RE.test(email)) continue
      const hit = next.findIndex((u) => norm(u.email) === norm(email))
      if (hit >= 0) {
        next[hit] = { ...next[hit], role: paste.role, name: next[hit].name || name, team: next[hit].team || team }
        updated++
      } else {
        next.push({ email: norm(email), name, role: paste.role, team, memo: '' })
        added++
      }
    }
    setUsers(next)
    setPaste(null)
    setNote({ ok: true, text: `붙여넣기: ${added}명 추가${updated ? ` · ${updated}명 역할 바꿈` : ''} -- 아직 저장 전입니다.` })
  }

  async function save() {
    setConfirm(false)
    setSaving(true)
    setNote(null)
    try {
      await saveAccess(data, users, links, me ?? '')
      setNote({ ok: true, text: `구글시트에 저장했습니다 · ${changes.length}건 · 「${LOG_TAB}」 탭에 기록` })
      onSaved()
    } catch (e) {
      if (e instanceof AccessConflictError) onSaved()
      setNote({ ok: false, text: e instanceof Error ? e.message : '저장하지 못했습니다.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    // 팀장은 보기만(칸 · 버튼이 모두 잠김)
    <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-5 border-0 p-0">
      {readOnly && (
        <p className="rounded-card bg-subtle px-3 py-2 text-[13.5px] text-label-2">
          사람 · 역할 · 연결 시트를 고치는 것은 관리자만 합니다. 바꿀 것이 있으면 관리자에게 알려 주세요.
        </p>
      )}
      {/* 저장 줄: 고친 것이 있을 때만 */}
      {dirty && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-card border border-accent/30 bg-accent-soft px-4 py-2.5">
          <span className="text-[14px] font-medium text-label">저장 안 한 변경 {changes.length}건</span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-label-2" title={changes.join('\n')}>
            {changes.slice(0, 3).join(' · ')}
            {changes.length > 3 ? ` 외 ${changes.length - 3}건` : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={() => (setUsers(data.users), setLinks(data.links), setNote(null))} disabled={saving}>
            <RotateCcw {...icSm} />
            되돌리기
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setConfirm(true)}
            disabled={saving || problems.length > 0}
            title={problems.join('\n') || undefined}
          >
            {saving ? <Spinner className="h-3.5 w-3.5" /> : <Save {...icSm} />}
            구글시트에 저장
          </Button>
        </div>
      )}
      {dirty && problems.length > 0 && (
        <ul className="list-disc space-y-0.5 rounded-card bg-danger/[0.06] px-6 py-2 text-[13.5px] text-danger">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {note && (
        <p className={`rounded-card px-3 py-2 text-[13.5px] ${note.ok ? 'bg-success/[0.08] text-success' : 'bg-danger/[0.06] text-danger'}`}>{note.text}</p>
      )}

      <section className="rounded-card border border-separator p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-label">
            {USERS_TAB} <span className="font-normal text-label-3">{users.length}명</span>
          </h3>
          <span className="text-[13px] text-label-3">칸을 눌러 바로 고칩니다</span>
          <span className={`ml-auto flex gap-1.5 ${readOnly ? 'hidden' : ''}`}>
            <Button variant="secondary" size="sm" onClick={() => setPaste(paste ? null : { text: '', role: 'member' })}>
              <ClipboardPaste {...icSm} />
              여러 명 붙여넣기
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setUsers([...users, { email: '', name: '', role: 'member', team: '', memo: '' }])}>
              <UserPlus {...icSm} />한 명 추가
            </Button>
          </span>
        </div>

        {paste && (
          <div className="mt-3 rounded-card border border-separator bg-subtle p-3">
            <p className="text-[13px] text-label-2">
              한 줄에 한 명: <b>이메일</b>(탭 · 쉼표) <b>이름</b>(탭 · 쉼표) <b>팀</b>. 아이디만 적으면 @gmail.com이 붙습니다. 이미 있는 사람은 역할만 바꿉니다.
            </p>
            <textarea
              autoFocus
              value={paste.text}
              onChange={(e) => setPaste({ ...paste, text: e.target.value })}
              rows={5}
              placeholder={'kim@example.com, 김가온, 브랜드디자인팀\nlee@example.com, 이나래'}
              className="mt-2 w-full rounded-control border border-hairline bg-white px-2.5 py-2 font-mono text-[13px] outline-none focus:border-accent"
            />
            <div className="mt-2 flex items-center gap-2">
              <span className="text-[13.5px] text-label-2">역할</span>
              <Select value={paste.role} onChange={(e) => setPaste({ ...paste, role: e.target.value as AccessRole })} className="h-8 px-2.5 text-[13.5px]">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_WORD[r]}
                  </option>
                ))}
              </Select>
              <Button variant="primary" size="sm" onClick={applyPaste} disabled={!paste.text.trim()}>
                <Plus {...icSm} />
                목록에 넣기
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPaste(null)}>
                닫기
              </Button>
            </div>
          </div>
        )}

        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13.5px]">
            <thead>
              <tr className="text-left text-label-3">
                <th className="w-[30%] px-2 py-1 font-medium">이메일</th>
                <th className="w-[14%] px-2 py-1 font-medium">이름</th>
                <th className="w-[13%] px-2 py-1 font-medium">역할</th>
                <th className="w-[18%] px-2 py-1 font-medium">팀</th>
                <th className="px-2 py-1 font-medium">메모</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => {
                const isMe = !!me && norm(u.email) === norm(me)
                return (
                  <tr key={i} className="border-t border-separator">
                    <td className="py-0.5">
                      <input
                        value={u.email}
                        onChange={(e) => setUser(i, { email: e.target.value })}
                        onBlur={(e) => setUser(i, { email: norm(fullEmail(e.target.value)) })}
                        placeholder="이메일"
                        className={`${input} ${badEmail(u) ? '!border-danger/60' : ''}`}
                      />
                    </td>
                    <td className="py-0.5">
                      <input value={u.name} onChange={(e) => setUser(i, { name: e.target.value })} className={input} />
                    </td>
                    <td className="py-0.5">
                      <Select value={u.role} onChange={(e) => setUser(i, { role: e.target.value as AccessRole })} className="h-8 w-full px-2 text-[13.5px]">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_WORD[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="py-0.5">
                      <input value={u.team} onChange={(e) => setUser(i, { team: e.target.value })} list="access-teams" className={input} />
                    </td>
                    <td className="py-0.5">
                      <input value={u.memo ?? ''} onChange={(e) => setUser(i, { memo: e.target.value })} className={input} />
                    </td>
                    <td className="py-0.5 text-center">
                      <button
                        onClick={() => setUsers(users.filter((_, j) => j !== i))}
                        disabled={isMe}
                        title={isMe ? '내 계정은 지울 수 없습니다' : '이 사람 빼기'}
                        className="rounded p-1 text-label-3 hover:bg-danger/[0.08] hover:text-danger disabled:opacity-30"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <datalist id="access-teams">
            {teams.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
        {!users.length && <p className="mt-2 text-[13.5px] text-label-3">비어 있습니다. 한 명 추가 · 여러 명 붙여넣기로 넣으세요.</p>}
        {/* 역할별로 되는 것(roles.ts · useSheetManager · AdminApp과 같은 기준) */}
        <dl className="mt-3 grid gap-x-4 gap-y-1 rounded-card bg-subtle px-4 py-3 text-[13px] text-label-2 sm:grid-cols-[auto_1fr]">
          <dt className="font-semibold text-label">관리자</dt>
          <dd>팀장이 하는 것 전부 + 이 권한 표(사람 · 역할 · 연결 시트) 고치기</dd>
          <dt className="font-semibold text-label">팀장</dt>
          <dd>
            과제 입력 + 성과관리(팀 · 평가 · 피어리뷰 · 면담) + 관리 메뉴의 팀원 초대 메일 + 추진현황 · 과제관리의 시트 연결 바꾸기(링크 · 새 연도 · 엑셀로
            시작). 권한 표는 보기만
          </dd>
          <dt className="font-semibold text-label">팀원</dt>
          <dd>과제 입력만(추진현황 입력 · 저장, 진척률 보기)</dd>
        </dl>
      </section>

      <section className="rounded-card border border-separator p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[14px] font-semibold text-label">
            {LINKS_TAB} <span className="font-normal text-label-3">{links.length}개</span>
          </h3>
          <span className="text-[13px] text-label-3">팀별 추진현황 시트 · 「{ALL_TEAMS}」 = 팀 줄이 없는 모두</span>
          <Button
            variant="secondary"
            size="sm"
            className={`ml-auto ${readOnly ? 'hidden' : ''}`}
            onClick={() => setLinks([...links, { team: '', url: '', note: '' }])}
          >
            <Plus {...icSm} />팀 시트 추가
          </Button>
        </div>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13.5px]">
            <thead>
              <tr className="text-left text-label-3">
                <th className="w-[18%] px-2 py-1 font-medium">팀</th>
                <th className="px-2 py-1 font-medium">추진현황 시트 링크</th>
                <th className="w-[24%] px-2 py-1 font-medium">메모</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {links.map((l, i) => (
                <tr key={i} className="border-t border-separator">
                  <td className="py-0.5">
                    <input
                      value={l.team}
                      onChange={(e) => setLink(i, { team: e.target.value })}
                      list="access-teams"
                      className={`${input} ${l.team === ALL_TEAMS ? 'font-semibold' : ''}`}
                    />
                  </td>
                  <td className="py-0.5">
                    <input
                      value={l.url}
                      onChange={(e) => setLink(i, { url: e.target.value })}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      className={`${input} ${l.url && !parseSheetUrl(l.url) ? '!border-danger/60' : ''}`}
                    />
                  </td>
                  <td className="py-0.5">
                    <input value={l.note} onChange={(e) => setLink(i, { note: e.target.value })} className={input} />
                  </td>
                  <td className="py-0.5 text-center">
                    <button
                      onClick={() => setLinks(links.filter((_, j) => j !== i))}
                      title="이 줄 빼기"
                      className="rounded p-1 text-label-3 hover:bg-danger/[0.08] hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!links.some((l) => l.team === ALL_TEAMS) && (
          <p className="mt-2 text-[13px] text-orange-600">「{ALL_TEAMS}」 줄이 없습니다 -- 팀이 안 적힌 사람은 앱 기본 시트(테스트 시트)를 씁니다.</p>
        )}
      </section>

      <ConfirmDialog
        open={confirm}
        title="권한을 구글시트에 저장"
        message={`아래 ${changes.length}건을 권한 관리 시트에 쓰고 「${LOG_TAB}」 탭에 남깁니다. 팀원들은 다음 로그인 때(또는 다시 읽기) 반영됩니다.${hasLoginSheetsToken() ? '' : ' 처음 한 번은 구글 시트 편집 권한을 허용해야 합니다.'}`}
        confirmLabel="저장"
        tone="accent"
        onConfirm={() => void save()}
        onCancel={() => setConfirm(false)}
      >
        <ul className="mt-3 max-h-[240px] list-disc space-y-0.5 overflow-auto rounded-card border border-separator bg-[#F7F7F9] py-2 pl-7 pr-3 text-[13.5px] text-label">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </ConfirmDialog>
    </fieldset>
  )
}
