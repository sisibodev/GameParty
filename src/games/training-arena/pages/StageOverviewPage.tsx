import { useGameStore } from '../store/useGameStore'
import type { CharacterDef, GroupResult } from '../types'
import charactersRaw from '../data/characters.json'
import '../styles/arena.css'

const CHARACTERS = charactersRaw as CharacterDef[]
const charName = (id: number) => CHARACTERS.find(c => c.id === id)?.name ?? `#${id}`

function stageMeta(stageLabel: string): { title: string; sub: string; color: string } {
  if (stageLabel.startsWith('예선'))
    return { title: '예선전', sub: '본선 진출을 위한 예선 경기', color: 'var(--ink-dim)' }
  if (stageLabel.startsWith('본선'))
    return { title: '본선 조별리그', sub: '조별 리그전 — 상위 2명이 토너먼트 진출', color: 'var(--violet-glow)' }
  return { title: '토너먼트', sub: '본선 진출자 16명의 토너먼트', color: 'var(--gold)' }
}

function GroupCard({ g, pid }: { g: GroupResult; pid: number }) {
  const isMyGroup = g.players.includes(pid)
  return (
    <div style={{
      background: 'rgba(26,19,48,.8)',
      border: `1px solid ${isMyGroup ? 'rgba(164,120,255,.6)' : 'var(--line)'}`,
      borderRadius: 8,
      padding: '8px 10px',
      fontSize: 11,
      minWidth: 110,
    }}>
      <div style={{ fontWeight: 700, color: isMyGroup ? 'var(--violet-glow)' : 'var(--ink-dim)', marginBottom: 4 }}>
        {g.groupId}조
      </div>
      {g.players.map(id => (
        <div key={id} style={{ color: id === pid ? 'var(--gold)' : 'var(--ink-base)', marginBottom: 1 }}>
          {id === pid ? '▶ ' : '\u3000'}{charName(id)}
        </div>
      ))}
    </div>
  )
}

function BracketSlot({ id, pid, label }: { id: number; pid: number; label?: string }) {
  return (
    <div style={{
      background: id === pid ? 'rgba(164,120,255,.15)' : 'rgba(26,19,48,.6)',
      border: `1px solid ${id === pid ? 'rgba(164,120,255,.6)' : 'var(--line)'}`,
      borderRadius: 6,
      padding: '4px 8px',
      fontSize: 11,
      color: id === pid ? 'var(--gold)' : 'var(--ink-dim)',
      whiteSpace: 'nowrap',
    }}>
      {label && <span style={{ color: 'var(--ink-mute)', marginRight: 4 }}>{label}</span>}
      {charName(id)}
    </div>
  )
}

export default function StageOverviewPage() {
  const playerMatches    = useGameStore(s => s.playerMatches)
  const playerMatchIndex = useGameStore(s => s.playerMatchIndex)
  const lastTournament   = useGameStore(s => s.lastTournament)
  const activeSlot       = useGameStore(s => s.activeSlot)

  const match = playerMatches[playerMatchIndex]
  const pid = activeSlot?.characterId ?? 0
  const label = match?.stageLabel ?? ''
  const { title, sub, color } = stageMeta(label)

  const isBracket = label !== '' && !label.startsWith('예선') && !label.startsWith('본선')

  function proceed() {
    useGameStore.setState({ phase: 'match_preview' })
  }

  return (
    <div className="arena-page" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, padding: '24px 16px' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--ink-mute)', letterSpacing: 2, marginBottom: 6 }}>
          현재 단계
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: 1 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', marginTop: 4 }}>{sub}</div>
        {match && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--ink-base)' }}>
            다음 경기: <span style={{ color: 'var(--violet-glow)', fontWeight: 700 }}>{label}</span>
          </div>
        )}
      </div>

      {/* 본선 조별 대진표 */}
      {lastTournament && label.startsWith('본선') && (
        <div style={{ width: '100%', maxWidth: 560 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 8, textAlign: 'center' }}>
            조별 대진표
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {lastTournament.groups.map(g => (
              <GroupCard key={g.groupId} g={g} pid={pid} />
            ))}
          </div>
        </div>
      )}

      {/* 토너먼트 16강 진출자 */}
      {lastTournament && isBracket && (
        <div style={{ width: '100%', maxWidth: 520 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginBottom: 8, textAlign: 'center' }}>
            토너먼트 진출자 (16명)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lastTournament.finalists.map((id, i) => (
              <BracketSlot key={id} id={id} pid={pid} label={`${i + 1}.`} />
            ))}
          </div>
        </div>
      )}

      {/* 예선전 참가자 수 */}
      {label.startsWith('예선') && lastTournament && (
        <div style={{ fontSize: 12, color: 'var(--ink-dim)', textAlign: 'center' }}>
          참가자 {lastTournament.participants.length}명 중 32명이 본선 진출합니다
        </div>
      )}

      <button className="arena-btn arena-btn--primary" onClick={proceed} style={{ marginTop: 8, minWidth: 160 }}>
        전투 준비 →
      </button>
    </div>
  )
}
