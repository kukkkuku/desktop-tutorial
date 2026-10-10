// 새 버전 확인을 시작만 한다(알림은 머리 줄의 종 맨 위에 뜬다 -- NoticeBell, 값은 utils/appUpdate.ts)
import { useEffect } from 'react'
import { startUpdateWatch } from '../utils/appUpdate'

export default function UpdateToast() {
  useEffect(() => startUpdateWatch(), [])
  return null
}
