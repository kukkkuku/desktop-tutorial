import { useCallback, useState } from 'react'
import { loadUploadsLog, saveUploadsLog, todayLabel, type UploadsLog } from '../utils/uploadLog'

export function useUploadsLog(workspaceId: string) {
  const [uploadsLog, setUploadsLog] = useState<UploadsLog>(() => loadUploadsLog(workspaceId))

  const recordUpload = useCallback(
    (kind: keyof UploadsLog, files: File[]) => {
      if (files.length === 0) return
      const name = files.length === 1 ? files[0].name : `${files[0].name} 외 ${files.length - 1}개`
      setUploadsLog((prev) => {
        const next = { ...prev, [kind]: { name, date: todayLabel() } }
        saveUploadsLog(workspaceId, next)
        return next
      })
    },
    [workspaceId],
  )

  return { uploadsLog, recordUpload }
}
