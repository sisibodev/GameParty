import { signInWithPopup, signOut } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider, db } from './config'

/** 허용된 이메일인지 Firestore에서 확인 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const docRef = doc(db, 'allowedUsers', email)
  const docSnap = await getDoc(docRef)
  return docSnap.exists()
}

/** Google 로그인 — 허용 이메일 아니면 자동 로그아웃 후 에러 */
export async function signInWithGoogle(): Promise<void> {
  const result = await signInWithPopup(auth, googleProvider)
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
