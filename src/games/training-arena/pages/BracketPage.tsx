import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, MatchResult, GroupResult } from '../types'
import charactersRaw from '../data/characters.json'
import skillsRaw    from '../data/skills.json'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const characters = charactersRaw as CharacterDef[]
const charName = (id: number) => characters.find(c => c.id === id)?.name ?? `#${id}`
const skillName = (id: string) => (skillsRaw as Array<{ id: string; name: string }>).find(s => s.id === id)?.name ?? id

const ROUND_LABELS = ['16강', '8강', '4강', '결승']
type TabKey = 'qualifier' | 'group' | 'bracket'

// ─── MatchCard ────────────────────────────────────────────────────────────────

interface MatchCardProps { match: MatchResult; pid: number; winRate: (id: number) => number; hideResult?: boolean; getTooltip: (id: number) => string }

function MatchCard({ match, pid, winRate, hideResult, getTooltip }: MatchCardProps) {
  const isPlayerMatch = match.char1Id === pid || match.char2Id === pid
  const ids = [match.char1Id, match.char2Id]
  return (
    <div style={{
      background: isPlayerMatch ? 'rgba(124,80,240,.12)' : 'rgba(20,14,40,.8)',
      border: `1px solid ${isPlayerMatch ? 'rgba(164,120,255,.6)' : 'var(--line)'}`,
      boxShadow: isPlayerMatch ? '0 0 16px -4px rgba(164,120,255,.4)' : 'none',
      borderRadius: 10, padding: '8px 10px',
      display: 'flex', flexDirection: 'column' as const, gap: 5,
    }}>
      {ids.map(id => {
        const isWinner = hideResult ? false : id === match.winnerId
        const isPlayer = id === pid
        const wr = winRate(id)
        return (
          <div key={id} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '3px 5px', borderRadius: 6,
            background: isPlayer ? 'rgba(124,80,240,.2)' : 'transparent',
            opacity: hideResult ? 1 : (isWinner ? 1 : 0.5),
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
              background: isPlayer ? 'var(--violet-glow)' : 'var(--ink-dim)',
            }} />
            <span
              title={getTooltip(id)}
              style={{
                flex: 1, fontSize: 11, fontWeight: isWinner ? 700 : 400,
                color: isPlayer ? 'var(--violet-glow)' : isWinner ? 'var(--ink)' : 'var(--ink-mute)',
                overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis',
                cursor: 'help',
              }}>{charName(id)}</span>
            <span style={{ fontSize: 9, color: 'var(--ink-dim)', flexShrink: 0 }}>{wr}%</span>
            {isWinner && !hideResult && (
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 4,
                background: 'rgba(94,240,168,.15)', color: 'var(--green)', flexShrink: 0,
              }}>승</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── GroupCard ────────────────────────────────────────────────────────────────

interface GroupCardProps { group: GroupResult; pid: number; featured?: boolean; getTooltip: (id: number) => string }

function GroupCard({ group, pid, featured, getTooltip }: GroupCardProps) {
  const rankBadge = (id: number) => {
    if (id === group.rank1) return { label: '1위', color: 'var(--green)', bg: 'rgba(94,240,168,.12)' }
    if (id === group.rank2) return { label: '2위', color: '#67e8f9', bg: 'rgba(103,232,249,.12)' }
    return { label: '탈락', color: 'var(--red)', bg: 'rgba(255,92,110,.08)' }
  }

  return (
    <div style={{
      background: featured ? 'rgba(124,80,240,.08)' : 'rgba(20,14,40,.8)',
      border: `1px solid ${featured ? 'rgba(164,120,255,.5)' : 'var(--line)'}`,
      boxShadow: featured ? '0 0 20px -6px rgba(164,120,255,.3)' : 'none',
      borderRadius: 12, padding: featured ? '16px 20px' : '12px 14px',
    }}>
      <div style={{
        fontSize: featured ? 14 : 11, fontWeight: 700,
        color: featured ? 'var(--violet-glow)' : 'var(--ink-mute)',
        letterSpacing: '.1em', marginBottom: featured ? 12 : 8,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        {featured && (
          <span style={{ fontSize: 10, color: 'var(--violet)', background: 'rgba(124,80,240,.2)', padding: '2px 8px', borderRadius: 999 }}>내 조</span>
        )}
        GROUP {group.groupId}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: featured ? 8 : 5 }}>
        {group.players.map(id => {
          const badge = rankBadge(id)
          const isPlayer = id === pid
          const isElim = group.eliminated.includes(id)
          return (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: featured ? '8px 10px' : '4px 6px',
              background: isPlayer ? 'rgba(124,80,240,.2)' : isElim ? 'transparent' : badge.bg,
              border: isPlayer ? '1px solid rgba(164,120,255,.4)' : '1px solid transparent',
              borderRadius: 8, opacity: isElim && !isPlayer ? 0.5 : 1,
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: isPlayer ? 'var(--violet-glow)' : isElim ? 'var(--ink-dim)' : badge.color,
              }} />
              <span
                title={getTooltip(id)}
                style={{
                  flex: 1, fontSize: featured ? 13 : 11, fontWeight: isPlayer ? 700 : 400,
                  color: isPlayer ? 'var(--violet-glow)' : isElim ? 'var(--ink-mute)' : 'var(--ink)',
                  overflow: 'hidden', whiteSpace: 'nowrap' as const, textOverflow: 'ellipsis',
                  cursor: 'help',
                }}>{charName(id)}</span>
              <span style={{
                fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4, flexShrink: 0,
                color: badge.color, background: badge.bg, border: `1px solid ${badge.color}33`,
              }}>{badge.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── BracketPage ──────────────────────────────────────────────────────────────

export default function BracketPage() {
  const { lastTournament, activeSlot, playerMatches, playerMatchIndex } = useGameStore()
  const [activeTab, setActiveTab] = useState<TabKey>('bracket')

  if (!lastTournament || !activeSlot) return null

  const pid      = activeSlot.characterId
  const npcStats = activeSlot.npcStats ?? {}
  const allMatches = lastTournament.allMatches

  const winRate = (id: number): number => {
    if (id === pid) {
      const total = playerMatches.length
      return total > 0 ? Math.round(playerMatches.filter(m => m.playerWon).length / total * 100) : 0
    }
    const stat = npcStats[id]
    if (!stat) return 0
    const total = stat.totalWins + stat.totalLosses
    return total > 0 ? Math.round(stat.totalWins / total * 100) : 0
  }

  // 실제 플레이한 경기 결과 맵 (matchId → 재시뮬레이션 결과)
  // startBattleForCurrentMatch가 matchId를 보존하므로 pre-run matchId로 조회 가능
  const playedResultMap = new Map(
    playerMatches.filter(m => m.wasPlayed).map(m => [m.matchResult.matchId, m.matchResult])
  )

  // playerMatchIndex 이전까지 진행한 경기의 matchId 집합 (스포일러 방지)
  const doneMatchIds = new Set(
    playerMatches.slice(0, playerMatchIndex).map(m => m.matchResult.matchId)
  )

  // 플레이어가 탈락했으면 우승자 공개
  const lastMatch = playerMatches.length > 0 ? playerMatches.at(-1) : undefined
  const playerEliminated = lastMatch?.wasPlayed === true && lastMatch?.playerWon === false
  const inProgress = playerMatches.length > 0 && !playerEliminated

  // Bracket matches — stage filter with slice fallback
  const stageBracket = allMatches.filter(m => m.stage === 'bracket')
  const bm = stageBracket.length >= 15 ? stageBracket : allMatches.slice(-15)

  const getRound = (r: number, start: number, end: number): MatchResult[] => {
    const byRound = bm.filter(m => m.bracketRound === r)
    return byRound.length > 0 ? byRound : bm.slice(start, end)
  }
  const rounds: MatchResult[][] = [
    getRound(1, 0, 8),
    getRound(2, 8, 12),
    getRound(3, 12, 14),
    getRound(4, 14, 15),
  ]

  const pbMatches     = bm.filter(m => m.char1Id === pid || m.char2Id === pid)
  const pbDoneMatches = pbMatches.filter(m => doneMatchIds.has(m.matchId))
  const pbWins        = pbDoneMatches.filter(m => m.winnerId === pid).length
  const pbLosses      = pbDoneMatches.filter(m => m.loserId  === pid).length

  const myGroup     = lastTournament.groups.find(g => g.players.includes(pid))
  const otherGroups = lastTournament.groups.filter(g => g.groupId !== myGroup?.groupId)
  const winner      = lastTournament.winner

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'qualifier', label: '✓ 예선' },
    { key: 'group',     label: '✓ 본선' },
    { key: 'bracket',   label: '● 토너먼트' },
  ]

  function buildTooltip(id: number): string {
    const name = charName(id)
    const isPlayer = id === pid

    // 누적 전적
    const stat = npcStats[id]
    const cumRecord = stat
      ? `누적 ${stat.totalWins}승 ${stat.totalLosses}패 · 최고 ${stat.bestStage}`
      : isPlayer
        ? `누적 ${activeSlot!.totalWins ?? 0}승 ${activeSlot!.totalLosses ?? 0}패`
        : '전적 없음'

    // 이번 토너먼트 전적
    const tourMatches = allMatches.filter(m => m.char1Id === id || m.char2Id === id)
    const tourWins    = tourMatches.filter(m => m.winnerId === id).length
    const tourLosses  = tourMatches.filter(m => m.loserId  === id).length
    const tourRecord  = tourMatches.length > 0 ? `이번 대회 ${tourWins}승 ${tourLosses}패` : ''

    // 스킬 목록
    let skills: string[]
    if (isPlayer) {
      skills = [...activeSlot!.initialSkills, ...activeSlot!.acquiredSkills]
    } else {
      const ref = tourMatches[0]
      if (ref) {
        skills = ref.char1Id === id ? (ref.char1Skills ?? []) : (ref.char2Skills ?? [])
      } else {
        skills = []
      }
    }
    const skillLine = skills.length > 0
      ? `스킬: ${skills.map(s => skillName(s)).join(', ')}`
      : ''

    return [name, cumRecord, tourRecord, skillLine].filter(Boolean).join('\n')
  }

  return (
    <div className="arena-bg-arena" style={{ display: 'flex', flexDirection: 'column' as const, minHeight: '100vh' }}>
      <HeaderBar
        subtitle="TOURNAMENT BRACKET"
        round={activeSlot.currentRound}
        phase={`대진표 · ${charName(pid)}`}
      />

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'rgba(10,6,20,.6)', backdropFilter: 'blur(8px)' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              fontSize: 12, fontWeight: 600, padding: '6px 16px', borderRadius: 20,
              border: `1px solid ${activeTab === t.key ? 'rgba(164,120,255,.6)' : 'var(--line)'}`,
              background: activeTab === t.key ? 'rgba(124,80,240,.2)' : 'transparent',
              color: activeTab === t.key ? 'var(--violet-glow)' : 'var(--ink-mute)',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto' as const, padding: '20px 16px' }}>

        {/* ── 예선 탭 ── */}
        {activeTab === 'qualifier' && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>
              전체 {lastTournament.participants.length}명 참가 · {lastTournament.qualifiers.length}명 본선 진출
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 6 }}>
              {lastTournament.participants.map(id => {
                const qualified = lastTournament.qualifiers.includes(id)
                const isPlayer  = id === pid
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', borderRadius: 8,
                    background: isPlayer ? 'rgba(124,80,240,.2)' : 'rgba(255,255,255,.03)',
                    border: `1px solid ${isPlayer ? 'rgba(164,120,255,.5)' : qualified ? 'rgba(94,240,168,.2)' : 'rgba(255,92,110,.15)'}`,
                    opacity: qualified ? 1 : 0.55,
                  }}>
                    <span
                      title={buildTooltip(id)}
                      style={{
                        fontSize: 12, fontWeight: isPlayer ? 700 : 400,
                        color: isPlayer ? 'var(--violet-glow)' : qualified ? 'var(--ink)' : 'var(--ink-mute)',
                        cursor: 'help',
                      }}>{charName(id)}</span>
                    <span style={{
                      fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 4,
                      color: qualified ? 'var(--green)' : 'var(--red)',
                      background: qualified ? 'rgba(94,240,168,.12)' : 'rgba(255,92,110,.1)',
                    }}>{qualified ? '진출' : '탈락'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── 본선 탭 ── */}
        {activeTab === 'group' && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 16 }}>
            {myGroup && <GroupCard group={myGroup} pid={pid} featured getTooltip={buildTooltip} />}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {otherGroups.map(g => (
                <GroupCard key={g.groupId} group={g} pid={pid} getTooltip={buildTooltip} />
              ))}
            </div>
          </div>
        )}

        {/* ── 토너먼트 탭 ── */}
        {activeTab === 'bracket' && (
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 12 }}>
            {pbMatches.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--ink-mute)' }}>
                내 성적:&nbsp;
                <span style={{ fontWeight: 700, color: 'var(--green)' }}>{pbWins}승</span>
                <span style={{ margin: '0 4px', color: 'var(--ink-dim)' }}>·</span>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>{pbLosses}패</span>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto' as const }}>
              {rounds.map((roundMatches, ri) => (
                <div key={ri} style={{ display: 'flex', flexDirection: 'column' as const, flex: '1 1 0', gap: 6, minWidth: 130 }}>
                  <div style={{ textAlign: 'center' as const, fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.1em', padding: '4px 0', borderBottom: '1px solid var(--line)' }}>
                    {ROUND_LABELS[ri]}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' as const, flex: 1, gap: 6, justifyContent: ri === 3 ? 'center' : 'space-evenly' }}>
                    {roundMatches.map((m, mi) => {
                      const isPlayerMatch = m.char1Id === pid || m.char2Id === pid
                      const actualMatch   = isPlayerMatch ? (playedResultMap.get(m.matchId) ?? m) : m
                      return (
                        <MatchCard
                          key={mi}
                          match={actualMatch}
                          pid={pid}
                          winRate={winRate}
                          hideResult={isPlayerMatch && !doneMatchIds.has(m.matchId)}
                          getTooltip={buildTooltip}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* 우승 */}
              <div style={{ display: 'flex', flexDirection: 'column' as const, flex: '1 1 0', gap: 6, minWidth: 130 }}>
                <div style={{ textAlign: 'center' as const, fontSize: 10, fontWeight: 700, color: 'var(--gold)', letterSpacing: '.1em', padding: '4px 0', borderBottom: '1px solid rgba(255,214,107,.3)' }}>
                  우승
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{
                    background: 'rgba(255,214,107,.08)',
                    border: `1px solid ${!inProgress && winner === pid ? 'rgba(164,120,255,.6)' : 'rgba(255,214,107,.5)'}`,
                    borderRadius: 12, padding: '14px 16px',
                    display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 6,
                  }}>
                    <span style={{ fontSize: 20 }}>👑</span>
                    {inProgress ? (
                      <span style={{ fontSize: 11, color: 'var(--ink-dim)' }}>?</span>
                    ) : (
                      <>
                        <span style={{ fontSize: 13, fontWeight: 700, color: winner === pid ? 'var(--violet-glow)' : 'var(--gold)' }}>
                          {charName(winner)}
                        </span>
                        {winner === pid && (
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--violet-glow)', background: 'rgba(124,80,240,.2)', padding: '2px 8px', borderRadius: 999 }}>나</span>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--line)', background: 'rgba(10,6,20,.7)', display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button className="arena-btn" onClick={() => useGameStore.setState({ phase: 'replay' })}>
          📋 전적 보기
        </button>
        <button className="arena-btn arena-btn-primary" onClick={() => useGameStore.setState({ phase: 'reward' })}>
          보상 받기 →
        </button>
      </div>
    </div>
  )
}
