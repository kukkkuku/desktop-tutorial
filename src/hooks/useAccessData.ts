// 권한 시트(앱 설정 시트) 내용: 캐시를 바로 보여 주고, 열 때 한 번 시트에서 새로 읽는다.
import { useEffect, useState } from 'react'
import { errText } from '../utils/googleError'
import { ACCESS_EVENT, getAccessSheetId, readAccessCache, refreshAccess } from '../utils/accessSheet'
import { hasSheetsTokenNow, isSheetsApiConfigured } from '../utils/sheetSources'

export function useAccessData(loadOnMount = true) {
  const [data, setData] = useState(readAccessCache)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const on = () => setData(readAccessCache())
    window.addEventListener(ACCESS_EVENT, on)
    return () => window.removeEventListener(ACCESS_EVENT, on)
  }, [])
  const sync = () => setData(readAccessCache())
  async function reload() {
    if (!getAccessSheetId() || !isSheetsApiConfigured()) return
    setBusy(true)
    setError('')
    try {
      await refreshAccess()
    } catch (e) {
      setError(errText(e, '읽지 못했습니다.'))
    } finally {
      setBusy(false)
      sync()
    }
  }
  // 화면을 열 때는 권한이 이미 있을 때만 조용히 새로 읽는다(로그인 창을 띄우지 않음 -- 없으면 기억해 둔 내용으로)
  useEffect(() => {
    if (loadOnMount && hasSheetsTokenNow()) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return { data, busy, error, reload, sync }
}
