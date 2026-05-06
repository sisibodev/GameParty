import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { ProtectedRoute } from './components/common/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import LobbyPage from './pages/LobbyPage'
import StockGame from './games/stock/StockGame'
import BaseballUmpireGame from './games/baseball-umpire/BaseballUmpireGame'
import CopsAndRobbersGame from './games/cops-and-robbers/CopsAndRobbersGame'
import TrainingArenaGame from './games/training-arena/TrainingArenaGame'
import TwoBounceGame from './games/two-bounce/TwoBounceGame'

const IS_DEV = import.meta.env.DEV

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
          {IS_DEV && (
            <>
              <Route
                path="/game/two-bounce/*"
                element={
                  <ProtectedRoute>
                    <TwoBounceGame />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/game/cops-and-robbers/*"
                element={
                  <ProtectedRoute>
                    <CopsAndRobbersGame />
                  </ProtectedRoute>
                }
              />
            </>
          )}
          <Route
            path="/game/training-arena/*"
            element={
              <ProtectedRoute>
                <TrainingArenaGame />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
