import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { startGoogleSignIn } from '../firebase/auth'
import { useAuth } from '../contexts/AuthContext'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { user, loading, redirectError, clearRedirectError } = useAuth()
  const navigate = useNavigate()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 이미 로그인된 경우 로비로 이동
  useEffect(() => {
    if (!loading && user) navigate('/', { replace: true })
  }, [loading, user, navigate])

  // 리다이렉트 후 접근 거부 에러 처리
  useEffect(() => {
    if (redirectError === 'ACCESS_DENIED') {
      setError('접근이 허용되지 않은 계정입니다.\n플랫폼 운영자에게 문의하세요.')
      clearRedirectError()
    }
  }, [redirectError, clearRedirectError])

  async function handleGoogleLogin() {
    setIsSigningIn(true)
    setError(null)
    try {
      await startGoogleSignIn()
      // 리다이렉트 되므로 이후 코드는 실행 안 됨
    } catch {
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      setIsSigningIn(false)
    }
  }

  if (loading) return null

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>🎮</div>
        <h1 className={styles.title}>게임 플랫폼</h1>
        <p className={styles.subtitle}>허용된 사용자만 접근 가능합니다</p>

        {error && (
          <div className={styles.errorBox}>
            {error.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        )}

        <button
          className={styles.googleButton}
          onClick={handleGoogleLogin}
          disabled={isSigningIn || loading}
        >
          <GoogleIcon />
          {isSigningIn ? '로그인 중...' : 'Google 계정으로 로그인'}
        </button>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.6 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.1 6.8 29.3 4.8 24 4.8 12.4 4.8 3 14.2 3 25.8S12.4 46.8 24 46.8c11 0 20.4-8 21.8-18.7.1-.9.2-1.9.2-2.9 0-1.7-.2-3.3-.4-5z"/>
      <path fill="#FF3D00" d="M6.3 15.8l6.6 4.8C14.6 16.9 19 14 24 14c3.1 0 5.8 1.1 7.9 2.9l5.7-5.7C34.1 8.1 29.3 6 24 6 16.3 6 9.6 10 6.3 15.8z"/>
      <path fill="#4CAF50" d="M24 46c5.2 0 9.9-1.9 13.4-5.1l-6.2-5.2C29.3 37.5 26.8 38.5 24 38.5c-5.2 0-9.6-3.3-11.3-8L6 35.8C9.5 42 16.2 46 24 46z"/>
      <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.5l6.2 5.2C41 35.4 45 30.2 45 24c0-1.4-.2-2.7-.4-3.9z"/>
    </svg>
  )
}
