import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, GrowthStats, MatchResult, TournamentResult } from '../types'
import { runTournament } from '../engine/tournamentEngine'
import { SeededRng } from '../utils/rng'
import { pickN } from '../utils/fisherYates'
import { NPC_BASE_GROWTH, INITIAL_SKILL_COUNT } from '../constants'
import charactersRaw from '../data/characters.json'
import skillsRaw from '../data/skills.json'

const characters  = (charactersRaw as CharacterDef[]).filter(c => c.ipId == null)
const allSkillIds = (skillsRaw as Array<{ id: string }>).map(s => s.id)
const charName    = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`

const ROUND_LABELS = ['16강', '8강', '4강', '결승']
const ARCHETYPE_COLOR: Record<string, string> = {
  tank: '#4a7fc1', berserker: '#c14a4a', assassin: '#7c5cfc',
  ranger: '#4ac17c', mage: '#c14ab0', paladin: '#c1a04a',
  warrior: '#c1714a', support: '#4ab0c1',
}

function buildMaps(round: number) {
  const base = NPC_BASE_GROWTH + (round - 1)
  const growth: GrowthStats = { hp: base, str: base, agi: base, int: base, luk: base }
  const growthMap: Record<number, GrowthStats> = {}
  const skillMap: Record<number, string[]>     = {}
  for (const c of characters) {
    growthMap[c.id] = growth
    skillMap[c.id]  = pickN(allSkillIds, INITIAL_SKILL_COUNT, new SeededRng(c.id * 1000 + round))
  }
  return { growthMap, skillMap }
}

// ─── Bracket ──────────────────────────────────────────────────────────────────

function SimBracket({ result }: { result: TournamentResult }) {
  const bm = result.allMatches.slice(-15)
  const rounds: MatchResult[][] = [
    bm.slice(0, 8), bm.slice(8, 12), bm.slice(12, 14), bm.slice(14, 15),
  ]

  return (
    <div style={s.bracket}>
      {rounds.map((roundMatches, ri) => (
        <div key={ri} style={s.roundCol}>
          <div style={s.roundLabel}>{ROUND_LABELS[ri]}</div>
          <div style={{ ...s.matchList, justifyContent: ri === 3 ? 'center' : 'space-evenly' }}>
            {roundMatches.map((m, mi) => (
              <div key={mi} style={s.matchCard}>
                {[m.char1Id, m.char2Id].map(id => {
                  const arch  = characters.find(c => c.id === id)?.archetype ?? ''
                  const color = ARCHETYPE_COLOR[arch] ?? '#888'
                  return (
                    <div key={id} style={{ ...s.combatant, color: id === m.winnerId ? '#e8e8ff' : '#444', fontWeight: id === m.winnerId ? 700 : 400 }}>
                      {id === m.winnerId && <span style={{ ...s.dot, background: color }} />}
                      {charName(id)}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={s.roundCol}>
        <div style={s.roundLabel}>우승</div>
        <div style={{ ...s.matchList, justifyContent: 'center' }}>
          <div style={s.winnerCard}>
            🏆
            <span style={s.winnerName}>{charName(result.winner)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function SimStats({ result }: { result: TournamentResult }) {
  const winChar = characters.find(c => c.id === result.winner)
  const archColor = ARCHETYPE_COLOR[winChar?.archetype ?? ''] ?? '#888'

  const top4Ids = [
    result.winner,
    ...Object.entries(result.bracketEliminations)
      .filter(([, r]) => r >= 3)
      .map(([id]) => Number(id))
      .filter(id => id !== result.winner),
  ]

  return (
    <div style={s.statsBox}>
      <div style={s.statGrid}>
        {[
          ['총 경기', `${result.allMatches.length}`],
          ['예선 통과', `${result.qualifiers.length}명`],
          ['본선 진출', `${result.finalists.length}명`],
          ['다크호스', `${result.darkhorses.length}명`],
        ].map(([label, val]) => (
          <div key={label} style={s.statCell}>
            <span style={s.statLabel}>{label}</span>
            <span style={s.statVal}>{val}</span>
          </div>
        ))}
      </div>

      <div style={s.winnerRow}>
        <span style={{ ...s.archChip, background: archColor + '33', color: archColor }}>
          {winChar?.archetype}
        </span>
        <span style={s.winnerLabel}>🏆 {charName(result.winner)}</span>
      </div>

      {top4Ids.length > 1 && (
        <div style={s.top4Row}>
          <span style={s.top4Title}>4강</span>
          {top4Ids.map(id => (
            <span key={id} style={{ ...s.top4Name, color: id === result.winner ? '#ffd700' : '#aaa' }}>
              {charName(id)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Stage = 'idle' | 'running' | 'done' | 'error'

export default function SimulationPage() {
  const [round, setRound] = useState(1)
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<TournamentResult | null>(null)
  const [errMsg, setErrMsg] = useState('')

  async function handleStart() {
    setStage('running')
    setResult(null)
    setErrMsg('')
    await new Promise(r => setTimeout(r, 100))
    try {
      const seed = Date.now()
      const { growthMap, skillMap } = buildMaps(round)
      const r = runTournament(characters, growthMap, skillMap, seed, round)
      setResult(r)
      setStage('done')
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e))
      setStage('error')
    }
  }

  return (
    <div style={s.root}>
      <div style={s.topBar}>
        <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
          ← 메인으로
        </button>
        <h2 style={s.title}>시뮬레이션</h2>
        <div style={s.roundPicker}>
          <span style={s.roundPickerLabel}>R</span>
          <input
            type="number"
            min={1}
            max={50}
            value={round}
            onChange={e => setRound(Math.max(1, Math.min(50, Number(e.target.value))))}
            style={s.roundInput}
          />
        </div>
      </div>

      {stage === 'idle' && (
        <div style={s.idleBody}>
          <p style={s.hint}>
            전체 {characters.length}명이 참가하는 AI 자동 토너먼트.<br />
            라운드가 높을수록 전원 스탯이 올라갑니다 (R당 +1).
          </p>
          <button style={s.btnStart} onClick={handleStart}>
            ▶ 시뮬레이션 시작
          </button>
        </div>
      )}

      {stage === 'running' && (
        <div style={s.running}>
          <div style={s.spinner} />
          <p>시뮬레이션 진행 중…</p>
        </div>
      )}

      {stage === 'error' && (
        <div style={s.idleBody}>
          <p style={{ color: '#ff5555', fontSize: '0.85rem' }}>오류: {errMsg}</p>
          <button style={s.btnStart} onClick={handleStart}>↺ 다시 시도</button>
        </div>
      )}

      {stage === 'done' && result && (
        <>
          <SimStats result={result} />
          <h3 style={s.sectionTitle}>토너먼트 대진표</h3>
          <SimBracket result={result} />
          <div style={s.bottomBtns}>
            <button style={s.btnRetry} onClick={handleStart}>↺ 다시 하기</button>
            <button style={s.btnBack} onClick={() => useGameStore.setState({ phase: 'slot_select' })}>
              ← 메인으로
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:            { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', padding: '1rem 1.25rem', gap: '1rem' },
  topBar:          { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  title:           { fontSize: '1.2rem', fontWeight: 700, color: '#c0aaff', margin: 0, flex: 1, textAlign: 'center' },
  btnBack:         { background: 'transparent', border: '1px solid #333', borderRadius: '6px', color: '#aaa', padding: '0.35rem 0.7rem', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' },
  roundPicker:     { display: 'flex', alignItems: 'center', gap: '4px' },
  roundPickerLabel:{ fontSize: '0.75rem', color: '#888' },
  roundInput:      { width: '48px', background: '#1a1a2e', border: '1px solid #444', borderRadius: '4px', color: '#c0aaff', padding: '3px 6px', fontSize: '0.85rem', textAlign: 'center' },

  idleBody:        { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', marginTop: '3rem' },
  hint:            { color: '#777', fontSize: '0.85rem', textAlign: 'center', lineHeight: 1.7, margin: 0 },
  btnStart:        { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '10px', color: '#fff', padding: '0.9rem 3rem', cursor: 'pointer', fontSize: '1.1rem', fontWeight: 700 },

  running:         { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginTop: '4rem', color: '#888' },
  spinner:         { width: '40px', height: '40px', border: '4px solid #333', borderTopColor: '#7c5cfc', borderRadius: '50%' },

  statsBox:        { background: '#14142a', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '1rem' },
  statGrid:        { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' },
  statCell:        { background: '#0d0d1a', borderRadius: '6px', padding: '0.4rem 0.6rem', display: 'flex', flexDirection: 'column', gap: '2px' },
  statLabel:       { fontSize: '0.65rem', color: '#555', fontWeight: 700 },
  statVal:         { fontSize: '0.9rem', color: '#aaa', fontWeight: 600 },
  winnerRow:       { display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' },
  winnerLabel:     { fontSize: '1.1rem', fontWeight: 700, color: '#ffd700' },
  archChip:        { fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', border: '1px solid transparent' },
  top4Row:         { display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' },
  top4Title:       { fontSize: '0.7rem', color: '#666', fontWeight: 700 },
  top4Name:        { fontSize: '0.75rem', background: '#1a1a2e', borderRadius: '4px', padding: '2px 7px' },

  sectionTitle:    { fontSize: '0.8rem', color: '#666', letterSpacing: '0.08em', margin: 0 },
  bracket:         { display: 'flex', gap: '0.4rem', overflowX: 'auto', width: '100%', paddingBottom: '0.5rem' },
  roundCol:        { display: 'flex', flexDirection: 'column', minWidth: '100px', flex: '1 1 0', gap: '0.35rem' },
  roundLabel:      { textAlign: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#666', padding: '3px 0', borderBottom: '1px solid #1e1e30' },
  matchList:       { display: 'flex', flexDirection: 'column', flex: 1, gap: '0.3rem' },
  matchCard:       { background: '#0d0d1a', border: '1px solid #1e1e30', borderRadius: '5px', padding: '4px 6px', display: 'flex', flexDirection: 'column', gap: '2px' },
  combatant:       { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.68rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  dot:             { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 },
  winnerCard:      { background: '#1a1400', border: '1px solid #ffd700', borderRadius: '8px', padding: '0.6rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#ffd700', fontSize: '0.8rem', fontWeight: 700 },
  winnerName:      { color: '#ffd700', fontWeight: 700, fontSize: '0.78rem', textAlign: 'center' },

  bottomBtns:      { display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '0.5rem' },
  btnRetry:        { background: '#1a2a3e', border: '1px solid #44aaff', borderRadius: '8px', color: '#44aaff', padding: '0.65rem 1.75rem', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 700 },
}
