import { useGameStore } from './store/useGameStore'
import SlotSelectPage    from './pages/SlotSelectPage'
import CharSelectPage    from './pages/CharSelectPage'
import StatAllocPage     from './pages/StatAllocPage'
import GachaPage         from './pages/GachaPage'
import MatchPreviewPage  from './pages/MatchPreviewPage'
import BattlePage        from './pages/BattlePage'
import MatchResultPage   from './pages/MatchResultPage'
import TournamentPage    from './pages/TournamentPage'
import BracketPage       from './pages/BracketPage'
import EncyclopediaPage  from './pages/EncyclopediaPage'
import RankingPage       from './pages/RankingPage'
import RewardPage        from './pages/RewardPage'
import SkillSelectPage   from './pages/SkillSelectPage'
import ReplayPage        from './pages/ReplayPage'
import SimulationPage    from './pages/SimulationPage'

const GAMEPLAY_PHASES = new Set([
  'char_select', 'stat_alloc', 'gacha', 'match_preview',
  'battle', 'match_result', 'tournament', 'bracket',
  'reward', 'skill_select', 'replay',
])

function ExitButton() {
  function handleExit() {
    if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) {
      useGameStore.setState({ phase: 'slot_select' })
    }
  }
  return (
    <button
      onClick={handleExit}
      style={{
        position: 'fixed', top: '10px', right: '12px', zIndex: 9999,
        background: 'rgba(20,20,40,0.85)', border: '1px solid #444',
        borderRadius: '6px', color: '#888', padding: '4px 10px',
        cursor: 'pointer', fontSize: '0.75rem', backdropFilter: 'blur(4px)',
      }}
    >
      ✕ 나가기
    </button>
  )
}

export default function TrainingArenaGame() {
  const phase = useGameStore(s => s.phase)

  switch (phase) {
    case 'slot_select':   return <SlotSelectPage />
    case 'encyclopedia':  return <EncyclopediaPage />
    case 'ranking':       return <RankingPage />
    case 'simulation':    return <SimulationPage />
    default: return (
      <>
        {GAMEPLAY_PHASES.has(phase) && <ExitButton />}
        {phase === 'char_select'   && <CharSelectPage />}
        {phase === 'stat_alloc'    && <StatAllocPage />}
        {phase === 'gacha'         && <GachaPage />}
        {phase === 'match_preview' && <MatchPreviewPage />}
        {phase === 'battle'        && <BattlePage />}
        {phase === 'match_result'  && <MatchResultPage />}
        {phase === 'tournament'    && <TournamentPage />}
        {phase === 'bracket'       && <BracketPage />}
        {phase === 'reward'        && <RewardPage />}
        {phase === 'skill_select'  && <SkillSelectPage />}
        {phase === 'replay'        && <ReplayPage />}
      </>
    )
  }
}
