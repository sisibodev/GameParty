// 관리자 도메인 — 이 도메인 이메일 계정만 adminOnly 게임에 접근 가능
const ADMIN_DOMAINS: readonly string[] = ['sisibo.dev']

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const lower = email.toLowerCase()
  return ADMIN_DOMAINS.some(domain => lower.endsWith(`@${domain}`))
}
