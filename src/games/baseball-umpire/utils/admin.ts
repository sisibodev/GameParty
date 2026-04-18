/**
 * 관리자 이메일 목록
 * 클라이언트 UI 제어용 — 보안 경계가 아닌 메뉴 표시/숨김에만 사용
 */
const ADMIN_EMAILS = [
  'sisibo.dev@gmail.com',
]

export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return ADMIN_EMAILS.includes(email.toLowerCase())
}
