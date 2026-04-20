import { useState, useEffect } from 'react'
import { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { GameMode, Difficulty, TrajectoryMode, DIFFICULTY_CONFIG } from '../types'
import { fetchTopRankings, RankEntry } from '../utils/firestore'
import { getMyTeam, KBOTeam, KBO_TEAMS } from '../utils/kboTeams'
import TeamSelectModal from '../components/TeamSelectModal'

interface Props {
  onStart: (mode: GameMode, difficulty: Difficulty, trajectoryMode: TrajectoryMode) => void
  onMultiBattle: () => void
  onPitchEditor?: () => void  // 관리자 전용 (undefined이면 버튼 미표시)
  onBack: () => void
  user?: User
}

export default function ModeSelect({ onStart, onMultiBattle, onPitchEditor, onBack, user }: Props) {
  const [step, setStep] = useState<'mode' | 'difficulty'>('mode')
  const [selectedMode, setSelectedMode] = useState<GameMode | null>(null)
  const [myTeam, setMyTeam] = useState<KBOTeam | null>(getMyTeam)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [showRanking, setShowRanking] = useState(false)

  const modes: { id: GameMode; label: string; desc: string; emoji: string }[] = [
    {
      id: 'practice',
      label: '연습 모드',
      desc: '스트라이크존 항상 표시 · 판정 직후 정답 공개 · 기록 저장 안 함',
      emoji: '🎯',
    },
    {
      id: 'normal',
      label: '일반 모드',
      desc: '실전 심판 판정 · 기록 저장 · 랭킹 반영',
      emoji: '⚾',
    },
  ]

  const difficulties: { id: Difficulty; emoji: string }[] = [
    { id: 'rookie',  emoji: '⭐' },
    { id: 'amateur', emoji: '⭐⭐' },
    { id: 'pro',     emoji: '⭐⭐⭐' },
    { id: 'major',   emoji: '⭐⭐⭐⭐' },
  ]

  const handleModeSelect = (mode: GameMode) => {
    setSelectedMode(mode)
    setStep('difficulty')
  }

  const handleDifficultySelect = (diff: Difficulty) => {
    // 물리 시뮬레이션 모드는 숨김 — 베지어 고정으로 바로 시작
    if (selectedMode) onStart(selectedMode, diff, 'bezier')
  }

  const handleBack = () => {
    if (step === 'difficulty') { setStep('mode'); return }
    onBack()
  }

  const backLabel =
    step === 'difficulty' ? '모드 선택' : '로비로'

  return (
    <div style={styles.wrap}>
      <button style={styles.backBtn} onClick={handleBack}>
        ← {backLabel}
      </button>

      {/* 관리자 버튼 (좌하단) */}
      {onPitchEditor && (
        <button
          style={styles.adminBtn}
          onClick={onPitchEditor}
        >
          ⚙️ 관리자
        </button>
      )}

      {/* 우상단 선호구단 선택 버튼 */}
      <button
        style={{
          ...styles.teamBtn,
          borderColor: myTeam ? myTeam.color : 'rgba(255,255,255,0.2)',
          background: myTeam ? `${myTeam.color}22` : 'rgba(255,255,255,0.04)',
        }}
        onClick={() => setShowTeamModal(true)}
      >
        {myTeam ? (
          <>
            <img src={myTeam.logoUrl} alt={myTeam.name} style={{ width: 32, height: 32, objectFit: 'contain' }} />
            <span style={{ fontSize: 10, color: '#ccc', maxWidth: 68, textAlign: 'center', lineHeight: 1.3 }}>
              {myTeam.name}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: 20 }}>⚾</span>
            <span style={{ fontSize: 10, color: '#aaa' }}>구단 선택</span>
          </>
        )}
      </button>

      <div style={styles.title}>⚾ Strike Zone</div>
      <div style={styles.subtitle}>야구 주심 판정 게임</div>

      {step === 'mode' && (
        <>
          <div style={styles.stepLabel}>게임 모드 선택</div>
          <div style={styles.modes}>
            {modes.map(m => (
              <button key={m.id} style={styles.card} onClick={() => handleModeSelect(m.id)}>
                <div style={styles.emoji}>{m.emoji}</div>
                <div style={styles.cardTitle}>{m.label}</div>
                <div style={styles.cardDesc}>{m.desc}</div>
              </button>
            ))}
            <button style={{ ...styles.card, borderColor: 'rgba(255,152,0,0.5)' }} onClick={onMultiBattle}>
              <div style={styles.emoji}>🏆</div>
              <div style={styles.cardTitle}>멀티 배틀</div>
              <div style={styles.cardDesc}>최대 10인 · 같은 투구를 동시에 판정 · 정확도/점수 비교</div>
            </button>
          </div>

          <button style={styles.rankingBtn} onClick={() => setShowRanking(true)}>
            🏆 랭킹 보기
          </button>

          <div style={styles.diffTable}>
            <div style={styles.sectionTitle}>난이도 안내</div>
            <table style={{ borderCollapse: 'collapse', color: '#eee', fontSize: 13, width: '100%' }}>
              <thead>
                <tr style={{ color: '#9ecaf8' }}>
                  {['레벨', '속도', '사용 구종', '보더라인'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {difficulties.map(({ id, emoji }) => {
                  const c = DIFFICULTY_CONFIG[id]
                  return (
                    <tr key={id}>
                      <td style={td}>{emoji} {c.label}</td>
                      <td style={td}>{c.speedMin}~{c.speedMax}km/h</td>
                      <td style={td}>직구 + 변화구 {c.breakingBallCount}종</td>
                      <td style={td}>{(c.borderlineRatio * 100).toFixed(0)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {step === 'difficulty' && selectedMode && (
        <>
          <div style={styles.stepLabel}>
            {modes.find(m => m.id === selectedMode)?.emoji}{' '}
            {modes.find(m => m.id === selectedMode)?.label} — 난이도 선택
          </div>
          <div style={styles.diffCards}>
            {difficulties.map(({ id, emoji }) => {
              const c = DIFFICULTY_CONFIG[id]
              return (
                <button
                  key={id}
                  style={styles.diffCard}
                  onClick={() => handleDifficultySelect(id)}
                >
                  <div style={styles.diffEmoji}>{emoji}</div>
                  <div style={styles.diffLabel}>{c.label}</div>
                  <div style={styles.diffDetail}>{c.speedMin}~{c.speedMax} km/h</div>
                  <div style={styles.diffDetail}>
                    직구 + 변화구 {c.breakingBallCount}종
                  </div>
                  <div style={styles.pitchChips}>
                    <span style={styles.pitchChipFixed}>직구</span>
                    {Array.from({ length: c.breakingBallCount }, (_, i) => (
                      <span key={i} style={styles.pitchChipRandom}>?</span>
                    ))}
                  </div>
                  <div style={styles.randomNote}>매 게임 랜덤 선택</div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {/* 물리 시뮬레이션 모드 선택 UI — 추후 공개 예정 */}

      {/* 선호구단 선택 모달 */}
      {showTeamModal && (
        <TeamSelectModal
          currentTeamId={myTeam?.id}
          onSelect={team => { setMyTeam(team.id ? team : null); setShowTeamModal(false) }}
          onClose={() => setShowTeamModal(false)}
        />
      )}

      {/* 랭킹 모달 */}
      {showRanking && (
        <RankingModal user={user} onClose={() => setShowRanking(false)} />
      )}
    </div>
  )
}

// ── 랭킹 모달 ────────────────────────────────────────────────────────────────
const DIFF_TABS = ['루키', '아마추어', '프로', '메이저'] as const

const GRADE_COLOR: Record<string, string> = {
  S: '#ffd700', A: '#4fc3f7', B: '#81c784', C: '#ffb74d', D: '#ef5350', '-': '#888',
}

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return '-'
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function RankingModal({ user, onClose }: { user?: User; onClose: () => void }) {
  const [rankTab, setRankTab] = useState<string>('루키')
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetchTopRankings(10, rankTab)
      .then(r => setRankings(r))
      .catch(() => setRankings([]))
      .finally(() => setLoading(false))
  }, [rankTab])

  return (
    <div style={rm.overlay} onClick={onClose}>
      <div style={rm.modal} onClick={e => e.stopPropagation()}>
        <div style={rm.header}>
          <span style={rm.title}>🏆 TOP 10 랭킹</span>
          <button style={rm.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* 난이도 탭 */}
        <div style={rm.tabs}>
          {DIFF_TABS.map(tab => (
            <button
              key={tab}
              style={{ ...rm.tab, ...(rankTab === tab ? rm.tabActive : {}) }}
              onClick={() => setRankTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* 랭킹 리스트 */}
        {loading ? (
          <div style={rm.empty}>로딩 중...</div>
        ) : rankings.length === 0 ? (
          <div style={rm.empty}>기록 없음</div>
        ) : (
          <div style={rm.list}>
            {rankings.map((r, i) => {
              const isMe = user && r.email === user.email
              return (
                <div key={r.id} style={{
                  ...rm.row,
                  background: isMe ? 'rgba(255,204,0,0.10)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: isMe ? '1px solid rgba(255,204,0,0.4)' : '1px solid transparent',
                }}>
                  <span style={{ ...rm.num, color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888' }}>
                    {i + 1}
                  </span>
                  <span style={{ ...rm.grade, color: GRADE_COLOR[r.grade] ?? '#888' }}>{r.grade}</span>
                  <span style={{ ...rm.email, color: isMe ? '#ffcc00' : '#eee', fontWeight: isMe ? 700 : 400 }}>
                    {r.email.split('@')[0]}
                  </span>
                  {r.teamId && (() => {
                    const tm = KBO_TEAMS.find(t => t.id === r.teamId)
                    return tm ? <img src={tm.logoUrl} alt={tm.abbr} style={rm.logo} title={tm.name} /> : null
                  })()}
                  <span style={rm.score}>{r.totalScore.toLocaleString()}</span>
                  <span style={rm.acc}>{r.accuracy.toFixed(0)}%</span>
                  <span style={rm.date}>{formatTs(r.playedAt)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

const rm: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 50,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
  },
  modal: {
    background: 'linear-gradient(135deg, #0d1f33 0%, #1a2e44 100%)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: '24px 28px',
    width: '100%', maxWidth: 560,
    color: '#fff', fontFamily: 'sans-serif',
    maxHeight: '80vh', overflowY: 'auto',
  },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: 900, letterSpacing: 1 },
  closeBtn: {
    background: 'none', border: '1px solid rgba(255,255,255,0.2)',
    color: '#aaa', borderRadius: 6, padding: '4px 10px',
    cursor: 'pointer', fontSize: 14,
  },
  tabs: { display: 'flex', gap: 6, marginBottom: 14 },
  tab: {
    flex: 1, padding: '6px 0', borderRadius: 6,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent', color: '#aaa',
    fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  tabActive: {
    background: 'rgba(0,229,255,0.15)',
    border: '1px solid rgba(0,229,255,0.5)',
    color: '#00e5ff', fontWeight: 700,
  },
  empty: { color: '#aaa', fontSize: 13, textAlign: 'center', padding: '16px 0' },
  list: { display: 'flex', flexDirection: 'column', gap: 4 },
  row: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 10px', borderRadius: 6, fontSize: 13,
  },
  num:   { width: 20, color: '#aaa', fontWeight: 700, textAlign: 'center' as const },
  grade: { width: 20, fontWeight: 900, textAlign: 'center' as const },
  email: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  logo:  { width: 20, height: 20, objectFit: 'contain' as const, flexShrink: 0 },
  score: { width: 70, fontWeight: 700, textAlign: 'right' as const },
  acc:   { width: 38, color: '#9ecaf8', textAlign: 'right' as const },
  date:  { width: 60, color: '#777', fontSize: 11, textAlign: 'right' as const },
}

const th: React.CSSProperties = { padding: '5px 14px', textAlign: 'center', fontWeight: 600 }
const td: React.CSSProperties = {
  padding: '6px 14px',
  textAlign: 'center',
  borderBottom: '1px solid rgba(255,255,255,0.08)',
}

const styles: Record<string, React.CSSProperties> = {
  adminBtn: {
    position: 'absolute',
    bottom: 20, left: 20,
    background: 'rgba(255,87,34,0.1)',
    border: '1px solid rgba(255,87,34,0.35)',
    color: '#ff8a65',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  teamBtn: {
    position: 'absolute',
    top: 20, right: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid',
    cursor: 'pointer',
    minWidth: 76,
    transition: 'all 0.15s',
  },
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    padding: '32px 20px',
    fontFamily: 'sans-serif',
  },
  backBtn: {
    position: 'absolute',
    top: 20, left: 20,
    background: 'none',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 14,
  },
  title: { fontSize: 48, fontWeight: 900, letterSpacing: 4, marginBottom: 4 },
  subtitle: { fontSize: 18, color: '#9ecaf8', marginBottom: 32 },
  stepLabel: { fontSize: 16, color: '#aac', marginBottom: 20, fontWeight: 600 },
  modes: { display: 'flex', gap: 24, marginBottom: 36, flexWrap: 'wrap', justifyContent: 'center' },
  card: {
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: 16,
    padding: '28px 36px',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: 200,
    transition: 'background 0.2s',
  },
  emoji: { fontSize: 40, marginBottom: 10 },
  cardTitle: { fontSize: 20, fontWeight: 700, marginBottom: 8 },
  cardDesc: { fontSize: 13, color: '#aac', lineHeight: 1.6, maxWidth: 220 },
  rankingBtn: {
    background: 'rgba(255,215,0,0.08)',
    border: '1px solid rgba(255,215,0,0.35)',
    color: '#ffd700',
    padding: '8px 24px',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  diffTable: {
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
    padding: '16px 24px',
    width: '100%',
    maxWidth: 580,
  },
  sectionTitle: { fontSize: 13, color: '#9ecaf8', marginBottom: 10, fontWeight: 700 },
  diffCards: { display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' },
  diffCard: {
    background: 'rgba(255,255,255,0.07)',
    border: '2px solid rgba(255,255,255,0.15)',
    borderRadius: 14,
    padding: '22px 28px',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    minWidth: 130,
    transition: 'background 0.2s, border-color 0.2s',
  },
  diffEmoji: { fontSize: 28, marginBottom: 8 },
  diffLabel: { fontSize: 18, fontWeight: 700, marginBottom: 10 },
  diffDetail: { fontSize: 12, color: '#aac', lineHeight: 1.8 },
  pitchChips: {
    display: 'flex', flexWrap: 'wrap', justifyContent: 'center',
    gap: 4, marginTop: 10,
  },
  pitchChipFixed: {
    fontSize: 10, color: '#fff',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: 4, padding: '2px 6px', fontWeight: 700,
  },
  pitchChipRandom: {
    fontSize: 10, color: '#ffcc00',
    background: 'rgba(255,204,0,0.12)',
    border: '1px solid rgba(255,204,0,0.35)',
    borderRadius: 4, padding: '2px 8px', fontWeight: 700,
  },
  randomNote: {
    fontSize: 10, color: 'rgba(255,204,0,0.7)',
    marginTop: 5,
  },
}
