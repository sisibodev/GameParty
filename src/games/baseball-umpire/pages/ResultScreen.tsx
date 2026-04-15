import { useEffect, useState, useCallback } from 'react'
import { User } from 'firebase/auth'
import { Timestamp } from 'firebase/firestore'
import { BatterProfile, PitchParams, PitchType } from '../types'
import { saveUmpireRecord, fetchTopRankings, RankEntry } from '../utils/firestore'
import BaseballScene from '../components/BaseballScene'
import ReplayControls from '../components/ReplayControls'

const PITCH_NAMES: Record<PitchType, string> = {
  fastball:  '직구',
  two_seam:  '투심',
  sinker:    '싱커',
  cutter:    '커터',
  changeup:  '체인지업',
  slider:    '슬라이더',
  sweeper:   '스위퍼',
  curve:     '커브',
  splitter:  '스플리터',
  forkball:  '포크볼',
}

interface Props {
  score: number
  totalPitches: number
  correctCount: number
  maxCombo: number
  pitchHistory: PitchParams[]
  mode: 'practice' | 'normal'
  difficulty: string
  user: User | null
  onRetry: () => void
  onLobby: () => void
}

function calcGrade(accuracy: number): { grade: string; color: string } {
  if (accuracy >= 95) return { grade: 'S', color: '#ffd700' }
  if (accuracy >= 85) return { grade: 'A', color: '#4fc3f7' }
  if (accuracy >= 70) return { grade: 'B', color: '#81c784' }
  if (accuracy >= 55) return { grade: 'C', color: '#ffb74d' }
  return { grade: 'D', color: '#ef5350' }
}

function pitchStats(history: PitchParams[]): Record<string, { total: number; correct: number }> {
  const stats: Record<string, { total: number; correct: number }> = {}
  for (const p of history) {
    if (!stats[p.pitchType]) stats[p.pitchType] = { total: 0, correct: 0 }
    stats[p.pitchType].total++
    if (p.correct) stats[p.pitchType].correct++
  }
  return stats
}

function formatTs(ts: Timestamp | null): string {
  if (!ts) return '-'
  const d = ts.toDate()
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ResultScreen({
  score, totalPitches, correctCount, maxCombo,
  pitchHistory, mode, difficulty, user, onRetry, onLobby,
}: Props) {
  const accuracy = totalPitches > 0 ? (correctCount / totalPitches) * 100 : 0
  const { grade, color } = calcGrade(accuracy)
  const stats = pitchStats(pitchHistory)
  const wrongCount = totalPitches - correctCount

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [rankings, setRankings] = useState<RankEntry[]>([])
  const [rankLoading, setRankLoading] = useState(false)

  // 리플레이 모달
  const [replayPitch, setReplayPitch]               = useState<PitchParams | null>(null)
  const [replaySpeed, setReplaySpeed]               = useState(1)
  const [replayPlaying, setReplayPlaying]           = useState(false)
  const [replayStage, setReplayStage]               = useState(1)
  const [replayStageOverride, setReplayStageOverride] = useState<number | undefined>(undefined)

  // 일반 모드 + 로그인 시 자동 저장
  useEffect(() => {
    if (mode !== 'normal' || !user) return

    setSaveStatus('saving')
    saveUmpireRecord({
      uid:        user.uid,
      email:      user.email ?? 'anonymous',
      difficulty,
      totalPitches,
      correctCount,
      score,
      maxCombo,
      pitchHistory,
    })
      .then(() => setSaveStatus('saved'))
      .catch(() => setSaveStatus('error'))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 랭킹 조회
  useEffect(() => {
    setRankLoading(true)
    fetchTopRankings(10)
      .then(r => setRankings(r))
      .catch(() => setRankings([]))
      .finally(() => setRankLoading(false))
  }, [])

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

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        {/* 등급 + 점수 */}
        <div style={styles.gradeWrap}>
          <div style={{ ...styles.grade, color }}>{grade}</div>
          <div style={styles.gradeSub}>등급</div>
        </div>

        <div style={styles.scoreRow}>
          <span style={styles.scoreNum}>{score.toLocaleString()}</span>
          <span style={styles.scoreSub}>점</span>
        </div>

        {/* 저장 상태 */}
        {mode === 'normal' && (
          <div style={styles.saveRow}>
            {saveStatus === 'saving' && <span style={{ color: '#aaa' }}>기록 저장 중...</span>}
            {saveStatus === 'saved'  && <span style={{ color: '#4caf50' }}>✓ 기록 저장됨</span>}
            {saveStatus === 'error'  && <span style={{ color: '#f44336' }}>저장 실패</span>}
            {saveStatus === 'idle' && !user && <span style={{ color: '#aaa' }}>로그인하면 기록이 저장됩니다</span>}
          </div>
        )}

        <div style={styles.stats}>
          <Stat label="정확도" value={`${accuracy.toFixed(1)}%`} />
          <Stat label="정답" value={`${correctCount}구`} color="#4caf50" />
          <Stat label="오심" value={`${wrongCount}구`} color="#f44336" />
          <Stat label="최고 콤보" value={`${maxCombo}연속`} color="#ffcc00" />
        </div>

        {/* 구종별 정확도 */}
        <div style={styles.pitchStats}>
          <div style={styles.sectionTitle}>구종별 정확도</div>
          {Object.entries(stats).map(([type, s]) => {
            const acc = s.total > 0 ? (s.correct / s.total) * 100 : 0
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

        {/* 투구 기록 */}
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

        {/* 랭킹 */}
        <div style={styles.rankingSection}>
          <div style={styles.sectionTitle}>TOP 랭킹</div>
          {rankLoading ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>로딩 중...</div>
          ) : rankings.length === 0 ? (
            <div style={{ color: '#aaa', fontSize: 13, textAlign: 'center', padding: '8px 0' }}>기록 없음</div>
          ) : (
            <div style={styles.rankList}>
              {rankings.map((r, i) => {
                const isMe = user && r.email === user.email
                return (
                  <div key={r.id} style={{ ...styles.rankRow, background: isMe ? 'rgba(0,229,255,0.08)' : 'transparent' }}>
                    <span style={styles.rankNum}>{i + 1}</span>
                    <span style={styles.rankGrade}>{r.grade}</span>
                    <span style={styles.rankEmail}>{r.email.split('@')[0]}</span>
                    <span style={styles.rankDiff}>{r.difficulty}</span>
                    <span style={styles.rankScore}>{r.totalScore.toLocaleString()}</span>
                    <span style={styles.rankAcc}>{r.accuracy.toFixed(0)}%</span>
                    <span style={styles.rankDate}>{formatTs(r.playedAt)}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div style={styles.buttons}>
          <button style={styles.retryBtn} onClick={onRetry}>다시 하기</button>
          <button style={styles.lobbyBtn} onClick={onLobby}>로비로</button>
        </div>
      </div>

      {/* 리플레이 모달 */}
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

// ── 투구 행 컴포넌트 ─────────────────────────────────────────────────────────
function PitchRow({ pitch, index, onReplay }: {
  pitch: PitchParams
  index: number
  onReplay: (p: PitchParams) => void
}) {
  const isStrikeActual = pitch.isStrike
  const isStrikeCall   = pitch.playerCall === 'strike'
  const correct        = pitch.correct
  const borderline     = pitch.isBorderline

  return (
    <div
      style={{
        ...styles.historyRow,
        background: correct === undefined
          ? 'rgba(255,255,255,0.04)'
          : correct
            ? 'rgba(76,175,80,0.08)'
            : 'rgba(244,67,54,0.08)',
      }}
    >
      <span style={styles.hCol0}>
        <span style={styles.pitchNumLabel}>{index + 1}</span>
      </span>
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
      <button
        style={styles.replayBtn}
        onClick={() => onReplay(pitch)}
        title="리플레이 보기"
      >
        ▶
      </button>
    </div>
  )
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    overflowY: 'auto',
  },
  card: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: 20,
    padding: '32px 40px',
    color: '#fff',
    maxWidth: 560,
    width: '100%',
    fontFamily: 'sans-serif',
  },
  gradeWrap: { textAlign: 'center', marginBottom: 8 },
  grade: { fontSize: 80, fontWeight: 900, lineHeight: 1 },
  gradeSub: { color: '#aaa', fontSize: 14 },
  scoreRow: { display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 6, marginBottom: 8 },
  scoreNum: { fontSize: 48, fontWeight: 900 },
  scoreSub: { fontSize: 20, color: '#aaa' },
  saveRow: { textAlign: 'center', fontSize: 12, marginBottom: 16 },
  stats: { display: 'flex', justifyContent: 'space-around', marginBottom: 28, gap: 8, marginTop: 16 },
  statItem: { textAlign: 'center' },
  statValue: { fontSize: 22, fontWeight: 700 },
  statLabel: { fontSize: 12, color: '#aaa', marginTop: 2 },
  pitchStats: { marginBottom: 24 },
  sectionTitle: { fontSize: 13, color: '#9ecaf8', fontWeight: 700, marginBottom: 10, letterSpacing: 0.5 },
  pitchRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
  pitchName: { width: 64, fontSize: 13, color: '#ddd' },
  barWrap: { flex: 1, height: 10, background: 'rgba(255,255,255,0.1)', borderRadius: 5, overflow: 'hidden' },
  bar: { height: '100%', background: 'linear-gradient(90deg, #4fc3f7, #0288d1)', borderRadius: 5, transition: 'width 0.5s' },
  pitchAcc: { width: 100, fontSize: 12, color: '#ccc', textAlign: 'right' },

  // 투구 기록
  historySection: { marginBottom: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 },
  historyScroll: { maxHeight: 260, overflowY: 'auto', borderRadius: 6 },
  historyHeader: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '4px 8px',
    fontSize: 10, color: 'rgba(255,255,255,0.35)',
    fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    marginBottom: 2,
  },
  historyRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px', borderRadius: 5, fontSize: 12,
    marginBottom: 2,
    cursor: 'default',
  },
  hCol0: { width: 24, textAlign: 'right', flexShrink: 0 },
  hCol1: { width: 70, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 },
  hCol2: { width: 66, color: '#ffeb3b', fontWeight: 700, flexShrink: 0 },
  hCol3: { width: 20, fontWeight: 900, textAlign: 'center', flexShrink: 0 },
  hCol4: { width: 20, fontWeight: 900, textAlign: 'center', flexShrink: 0 },
  hCol5: { width: 18, textAlign: 'center', flexShrink: 0 },
  pitchNumLabel: { fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700 },
  borderlineDot: { fontSize: 7, color: '#ff9800', marginLeft: 2 },
  replayBtn: {
    marginLeft: 'auto',
    padding: '2px 10px',
    background: 'rgba(0,229,255,0.15)',
    border: '1px solid rgba(0,229,255,0.4)',
    borderRadius: 5,
    color: '#00e5ff',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    flexShrink: 0,
  },

  rankingSection: { marginBottom: 24, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 16 },
  rankList: { display: 'flex', flexDirection: 'column', gap: 4 },
  rankRow: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '5px 8px', borderRadius: 6, fontSize: 12,
  },
  rankNum:   { width: 18, color: '#aaa', fontWeight: 700, textAlign: 'center' },
  rankGrade: { width: 18, fontWeight: 900, textAlign: 'center', color: '#ffd700' },
  rankEmail: { flex: 1, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  rankDiff:  { width: 52, color: '#aaa', fontSize: 11, textAlign: 'center' },
  rankScore: { width: 62, fontWeight: 700, textAlign: 'right', color: '#fff' },
  rankAcc:   { width: 38, color: '#9ecaf8', textAlign: 'right' },
  rankDate:  { width: 60, color: '#777', fontSize: 11, textAlign: 'right' },
  buttons: { display: 'flex', gap: 12 },
  retryBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, border: 'none',
    background: '#1976d2', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },
  lobbyBtn: {
    flex: 1, padding: '12px 0', borderRadius: 10, border: '1px solid rgba(255,255,255,0.3)',
    background: 'transparent', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer',
  },

  // 리플레이 모달
  replayOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 100,
    background: '#000',
  },
}
