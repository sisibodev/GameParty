import { signInWithPopup, signOut, signInAnonymously, updateProfile } from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'
import { auth, googleProvider, db } from './config'

/** 허용된 이메일인지 Firestore에서 확인 */
export async function isEmailAllowed(email: string): Promise<boolean> {
  const docRef = doc(db, 'allowedUsers', email)
  const docSnap = await getDoc(docRef)
  return docSnap.exists()
}

/** Google 팝업 로그인 — 허용 이메일 아니면 자동 로그아웃 후 에러 */
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

/**
 * DEV 전용 — Firebase Anonymous Auth로 즉시 로그인한다.
 * Google 팝업 없이 실제 Firebase UID를 발급받아 RTDB 쓰기가 정상 동작한다.
 * Firebase 콘솔에서 Authentication > Anonymous 제공업체가 활성화되어 있어야 한다.
 */
export async function signInAnonymouslyDev(): Promise<void> {
  const result = await signInAnonymously(auth)
  if (!result.user.displayName) {
    await updateProfile(result.user, { displayName: 'Dev User' })
  }
}
