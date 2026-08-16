import type { TeamMember } from '../../types'
import { useAppState } from '../../state/AppContext'
import { getIncompleteActions } from '../../utils/meetingActions'

export default function MemberInterviewPanel({
  member,
  onOpenMeetingPrep,
}: {
  member: TeamMember
  onOpenMeetingPrep: () => void
}) {
  const { state } = useAppState()
  const notes = state.meetingNotes
    .filter((n) => n.memberId === member.id)
    .sort((a, b) => b.date.localeCompare(a.date))
  const incompleteActions = getIncompleteActions(state.meetingNotes, member.id)

  return (
    <div className="space-y-4">
      <button
        onClick={onOpenMeetingPrep}
        className="w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
      >
        면담 화면에서 면담 준비 열기
      </button>

      {incompleteActions.length > 0 && (
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold text-gray-500">미완료 Action</p>
          <ul className="mt-1.5 space-y-1 text-[13px] text-black">
            {incompleteActions.map((a) => (
              <li key={a.id} className="flex items-center gap-1.5">
                <span className="text-gray-300">○</span>
                {a.content}
                <span className="text-gray-400">({a.noteDate})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-gray-500">면담 기록</p>
        {notes.length === 0 ? (
          <p className="mt-2 rounded-md bg-gray-50 px-4 py-4 text-center text-[13px] text-gray-500">아직 면담 기록이 없습니다.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {notes.map((note) => (
              <div key={note.id} className="rounded-md border border-gray-200 px-3 py-2.5">
                <p className="text-xs font-semibold text-gray-500">{note.date}</p>
                {note.comment && <p className="mt-1 whitespace-pre-wrap text-sm text-black">{note.comment}</p>}
                {(note.strengths || note.improvements || note.nextExperience || note.careerInterest) && (
                  <div className="mt-1.5 space-y-0.5 text-[13px] text-gray-600">
                    {note.strengths && <p>강점: {note.strengths}</p>}
                    {note.improvements && <p>보완 필요: {note.improvements}</p>}
                    {note.nextExperience && <p>다음 경험: {note.nextExperience}</p>}
                    {note.careerInterest && <p>Career 관심: {note.careerInterest}</p>}
                  </div>
                )}
                {note.actions && note.actions.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[13px] text-black">
                    {note.actions.map((a) => (
                      <li key={a.id}>
                        {a.done ? '✓' : '○'} {a.content}
                        {a.dueDate && <span className="text-gray-400"> ({a.dueDate})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
