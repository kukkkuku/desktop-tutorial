import CriteriaPanel from './CriteriaPanel'
import EvaluationMatrix from './EvaluationMatrix'

export default function EvaluateTab() {
  return (
    <div className="flex min-h-0">
      <CriteriaPanel />
      <div className="min-w-0 flex-1 px-6 py-6">
        <EvaluationMatrix />
      </div>
    </div>
  )
}
