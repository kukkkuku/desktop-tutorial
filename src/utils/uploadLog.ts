export interface UploadRecord {
  name: string
  date: string
}

export interface UploadsLog {
  task?: UploadRecord
  member?: UploadRecord
  peer?: UploadRecord
}

function uploadsKey(workspaceId: string): string {
  return `ux-performance-evaluation-uploads-${workspaceId}`
}

export function loadUploadsLog(workspaceId: string): UploadsLog {
  try {
    const raw = localStorage.getItem(uploadsKey(workspaceId))
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveUploadsLog(workspaceId: string, log: UploadsLog): void {
  try {
    localStorage.setItem(uploadsKey(workspaceId), JSON.stringify(log))
  } catch {
    // ignore -- purely cosmetic metadata, safe to lose
  }
}

export function todayLabel(): string {
  const d = new Date()
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}
