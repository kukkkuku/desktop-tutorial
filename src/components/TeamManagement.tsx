import { useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import type { TeamMember } from '../types'
import { calcMemberParticipation } from '../utils/calculations'
import { downloadMemberTemplate, parseMemberWorkbook, type MemberImportResult } from '../utils/excel'
import MemberModal from './MemberModal'
import ConfirmDialog from './ConfirmDialog'
import ImportFeedback from './ImportFeedback'

export default function TeamManagement() {
  const { state, dispatch } = useAppState()
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null)
  const [deletingMember, setDeletingMember] = useState<TeamMember | null>(null)
  const [importResult, setImportResult] = useState<MemberImportResult | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const buffer = await file.arrayBuffer()
    const result = parseMemberWorkbook(buffer, state.members)
    dispatch({ type: 'IMPORT_MEMBERS', payload: result.members })
    setImportResult(result)
  }

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
      <p className="mt-1 text-sm text-gray-600">
        팀원을 추가/삭제하면 평가 매트릭스의 열(컬럼)이 자동으로 반영됩니다. 삭제 시 해당 팀원의 모든 평가 데이터도 함께 제거됩니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-gray-200 px-4 py-3">
        <button
          onClick={downloadMemberTemplate}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-100"
        >
          엑셀 양식 다운로드
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-black hover:bg-gray-100"
        >
          엑셀로 업로드
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleFileSelected}
        />
        <span className="text-sm text-gray-500">
          이름, 직책(팀장/PM/PL), 직급(사원/대리/과장/차장), 연차, 역할, 코멘트 컬럼을 포함한 엑셀 파일을 업로드하세요.
        </span>
      </div>

      {importResult && (
        <ImportFeedback
          importedCount={importResult.importedCount}
          errors={importResult.errors}
          onDismiss={() => setImportResult(null)}
        />
      )}

      <div className="mt-4 overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#F3F4F6] text-black">
            <tr>
              <th className="px-4 py-3 font-semibold">이름</th>
              <th className="px-4 py-3 font-semibold">직책</th>
              <th className="px-4 py-3 font-semibold">직급</th>
              <th className="px-4 py-3 font-semibold">연차</th>
              <th className="px-4 py-3 font-semibold">역할</th>
              <th className="px-4 py-3 font-semibold">참여 과제 수</th>
              <th className="px-4 py-3 font-semibold">활성여부</th>
              <th className="px-4 py-3 font-semibold">관리</th>
            </tr>
          </thead>
          <tbody>
            {state.members.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  등록된 팀원이 없습니다. 위에서 팀원을 추가해보세요.
                </td>
              </tr>
            )}
            {state.members.map((member) => {
              const { count } = calcMemberParticipation(member, state.tasks, state.contributions)
              return (
                <tr key={member.id} className="border-t border-gray-200 text-black">
                  <td className="px-4 py-3 font-medium">{member.name}</td>
                  <td className="px-4 py-3">{member.position || '-'}</td>
                  <td className="px-4 py-3">{member.level || '-'}</td>
                  <td className="px-4 py-3">{member.yearsOfService ?? '-'}</td>
                  <td className="px-4 py-3">{member.role || '-'}</td>
                  <td className="px-4 py-3">{count}건</td>
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
              )
            })}
          </tbody>
        </table>
      </div>

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
