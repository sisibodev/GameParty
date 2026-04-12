import { signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider, db } from './config'

/** 허용된 이메일인지 Firestore에서 확인 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const docRef = doc(db, 'allowedUsers', email)
  const docSnap = await getDoc(docRef)
  return docSnap.exists()
}

/** Google 로그인 시작 (리다이렉트 방식 — GitHub Pages COOP 대응) */
export async function startGoogleSignIn(): Promise<void> {
  await signInWithRedirect(auth, googleProvider)
}

/** 리다이렉트 후 결과 처리 — 앱 초기화 시 한 번 호출 */
export async function processRedirectResult(): Promise<void> {
  const result = await getRedirectResult(auth)
  if (!result) return  // 리다이렉트 결과 없으면 그냥 리턴

  const email = result.user.email ?? ''
  const allowed = await isEmailAllowed(email)
  if (!allowed) {
    await signOut(auth)
    throw new Error('ACCESS_DENIED')
  }
}

/** 로그아웃 */
export async function signOutUser(): Promise<void> {
  await signOut(auth)
}
