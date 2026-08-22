export default function ExpandCollapseIcon({ expanded, className = 'h-4 w-4' }: { expanded: boolean; className?: string }) {
  return expanded ? (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="m14 10 7-7M20 10h-6V4M10 14l-7 7M4 14h6v6" />
    </svg>
  ) : (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  )
}
