import { Loader2 } from 'lucide-react'

export default function Spinner({ className = 'h-4 w-4' }: { className?: string }) {
  return <Loader2 strokeWidth={1.75} className={`animate-spin ${className}`} />
}
