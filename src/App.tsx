import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import LobbyPage from './pages/LobbyPage'
import StockGame from './games/stock/StockGame'
import BaseballUmpireGame from './games/baseball-umpire/BaseballUmpireGame'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <LobbyPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/game/stock-boardgame/*"
            element={
              <ProtectedRoute>
                <StockGame />
              </ProtectedRoute>
            }
          />
          <Route
            path="/game/baseball-umpire/*"
            element={
              <ProtectedRoute>
                <BaseballUmpireGame />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
