const ADMIN_EMAILS = new Set([
  'jjy.osstem@gmail.com',
  'jjy100426@gmail.com',
])

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(email && ADMIN_EMAILS.has(email.trim().toLowerCase()))
}

