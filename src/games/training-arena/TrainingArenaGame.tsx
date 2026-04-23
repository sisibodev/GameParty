import { useGameStore } from './store/useGameStore'
import SlotSelectPage  from './pages/SlotSelectPage'
import CharSelectPage  from './pages/CharSelectPage'
import StatAllocPage   from './pages/StatAllocPage'
import GachaPage       from './pages/GachaPage'
import TournamentPage  from './pages/TournamentPage'
import RewardPage      from './pages/RewardPage'
import SkillSelectPage from './pages/SkillSelectPage'

export default function TrainingArenaGame() {
  const phase = useGameStore(s => s.phase)

  switch (phase) {
    case 'slot_select':  return <SlotSelectPage />
    case 'char_select':  return <CharSelectPage />
    case 'stat_alloc':   return <StatAllocPage />
    case 'gacha':        return <GachaPage />
    case 'tournament':   return <TournamentPage />
    case 'reward':       return <RewardPage />
    case 'skill_select': return <SkillSelectPage />
  }
}
