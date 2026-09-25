// 구글시트 모양 아이콘(초록 문서 + 흰 표). 시트와 연결된 곳을 한눈에 알아보게.
export default function SheetsIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 20" className={className} aria-hidden>
      <path d="M2 0h8.5L16 5.5V18a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2a2 2 0 0 1 2-2z" fill="#0F9D58" />
      <path d="M10.5 0 16 5.5h-3.5a2 2 0 0 1-2-2z" fill="#87CEAC" />
      <path d="M3.5 9h9v7h-9z" fill="#fff" />
      <path d="M3.5 11.4h9M3.5 13.7h9M7.2 9v7" stroke="#0F9D58" strokeWidth="1" />
    </svg>
  )
}
