import { Routes, Route, Navigate } from 'react-router-dom'
import RoomEnter from './pages/RoomEnter'
import GameLobby from './pages/GameLobby'
import GamePlay from './pages/GamePlay'
import RoundResult from './pages/RoundResult'
import FinalResult from './pages/FinalResult'

export default function StockGame() {
  return (
    <Routes>
      {/* /game/stock-boardgame */}
      <Route index element={<RoomEnter />} />

      {/* /game/stock-boardgame/room/:roomId */}
      <Route path="room/:roomId" element={<GameLobby />} />

      {/* /game/stock-boardgame/room/:roomId/play */}
      <Route path="room/:roomId/play" element={<GamePlay />} />

      {/* /game/stock-boardgame/room/:roomId/result */}
      <Route path="room/:roomId/result" element={<RoundResult />} />

      {/* /game/stock-boardgame/room/:roomId/final */}
      <Route path="room/:roomId/final" element={<FinalResult />} />

      <Route path="*" element={<Navigate to="/game/stock-boardgame" replace />} />
    </Routes>
  )
}
