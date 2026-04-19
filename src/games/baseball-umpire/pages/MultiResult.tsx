import { useCallback, useEffect, useRef, useState } from 'react'
import { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { BatterProfile, PitchParams, PitchType } from '../types'
import { MultiRoom, PitchResult, subscribeMultiRoom, unsubscribeMultiRoom } from '../utils/umpire-rtdb'
import { fetchTopRankings, RankEntry } from '../utils/firestore'
import { KBO_TEAMS } from '../utils/kboTeams'
import BaseballScene from '../components/BaseballScene'
import ReplayControls from '../components/ReplayControls'

const DIFF_TABS = ['루키', '아마추어', '프로', '메이저'] as const

interface Props {
  roomId: string
  user: User
  difficulty: string   // 플레이한 난이도 (Korean label)
  // 로컬 게임 결과 (pitchHistory 포함)
  score: number
  totalPitches: number
  correctCount: number
  maxCombo: number
  pitchHistory: PitchParams[]
  onRetry: () => void
  onRetryWithNewSettings?: () => void   // ⑦ 설정 변경 후 재시작
  onLobby: () => void
}

const PITCH_NAMES: Record<PitchType, string> = {
  fastball: '직구', two_seam: '투심', sinker: '싱커', cutter: '커터',
  changeup: '체인지업', slider: '슬라이더', sweeper: '스위퍼',
  curve: '커브', splitter: '스플리터', forkball: '포크볼',
}

const GRADE_COLOR: Record<string, string> = {
  S: '#ffd700', A: '#4fc3f7', B: '#81c784', C: '#ffb74d', D: '#ef5350', '-': '#888',
}

function calcGrade(accuracy: number) {
  if (accuracy >= 95) return { grade: 'S', color: '#ffd700' }
  if (accuracy >= 85) return { grade: 'A', color: '#4fc3f7' }
  if (accuracy >= 70) return { grade: 'B', color: '#81c784' }
  if (accuracy >= 55) return { grade: 'C', color: '#ffb74d' }
  return { grade: 'D', color: '#ef5350' }
}

function pitchStats(history: PitchParams[]) {
  const stats: Record<string, { total: number; correct: number }> = {}
  for (const p of history) {
    if (!stats[p.pitchType]) stats[p.pitchType] = { total: 0, correct: 0 }
    stats[p.pitchType].total++
    if (p.correct) stats[p.pitchType].correct++
  }
  return stats
}

export default function MultiResult({
  roomId, user, difficulty,
  score, totalPitches, correctCount, maxCombo, pitchHistory,
  onRetry, onRetryWithNewSettings, onLobby,
}: Props) {
  const [room, setRoom] = useState<MultiRoom | null>(null)
  const roomRef = useRef<ReturnType<typeof subscribeMultiRoom> | null>(null)

  // 리플레이 모달 상태
  const [replayPitch, setReplayPitch]                 = useState<PitchParams | null>(null)
  const [replaySpeed, setReplaySpeed]                 = useState(0.5)
  const [replayPlaying, setReplayPlaying]             = useState(false)
  const [replayStage, setReplayStage]                 = useState(1)
  const [replayStageOverride, setReplayStageOverride] = useState<number | undefined>(undefined)

  // 랭킹 탭
  const [rankTab, setRankTab]       = useState(difficulty)
  const [rankings, setRankings]     = useState<RankEntry[]>([])
  const [rankLoading, setRankLoading] = useState(false)

  useEffect(() => {
    roomRef.current = subscribeMultiRoom(roomId, r => setRoom(r))
    return () => { if (roomRef.current) unsubscribeMultiRoom(roomRef.current) }
  }, [roomId])

  // 난이도 탭별 랭킹 조회
  useEffect(() => {
    setRankLoading(true)
    fetchTopRankings(10, rankTab)
      .then(r => setRankings(r))
      .catch(() => setRankings([]))
      .finally(() => setRankLoading(false))
  }, [rankTab])

  const openReplay = useCallback((pitch: PitchParams) => {
    setReplayStage(1)
    setReplayStageOverride(undefined)
    setReplaySpeed(1)
    setReplayPitch(pitch)
    setReplayPlaying(true)
  }, [])

  const closeReplay = useCallback(() => {
    setReplayPitch(null)
    setReplayPlaying(false)
    setReplayStage(1)
    setReplayStageOverride(undefined)
  }, [])

  const handleReplayAgain = useCallback(() => {
    if (!replayPitch) return
    setReplayStage(1)
    setReplayStageOverride(undefined)
    setReplayPlaying(true)
    setReplayPitch({ ...replayPitch })
  }, [replayPitch])

  const handleStageChange = useCallback((s: number) => {
    setReplayStage(s)
    setReplayStageOverride(s)
  }, [])

  const accuracy = totalPitches > 0 ? (correctCount / totalPitches) * 100 : 0
  const { grade, color: gradeColor } = calcGrade(accuracy)
  const stats = pitchStats(pitchHistory)
  const wrongCount = totalPitches - correctCount

  const players = room
    ? Object.values(room.players).sort((a, b) => b.score - a.score)
    : []
  const finished = players.filter(p => p.finished).length
  const allDone  = players.length > 0 && finished === players.length

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.title}>⚾ 멀티 배틀 결과</div>

        {/* ── 집계 대기 ── */}
        {!allDone && room && (
          <div style={styles.waiting}>
            ⏳ 결과 집계 중... ({finished}/{players.length}명 완료)
          </div>
        )}

        {/* ── 순위표 ── */}
        {players.length > 0 && (
          <div style={styles.rankTable}>
            <div style={styles.rankHeader}>
              <span style={styles.rCol0}>#</span>
              <span style={styles.rCol1}>플레이어</span>
              <span style={styles.rCol2}>등급</span>
              <span style={styles.rCol3}>점수</span>
              <span style={styles.rCol4}>정확도</span>
              <span style={styles.rCol5}>정답</span>
              <span style={styles.rCol6}>콤보</span>
            </div>
            {players.map((p, i) => {
              const isMe = p.uid === user.uid
              return (
                <div key={p.uid} style={{
                  ...styles.rankRow,
                  background: isMe ? 'rgba(0,229,255,0.08)' : i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent',
                  border: isMe ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
                }}>
                  <span style={{ ...styles.rCol0, color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#888', fontWeight: 900 }}>
                    {i + 1}
                  </span>
                  <span style={styles.rCol1}>
                    {p.email.split('@')[0]}
                    {isMe && <span style={styles.meTag}>나</span>}
                    {!p.finished && <span style={styles.playingTag}>진행중</span>}
                  </span>
                  <span style={{ ...styles.rCol2, color: GRADE_COLOR[p.grade] ?? '#888', fontWeight: 900 }}>
                    {p.grade}
                  </span>
                  <span style={{ ...styles.rCol3, fontWeight: 700 }}>{p.finished ? p.score.toLocaleString() : '-'}</span>
                  <span style={styles.rCol4}>{p.finished ? `${p.accuracy.toFixed(1)}%` : '-'}</span>
                  <span style={styles.rCol5}>{p.finished ? `${p.correctCount}/${p.totalPitches}` : '-'}</span>
                  <span style={styles.rCol6}>{p.finished ? `${p.maxCombo}연속` : '-'}</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 내 결과 요약 ── */}
        <div style={styles.sep} />
        <div style={styles.gradeWrap}>
          <div style={{ ...styles.grade, color: gradeColor }}>{grade}</div>
          <div style={styles.gradeSub}>내 등급</div>
        </div>
        <div style={styles.scoreRow}>
          <span style={styles.scoreNum}>{score.toLocaleString()}</span>
          <span style={styles.scoreSub}>점</span>
        </div>
        <div style={styles.stats}>
          <Stat label="정확도" value={`${accuracy.toFixed(1)}%`} />
          <Stat label="정답" value={`${correctCount}구`} color="#4caf50" />
          <Stat label="오심" value={`${wrongCount}구`} color="#f44336" />
          <Stat label="최고 콤보" value={`${maxCombo}연속`} color="#ffcc00" />
        </div>

        {/* ── 구종별 정확도 ── */}
        {Object.keys(stats).length > 0 && (
          <div style={styles.pitchStats}>
            <div style={styles.sectionTitle}>구종별 정확도</div>
            {Object.entries(stats).map(([type, s]) => {
              const acc  = s.total > 0 ? (s.correct / s.total) * 100 : 0
              const name = PITCH_NAMES[type as PitchType] ?? type
              return (
                <div key={type} style={styles.pitchRow}>
                  <span style={styles.pitchName}>{name}</span>
                  <div style={styles.barWrap}>
                    <div style={{ ...styles.bar, width: `${acc}%` }} />
                  </div>
                  <span style={styles.pitchAcc}>{s.correct}/{s.total} ({acc.toFixed(0)}%)</span>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 플레이어별 판정 비교표 ── */}
        {allDone && players.length > 1 && pitchHistory.length > 0 && (
          <PitchCompareTable
            pitchHistory={pitchHistory}
            players={players}
            myUid={user.uid}
          />
        )}

        {/* ── 투구 기록 + 리플레이 ── */}
        {pitchHistory.length > 0 && (
          <div style={styles.historySection}>
            <div style={styles.sectionTitle}>투구 기록 — 클릭하여 리플레이</div>
            <div style={styles.historyScroll}>
              <div style={styles.historyHeader}>
                <span style={styles.hCol0}>#</span>
                <span style={styles.hCol1}>구종</span>
                <span style={styles.hCol2}>구속</span>
                <span style={styles.hCol3}>실제</span>
                <span style={styles.hCol4}>판정</span>
                <span style={styles.hCol5}></span>
              </div>
              {pitchHistory.map((p, i) => (
                <PitchRow key={i} pitch={p} index={i} onReplay={openReplay} />
              ))}
            </div>
          </div>
        )}

        {/* ── 랭킹 탭 ── */}
        <div style={styles.rankingSection}>
          <div style={styles.sectionTitle}>🏆 TOP 10 랭킹</div>
          <div style={styles.rankTabs}>
            {DIFF_TABS.map(tab => (
              <button
                key={tab}
                style={{ ...styles.rankTabBtn, ...(rankTab === tab ? styles.rankTabActive : {}) }}
                onClick={() => setRankTab(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
          {rankLoading ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>로딩 중...</div>
          ) : rankings.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>기록 없음</div>
          ) : (
            <div style={styles.rankList}>
              {rankings.map((r, i) => {
                const isMe = r.email === user.email
                return (
                  <div key={r.id} style={{ ...styles.topRankRow, background: isMe ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
                    <span style={styles.rankNum}>{i + 1}</span>
                    <span style={styles.rankGrade}>{r.grade}</span>
                    <span style={styles.rankEmail}>{r.email.split('@')[0]}</span>
                    {r.teamId && (() => {
                      const tm = KBO_TEAMS.find(t => t.id === r.teamId)
                      return tm ? (
                        <img src={tm.logoUrl} alt={tm.abbr} style={styles.rankTeamLogo} title={tm.name} />
                      ) : null
                    })()}
                    <span style={styles.rankScore}>{r.totalScore.toLocaleString()}</span>
                    <span style={styles.rankAcc}>{r.accuracy.toFixed(0)}%</span>
                    <span style={styles.rankDate}>{formatTs(r.playedAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── 버튼 ── */}
        <div style={styles.buttons}>
          <button style={styles.retryBtn} onClick={onRetry}>같은 설정으로</button>
          {onRetryWithNewSettings && (
            <button style={styles.settingsBtn} onClick={onRetryWithNewSettings}>설정 변경</button>
          )}
          <button style={styles.lobbyBtn} onClick={onLobby}>로비로</button>
        </div>
      </div>

      {/* ── 리플레이 모달 ── */}
      {replayPitch && (
        <div style={styles.replayOverlay}>
          <BaseballScene
            batter={(replayPitch.batter ?? null) as BatterProfile | null}
            currentPitch={null}
            pitchPhase="idle"
            showZone
            onPitchArrived={() => {}}
            onSceneReady={() => {}}
            replayPitch={replayPitch}
            replaySpeed={replaySpeed}
            replayStageOverride={replayStageOverride}
            onReplayEnd={() => setReplayPlaying(false)}
            onReplayStageChange={setReplayStage}
          />
          <ReplayControls
            pitch={replayPitch}
            speed={replaySpeed}
            isPlaying={replayPlaying}
            stage={replayStage}
            onSpeedChange={setReplaySpeed}
            onStageChange={handleStageChange}
            onReplay={handleReplayAgain}
            onClose={closeReplay}
          />
        </div>
      )}
    </div>
  )
}

// ── 투구 행 ────────────────────────────────────────────────────────────────
function PitchRow({ pitch, index, onReplay }: {
  pitch: PitchParams; index: number; onReplay: (p: PitchParams) => void
}) {
  const isStrikeActual = pitch.isStrike
  const isStrikeCall   = pitch.playerCall === 'strike'
  const correct        = pitch.correct
  const borderline     = pitch.isBorderline
  return (
    <div style={{
      ...styles.historyRow,
      background: correct === undefined
        ? 'rgba(255,255,255,0.04)'
        : correct ? 'rgba(76,175,80,0.08)' : 'rgba(244,67,54,0.08)',
    }}>
      <span style={styles.hCol0}><span style={styles.pitchNumLabel}>{index + 1}</span></span>
      <span style={styles.hCol1}>
        {PITCH_NAMES[pitch.pitchType]}
        {borderline && <span style={styles.borderlineDot}>●</span>}
      </span>
      <span style={styles.hCol2}>{pitch.speed}km/h</span>
      <span style={{ ...styles.hCol3, color: isStrikeActual ? '#ff7043' : '#42a5f5' }}>
        {isStrikeActual ? 'S' : 'B'}
      </span>
      <span style={{ ...styles.hCol4, color: isStrikeCall ? '#ff7043' : '#42a5f5' }}>
        {pitch.playerCall ? (isStrikeCall ? 'S' : 'B') : '-'}
      </span>
      <span style={styles.hCol5}>
        {correct !== undefined && (
          <span style={{ color: correct ? '#4caf50' : '#f44336', fontWeight: 700 }}>
            {correct ? '✓' : '✗'}
          </span>
        )}
      </span>
      <button style={styles.replayBtn} onClick={() => onReplay(pitch)}>▶</button>
    </div>
  )
}

// ── 플레이어별 판정 비교표 ────────────────────────────────────────────────────
function PitchCompareTable({
  pitchHistory, players, myUid,
}: {
  pitchHistory: PitchParams[]
  players: Array<{ uid: string; email: string; pitchResults?: PitchResult[]; finished: boolean }>
  myUid: string
}) {
  const finishedPlayers = players.filter(p => p.finished && p.pitchResults)
  if (finishedPlayers.length === 0) return null

  return (
    <div style={cmpStyles.section}>
      <div style={styles.sectionTitle}>👥 플레이어별 판정 비교</div>
      <div style={cmpStyles.scrollWrap}>
        <table style={cmpStyles.table}>
          <thead>
            <tr>
              <th style={cmpStyles.thIdx}>#</th>
              <th style={cmpStyles.thPitch}>구종</th>
              <th style={cmpStyles.thAnswer}>정답</th>
              {finishedPlayers.map(p => (
                <th key={p.uid} style={{
                  ...cmpStyles.thPlayer,
                  color: p.uid === myUid ? '#00e5ff' : '#bbb',
                }}>
                  {p.email.split('@')[0].slice(0, 5)}
                  {p.uid === myUid && <span style={cmpStyles.meMark}>나</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pitchHistory.map((pitch, i) => {
              const isStrike = pitch.isStrike
              return (
                <tr key={i} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.03)' : 'transparent' }}>
                  <td style={cmpStyles.tdIdx}>{i + 1}</td>
                  <td style={cmpStyles.tdPitch}>{PITCH_NAMES[pitch.pitchType]}</td>
                  <td style={{ ...cmpStyles.tdAnswer, color: isStrike ? '#ff7043' : '#42a5f5' }}>
                    {isStrike ? 'S' : 'B'}
                  </td>
                  {finishedPlayers.map(p => {
                    const pr = p.pitchResults?.[i]
                    if (!pr) return <td key={p.uid} style={cmpStyles.tdCell}>—</td>
                    const isMe = p.uid === myUid
                    const callLabel = pr.call === 'strike' ? 'S' : pr.call === 'ball' ? 'B' : '—'
                    return (
                      <td key={p.uid} style={{
                        ...cmpStyles.tdCell,
                        background: isMe
                          ? pr.correct ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.15)'
                          : undefined,
                      }}>
                        <span style={{
                          color: pr.correct ? '#4caf50' : '#f44336',
                          fontWeight: 700,
                          fontSize: 12,
                        }}>
                          {pr.correct ? '✓' : '✗'}
                        </span>
                        <span style={{ fontSize: 10, color: '#888', marginLeft: 2 }}>{callLabel}</span>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const cmpStyles: Record<string, React.CSSProperties> = {
  section: { marginBottom: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 },
  scrollWrap: { overflowX: 'auto', maxHeight: 300, overflowY: 'auto', borderRadius: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12, minWidth: 320 },
  thIdx:    { width: 28, padding: '5px 4px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textAlign: 'center', position: 'sticky', top: 0, background: '#0d1f33', zIndex: 1 },
  thPitch:  { width: 64, padding: '5px 4px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textAlign: 'left', position: 'sticky', top: 0, background: '#0d1f33', zIndex: 1 },
  thAnswer: { width: 36, padding: '5px 4px', color: 'rgba(255,255,255,0.35)', fontWeight: 700, textAlign: 'center', position: 'sticky', top: 0, background: '#0d1f33', zIndex: 1 },
  thPlayer: { minWidth: 52, padding: '5px 4px', fontWeight: 700, textAlign: 'center', position: 'sticky', top: 0, background: '#0d1f33', zIndex: 1, fontSize: 11 },
  tdIdx:    { padding: '4px 4px', color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontWeight: 700 },
  tdPitch:  { padding: '4px 4px', color: '#ccc' },
  tdAnswer: { padding: '4px 4px', fontWeight: 900, textAlign: 'center' },
  tdCell:   { padding: '4px 4px', textAlign: 'center', borderRadius: 3 },
  meMark:   { fontSize: 9, color: '#00e5ff', background: 'rgba(0,229,255,0.15)', borderRadius: 3, padding: '1px 3px', marginLeft: 3 },
}

function formatTs(ts: Timestamp | null | undefined): string {
  if (!ts) return '-'
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={styles.statItem}>
      <div style={{ ...styles.statValue, color: color ?? '#fff' }}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0a1628 0%, #1a2e44 100%)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    padding: '32px 20px', fontFamily: 'sans-serif', overflowY: 'auto',
  },
  card: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20, padding: '28px 40px',
    color: '#fff', width: '100%', maxWidth: 680,
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  title: { fontSize: 24, fontWeight: 900, textAlign: 'center', letterSpacing: 2, marginBottom: 16 },
  waiting: {
    textAlign: 'center', fontSize: 14, color: '#ffb74d',
    background: 'rgba(255,183,77,0.1)', borderRadius: 8, padding: '8px 16px', marginBottom: 16,
  },

  // 순위표
  rankTable: {
    display: 'flex', flexDirection: 'column', gap: 4,
    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, overflow: 'hidden', marginBottom: 16,
  },
  rankHeader: {
    display: 'flex', alignItems: 'center',
    padding: '8px 12px', background: 'rgba(0,229,255,0.08)',
    fontSize: 11, color: '#9ecaf8', fontWeight: 700,
  },
  rankRow: {
    display: 'flex', alignItems: 'center',
    padding: '10px 12px', fontSize: 13, borderRadius: 0,
  },
  rCol0: { width: 28, textAlign: 'center' as const },
  rCol1: { flex: 1, display: 'flex' as const, alignItems: 'center' as const, gap: 6, overflow: 'hidden' },
  rCol2: { width: 44, textAlign: 'center' as const },
  rCol3: { width: 80, textAlign: 'right' as const },
  rCol4: { width: 68, textAlign: 'right' as const },
  rCol5: { width: 68, textAlign: 'right' as const },
  rCol6: { width: 72, textAlign: 'right' as const },
  meTag: {
    fontSize: 10, fontWeight: 700, color: '#00e5ff',
    background: 'rgba(0,229,255,0.12)', borderRadius: 4, padding: '1px 5px',
  },
  playingTag: {
    fontSize: 10, color: '#ffb74d',
    background: 'rgba(255,183,77,0.12)', borderRadius: 4, padding: '1px 5px',
  },

  sep: { height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 0 20px' },

  // 내 결과
  gradeWrap: { textAlign: 'center', marginBottom: 8 },
  grade: { fontSize: 72, fontWeight: 900, lineHeight: 1 },
  gradeSub: { color: '#aaa', fontSize: 13 },
  scoreRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 },
  scoreNum: { fontSize: 42, fontWeight: 900 },
  scoreSub: { fontSize: 18, color: '#aaa' },
  stats: { display: 'flex', justifyContent: 'space-around', margin: '16px 0 24px', gap: 8 },
  statItem: { textAlign: 'center' },
  statValue: { fontSize: 20, fontWeight: 700 },
  statLabel: { fontSize: 12, color: '#aaa', marginTop: 2 },

  // 구종별 정확도
  pitchStats: { marginBottom: 20 },
  sectionTitle: { fontSize: 13, color: '#9ecaf8', fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 },
  pitchRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  pitchName: { width: 64, fontSize: 13, color: '#ddd' },
  barWrap: { flex: 1, height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' },
  bar: { height: '100%', background: 'linear-gradient(90deg, #4fc3f7, #0288d1)', borderRadius: 5 },
  pitchAcc: { width: 100, fontSize: 12, color: '#ccc', textAlign: 'right' },

  // 투구 기록
  historySection: { marginBottom: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 },
  historyScroll: { maxHeight: 260, overflowY: 'auto', borderRadius: 6 },
  historyHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px', fontSize: 10, color: 'rgba(255,255,255,0.35)',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 2,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px', borderRadius: 5, fontSize: 12, marginBottom: 2,
  },
  hCol0: { width: 24, textAlign: 'right' as const, flexShrink: 0 },
  hCol1: { width: 70, display: 'flex' as const, alignItems: 'center' as const, gap: 3, flexShrink: 0 },
  hCol2: { width: 66, color: '#ffeb3b', fontWeight: 700, flexShrink: 0 },
  hCol3: { width: 20, fontWeight: 900, textAlign: 'center' as const, flexShrink: 0 },
  hCol4: { width: 20, fontWeight: 900, textAlign: 'center' as const, flexShrink: 0 },
  hCol5: { width: 18, textAlign: 'center' as const, flexShrink: 0 },
  pitchNumLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 },
  borderlineDot: { fontSize: 7, color: '#ff9800', marginLeft: 2 },
  replayBtn: {
    marginLeft: 'auto', padding: '2px 10px',
    background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 5, color: '#00e5ff', fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
  },

  // 랭킹
  rankingSection: { marginBottom: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 },
  rankTabs: { display: 'flex', gap: 6, marginBottom: 10 },
  rankTabBtn: {
    flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent', color: '#aaa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
  },
  rankTabActive: {
    background: 'rgba(0,229,255,0.15)', border: '1px solid rgba(0,229,255,0.5)',
    color: '#00e5ff', fontWeight: 700,
  },
  rankList: { display: 'flex', flexDirection: 'column', gap: 4 },
  topRankRow: { display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', borderRadius: 6, fontSize: 12 },
  rankNum:       { width: 18, color: '#aaa', fontWeight: 700, textAlign: 'center' as const },
  rankGrade:     { width: 18, fontWeight: 900, textAlign: 'center' as const, color: '#ffd700' },
  rankEmail:     { flex: 1, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  rankTeamBadge: { fontSize: 10, fontWeight: 700, color: '#aaa', background: 'rgba(255,255,255,0.1)', borderRadius: 3, padding: '1px 4px', flexShrink: 0 },
  rankTeamLogo: { width: 20, height: 20, objectFit: 'contain', flexShrink: 0 },
  rankScore:     { width: 62, fontWeight: 700, textAlign: 'right' as const, color: '#fff' },
  rankAcc:       { width: 38, color: '#9ecaf8', textAlign: 'right' as const },
  rankDate:      { width: 60, color: '#777', fontSize: 11, textAlign: 'right' as const },

  buttons: { display: 'flex', gap: 12, marginTop: 8 },
  retryBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
    background: '#1976d2', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  settingsBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid rgba(255,183,77,0.5)',
    background: 'rgba(255,183,77,0.1)', color: '#ffb74d', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  lobbyBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent', color: '#fff', fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },

  // 리플레이 모달
  replayOverlay: { position: 'fixed', inset: 0, zIndex: 100, background: '#000' },
}
