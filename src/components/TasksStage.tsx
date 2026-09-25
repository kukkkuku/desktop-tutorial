import TaskManagement from './TaskManagement'

export default function TasksStage({ onGoToWork }: { onGoToWork: () => void }) {
  return (
    <div>
      <TaskManagement onGoToWork={onGoToWork} />
    </div>
  )
}
