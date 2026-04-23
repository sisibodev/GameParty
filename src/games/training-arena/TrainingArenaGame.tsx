import { useGameStore } from './store/useGameStore'
import SlotSelectPage  from './pages/SlotSelectPage'
import CharSelectPage  from './pages/CharSelectPage'
import StatAllocPage   from './pages/StatAllocPage'
import GachaPage       from './pages/GachaPage'
import TournamentPage  from './pages/TournamentPage'
import BracketPage       from './pages/BracketPage'
import EncyclopediaPage  from './pages/EncyclopediaPage'
import RankingPage       from './pages/RankingPage'
import RewardPage        from './pages/RewardPage'
import SkillSelectPage from './pages/SkillSelectPage'
import ReplayPage     from './pages/ReplayPage'

export default function TrainingArenaGame() {
  const phase = useGameStore(s => s.phase)

  switch (phase) {
    case 'slot_select':   return <SlotSelectPage />
    case 'encyclopedia':  return <EncyclopediaPage />
    case 'ranking':       return <RankingPage />
    case 'char_select':   return <CharSelectPage />
    case 'stat_alloc':   return <StatAllocPage />
    case 'gacha':        return <GachaPage />
    case 'tournament':   return <TournamentPage />
    case 'bracket':      return <BracketPage />
    case 'reward':       return <RewardPage />
    case 'skill_select': return <SkillSelectPage />
    case 'replay':       return <ReplayPage />
  }
}
