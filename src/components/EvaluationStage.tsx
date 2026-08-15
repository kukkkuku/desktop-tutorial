import CriteriaPanel from './CriteriaPanel'
import EvaluationMatrix from './EvaluationMatrix'
import EvaluationResults from './EvaluationResults'

export default function EvaluationStage() {
  return (
    <div>
      <h2 className="text-xl font-bold text-black">평가</h2>
      <p className="mt-1 text-sm text-gray-600">
        기여도를 입력하고 결과를 바로 아래에서 확인하세요. 기준 설정을 조정하면 즉시 반영됩니다.
      </p>

      <div className="mt-4">
        <CriteriaPanel />
      </div>

      <div className="mt-8">
        <EvaluationMatrix />
      </div>

      <div className="mt-8">
        <EvaluationResults />
      </div>
    </div>
  )
}
