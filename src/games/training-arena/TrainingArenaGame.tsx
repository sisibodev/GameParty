import { useGameStore } from './store/useGameStore'
import SlotSelectPage    from './pages/SlotSelectPage'
import CharSelectPage    from './pages/CharSelectPage'
import GachaPage         from './pages/GachaPage'
import MatchPreviewPage  from './pages/MatchPreviewPage'
import BattlePage        from './pages/BattlePage'
import MatchResultPage   from './pages/MatchResultPage'
import TournamentPage    from './pages/TournamentPage'
import BracketPage       from './pages/BracketPage'
import EncyclopediaPage  from './pages/EncyclopediaPage'
import RankingPage       from './pages/RankingPage'
import RewardPage        from './pages/RewardPage'
import SkillLearnPage    from './pages/SkillLearnPage'
import ShopPage          from './pages/ShopPage'
import StageOverviewPage from './pages/StageOverviewPage'
import ReplayPage        from './pages/ReplayPage'
import SimulationPage    from './pages/SimulationPage'
import MyRecordsPage     from './pages/MyRecordsPage'
import PassiveRewardPage from './pages/PassiveRewardPage'
import SkillEnhancePage  from './pages/SkillEnhancePage'

export default function TrainingArenaGame() {
  const phase = useGameStore(s => s.phase)

  switch (phase) {
    case 'slot_select':   return <SlotSelectPage />
    case 'encyclopedia':  return <EncyclopediaPage />
    case 'ranking':       return <RankingPage />
    case 'simulation':    return <SimulationPage />
    default: return (
      <>
        {phase === 'char_select'   && <CharSelectPage />}
        {phase === 'gacha'         && <GachaPage />}
        {phase === 'stage_overview' && <StageOverviewPage />}
        {phase === 'match_preview' && <MatchPreviewPage />}
        {phase === 'battle'        && <BattlePage />}
        {phase === 'match_result'  && <MatchResultPage />}
        {phase === 'skill_learn'   && <SkillLearnPage />}
        {phase === 'tournament'    && <TournamentPage />}
        {phase === 'bracket'       && <BracketPage />}
        {phase === 'reward'        && <RewardPage />}
        {phase === 'shop'          && <ShopPage />}
        {phase === 'replay'         && <ReplayPage />}
        {phase === 'my_records'     && <MyRecordsPage />}
        {phase === 'passive_reward' && <PassiveRewardPage />}
        {phase === 'skill_enhance'  && <SkillEnhancePage />}
      </>
    )
  }
}
