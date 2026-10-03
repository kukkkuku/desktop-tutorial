// 관리 › 권한 시트(관리자만): 앱의 역할 · 팀원 명단 · 실적관리 시트 연결을 저장하는 시트.
//   관리 화면에서 바꾸면 여기에 저장된다(시트를 직접 고칠 일은 없음).
//   공유: 관리자 · 팀장만 편집자(팀원을 추가하면 이 시트에 적으므로). 팀원은 공유하지 않는다(명단이 보이지 않게).
import { ExternalLink, FileSpreadsheet } from 'lucide-react'
import { icSm } from '../ui/icon'
import { accessSheetUrl, type AccessData } from '../../utils/accessSheet'
import { withGoogleAccount } from '../../utils/googleDrive'
import { ShareBlock } from './TaskSheetPanel'

export default function AccessSheetPanel({ data, me }: { data: AccessData; me: string }) {
  const url = accessSheetUrl()
  const managers = data.users.filter((u) => u.role !== 'member' && u.email !== me)
  const members = data.users.filter((u) => u.role === 'member').length
  return (
    <div className="max-w-4xl space-y-3">
      <p className="text-[length:calc(14px*var(--ui-fs,1))] text-label-2">
        앱의 <b className="text-label">역할 · 팀원 명단 · 실적관리 시트 연결</b>을 저장하는 시트입니다. 관리 화면에서 바꾸면 여기에 저장되고, 바꾼 내용은 「변경
        기록」 탭에 남습니다.
      </p>
      <section className="rounded-card border border-separator p-5">
        <div className="flex flex-wrap items-start gap-3">
          <FileSpreadsheet size={22} strokeWidth={1.7} className="mt-0.5 shrink-0 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="text-[length:calc(16px*var(--ui-fs,1))] font-semibold text-label">{data.title || '권한 시트'}</p>
            <p className="mt-1 text-[length:calc(13.5px*var(--ui-fs,1))] text-label-2">
              등록 {data.users.length}명(관리자 · 팀장 {data.users.length - members} · 팀원 {members})
            </p>
          </div>
          {url && (
            <a
              href={withGoogleAccount(url)}
              target="_blank"
              rel="noreferrer"
              className="flex shrink-0 items-center gap-1 rounded-control border border-hairline px-3 py-1.5 text-[length:calc(13.5px*var(--ui-fs,1))] text-label hover:bg-black/[0.03]"
            >
              <ExternalLink {...icSm} />
              시트 열기
            </a>
          )}
        </div>
        <div className="mt-5 border-t border-separator pt-4">
          <ShareBlock
            url={url}
            who="관리자 · 팀장에게"
            why="역할을 읽고 팀원을 추가하려면 이 시트의 편집자여야 합니다. 팀원에게는 공유하지 않습니다(명단이 보이지 않게) -- 팀원 앱은 초대 메일 링크로 실적관리 시트를 알아냅니다."
            list={managers}
          />
        </div>
      </section>
      <p className="text-[length:calc(13px*var(--ui-fs,1))] text-label-3">예전에 팀원에게 이 시트를 공유했다면 시트의 [공유]에서 빼도 됩니다.</p>
    </div>
  )
}
