import { Navigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <span style={{ color: 'var(--color-text-muted)' }}>로딩 중...</span>
    </div>
  )
}

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (!isAdmin && !import.meta.env.DEV) return <Navigate to="/" replace />
  return <>{children}</>
}
