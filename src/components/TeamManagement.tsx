import { useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { TeamMember } from '../types'
import { getContributionRatio, getTaskContributionSum, isContributionSumValid } from '../utils/calculations'
import MemberModal from './MemberModal'
import ConfirmDialog from './ConfirmDialog'

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null)

  function openAddModal() {
    setEditingMember(null)
    setModalOpen(true)
  }

  function openEditModal(member: TeamMember) {
    setEditingMember(member)
    setModalOpen(true)
  }

  function handleSave(member: TeamMember) {
    if (editingMember) {
      dispatch({ type: 'UPDATE_MEMBER', payload: member })
    } else {
      dispatch({ type: 'ADD_MEMBER', payload: member })
    }
    setModalOpen(false)
    setEditingMember(null)
  }

  function handleDeleteConfirm() {
    if (deletingMember) {
      dispatch({ type: 'DELETE_MEMBER', payload: { id: deletingMember.id } })
      setDeletingMember(null)
    }
  }

  function handleContributionChange(taskId: string, memberId: string, value: string) {
    const parsed = value === '' ? 0 : parseFloat(value)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(1, Math.max(0, parsed))
    dispatch({ type: 'SET_CONTRIBUTION', payload: { taskId, memberId, contributionRatio: clamped } })
  }

  const invalidTasks = state.tasks
    .map((task) => ({ task, sum: getTaskContributionSum(state.contributions, task.id) }))
    .filter(({ sum }) => !isContributionSumValid(sum))

  return (
    <div>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-black">팀원 관리</h2>
        <button
          onClick={openAddModal}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          + 팀원 추가
        </button>
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">활성여부</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {state.members.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                  등록된 팀원이 없습니다. '+ 팀원 추가' 버튼을 눌러 팀원을 등록하세요.
                </td>
              </tr>
            )}
            {state.members.map((member) => (
              <tr key={member.id} className="border-t border-gray-200 text-black">
                <td className="px-4 py-3 font-medium">{member.name}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium ${
                      member.active ? 'bg-green-50 text-success' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {member.active ? '사용' : '미사용'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEditModal(member)}
                      className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium hover:bg-gray-100"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => setDeletingMember(member)}
                      className="rounded-md border border-danger px-3 py-1 text-xs font-medium text-danger hover:bg-red-50"
                    >
                      삭제
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-8 text-lg font-bold text-black">과제별 기여도 입력</h3>
      <p className="mt-1 text-sm text-gray-600">
        각 과제마다 모든 팀원의 기여도 합계가 1.0이 되어야 합니다. (0~1 사이 숫자 입력)
      </p>

      {state.tasks.length === 0 || state.members.length === 0 ? (
        <p className="mt-4 rounded-md bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          기여도를 입력하려면 먼저 과제와 팀원을 등록하세요.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full min-w-[600px] text-left text-sm">
              <thead className="bg-[#F3F4F6] text-black">
                <tr>
                  <th className="px-4 py-3 font-semibold">팀원</th>
                  {state.tasks.map((task) => (
                    <th key={task.id} className="px-4 py-3 font-semibold">
                      {task.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {state.members.map((member) => (
                  <tr key={member.id} className="border-t border-gray-200 text-black">
                    <td className="px-4 py-3 font-medium">{member.name}</td>
                    {state.tasks.map((task) => (
                      <td key={task.id} className="px-4 py-2">
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.01}
                          value={getContributionRatio(state.contributions, task.id, member.id)}
                          onChange={(e) => handleContributionChange(task.id, member.id, e.target.value)}
                          placeholder="0.0"
                          className="w-20 rounded-md border border-gray-300 px-2 py-1 text-sm text-black"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-4 py-3 text-black">합계</td>
                  {state.tasks.map((task) => {
                    const sum = getTaskContributionSum(state.contributions, task.id)
                    const valid = isContributionSumValid(sum)
                    return (
                      <td
                        key={task.id}
                        className={`px-4 py-3 ${valid ? 'text-success' : 'text-danger'}`}
                      >
                        {sum.toFixed(2)}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          {invalidTasks.length > 0 && (
            <div className="mt-3 space-y-1 rounded-md border border-danger/30 bg-red-50 px-4 py-3">
              {invalidTasks.map(({ task, sum }) => {
                const diff = 1 - sum
                const action = diff > 0 ? `${diff.toFixed(2)}를 추가하세요` : `${Math.abs(diff).toFixed(2)}를 줄이세요`
                return (
                  <p key={task.id} className="text-sm text-danger">
                    '{task.name}' 과제의 기여도 합계가 {sum.toFixed(2)}입니다. {action}.
                  </p>
                )
              })}
            </div>
          )}
        </>
      )}

      {modalOpen && (
        <MemberModal
          initialMember={editingMember}
          existingNames={state.members.map((m) => m.name)}
          onSave={handleSave}
          onClose={() => {
            setModalOpen(false)
            setEditingMember(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deletingMember !== null}
        title="팀원 삭제"
        message={`'${deletingMember?.name}' 팀원을 삭제하시겠습니까? 관련된 기여도 데이터도 함께 삭제됩니다.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingMember(null)}
      />
    </div>
  )
}
