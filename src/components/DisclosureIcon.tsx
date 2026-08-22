export default function DisclosureIcon({ open, className = 'h-4 w-4' }: { open: boolean; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={`${className} fill-none stroke-current`} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={open ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} />
  </svg>
}
