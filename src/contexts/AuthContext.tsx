import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { onAuthStateChanged } from 'firebase/auth'
import { auth } from '../firebase/config'
import { processRedirectResult } from '../firebase/auth'

interface AuthContextValue {
  user: User | null
  loading: boolean
  redirectError: string | null
  clearRedirectError: () => void
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  redirectError: null,
  clearRedirectError: () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [redirectError, setRedirectError] = useState<string | null>(null)

  useEffect(() => {
    // 구글 리다이렉트 결과 처리 (GitHub Pages 대응)
    processRedirectResult().catch(err => {
      if (err instanceof Error && err.message === 'ACCESS_DENIED') {
        setRedirectError('ACCESS_DENIED')
      }
    })

    const unsubscribe = onAuthStateChanged(auth, firebaseUser => {
      setUser(firebaseUser)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      redirectError,
      clearRedirectError: () => setRedirectError(null),
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
