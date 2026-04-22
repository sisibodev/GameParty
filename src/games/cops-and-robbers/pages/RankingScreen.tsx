import { useEffect, useState } from 'react'
import { getRanking, type RankingEntry } from '../utils/copsFirestore'

interface RankingScreenProps {
  onBack: () => void
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export default function RankingScreen({ onBack }: RankingScreenProps) {
  const [entries, setEntries] = useState<RankingEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getRanking()
      .then(setEntries)
      .catch(() => setError('랭킹을 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={rootStyle}>
      <div style={cardStyle}>
        <div style={headerStyle}>
          <span style={iconStyle}>🏆</span>
          <div>
            <h1 style={titleStyle}>랭킹 TOP 10</h1>
            <p style={subtitleStyle}>최단 시간 클리어 순</p>
          </div>
        </div>

        {loading && <p style={infoStyle}>불러오는 중…</p>}
        {error && <p style={{ ...infoStyle, color: '#ef4444' }}>{error}</p>}
        {!loading && !error && entries.length === 0 && (
          <p style={infoStyle}>아직 기록이 없습니다.</p>
        )}

        {!loading && !error && entries.length > 0 && (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>결과</th>
                <th style={thStyle}>시간</th>
                <th style={thStyle}>보물</th>
                <th style={thStyle}>플레이어</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={e.id} style={i % 2 === 0 ? rowEvenStyle : rowOddStyle}>
                  <td style={tdStyle}>
                    <span style={rankStyle(i)}>{i + 1}</span>
                  </td>
                  <td style={tdStyle}>
                    <span style={winnerBadgeStyle(e.winner)}>
                      {e.winner === 'thieves' ? '도둑 승' : '경찰 승'}
                    </span>
                  </td>
                  <td style={tdStyle}>{fmtTime(e.timeMs)}</td>
                  <td style={tdStyle}>{e.treasureCount}</td>
                  <td style={{ ...tdStyle, fontSize: 12, color: '#8a93a6' }}>
                    {e.playerResults.map((p) => p.name).join(', ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <button style={backButtonStyle} onClick={onBack}>
          돌아가기
        </button>
      </div>
    </div>
  )
}

function rankStyle(i: number): React.CSSProperties {
  const colors = ['#fbbf24', '#94a3b8', '#b45309']
  return {
    fontWeight: 700,
    fontSize: 15,
    color: colors[i] ?? '#e4e7ef',
  }
}

function winnerBadgeStyle(winner: 'thieves' | 'cops'): React.CSSProperties {
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
    background: winner === 'thieves' ? 'rgba(125,211,252,0.15)' : 'rgba(239,68,68,0.15)',
    color: winner === 'thieves' ? '#7dd3fc' : '#ef4444',
  }
}

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at 30% 10%, #141a28 0%, #05070d 55%)',
  color: '#e4e7ef',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 660,
  background: '#0f131d',
  border: '1px solid #1c2331',
  borderRadius: 14,
  padding: 28,
  boxShadow: '0 20px 50px rgba(0,0,0,0.55)',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  marginBottom: 22,
}

const iconStyle: React.CSSProperties = {
  fontSize: 36,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
}

const subtitleStyle: React.CSSProperties = {
  margin: '4px 0 0',
  color: '#8a93a6',
  fontSize: 13,
}

const infoStyle: React.CSSProperties = {
  color: '#8a93a6',
  textAlign: 'center',
  padding: '32px 0',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  marginBottom: 24,
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#7dd3fc',
  paddingBottom: 10,
  borderBottom: '1px solid #1c2331',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 4px',
  fontSize: 14,
  verticalAlign: 'middle',
}

const rowEvenStyle: React.CSSProperties = {
  background: 'transparent',
}

const rowOddStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.02)',
}

const backButtonStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '10px 20px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  width: '100%',
}
