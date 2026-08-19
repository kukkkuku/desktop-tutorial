import { useState } from 'react'
import type ExcelJS from 'exceljs'
import { isGoogleDriveConfigured, uploadWorkbookToDrive } from '../utils/googleDrive'
import Spinner from './Spinner'

function CloudUploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M4 14.5A4.5 4.5 0 0 1 6.5 6a5.5 5.5 0 0 1 10.6 1.7A4 4 0 0 1 17 15" />
      <path d="M12 12v9" />
      <path d="m8 16 4-4 4 4" />
    </svg>
  )
}

interface GoogleDriveUploadButtonProps {
  // 클릭한 시점에 워크북을 만든다(항상 최신 데이터 기준) -- Excel 다운로드
  // 버튼들과 같은 build 함수를 그대로 재사용한다.
  buildWorkbook: () => { workbook: ExcelJS.Workbook; filename: string }
}

// 기존 "Excel 다운로드"를 대체하는 게 아니라 그 옆의 선택 기능이다. 로그인
// 없이 쓰던 기존 흐름은 그대로 두고, 이 버튼을 누른 사람만 구글 로그인을
// 거쳐 같은 내용을 구글 시트로 자기 드라이브에 올린다.
export default function GoogleDriveUploadButton({ buildWorkbook }: GoogleDriveUploadButtonProps) {
  const configured = isGoogleDriveConfigured()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!configured || busy) return
    setBusy(true)
    try {
      const { workbook, filename } = buildWorkbook()
      const buffer = await workbook.xlsx.writeBuffer()
      const { webViewLink } = await uploadWorkbookToDrive(buffer as ArrayBuffer, filename)
      window.open(webViewLink, '_blank')
    } catch (err) {
      alert(err instanceof Error ? err.message : '구글 드라이브 업로드에 실패했습니다.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={!configured || busy}
      title={configured ? '구글 드라이브에 구글 시트로 업로드' : 'Google 로그인이 설정되지 않아 사용할 수 없습니다.'}
      className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {busy ? <Spinner className="h-4 w-4" /> : <CloudUploadIcon className="h-4 w-4" />}
      구글 드라이브에 업로드
    </button>
  )
}
