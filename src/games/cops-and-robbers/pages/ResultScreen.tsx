import type { ResultStats } from '../types'

interface ResultScreenProps {
  stats: ResultStats
  onBack: () => void
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

export default function ResultScreen({ stats, onBack }: ResultScreenProps) {
  const thiefWin = stats.winner === 'thieves'

  return (
    <div style={rootStyle}>
      <div style={cardStyle}>
        <div style={bannerStyle(thiefWin)}>
          <div style={bannerIconStyle}>{thiefWin ? '🏆' : '🚔'}</div>
          <div>
            <h1 style={bannerTitleStyle}>{thiefWin ? '도둑 팀 승리!' : '경찰 팀 승리!'}</h1>
            <p style={bannerSubStyle}>
              {thiefWin ? '금고를 털고 탈출에 성공했습니다.' : '모든 도둑을 체포했습니다.'}
            </p>
          </div>
        </div>

        <div style={statsRowStyle}>
          <StatBox label="플레이 시간" value={formatTime(stats.timeMs)} />
          <StatBox label="획득 보물" value={`${stats.treasureCount}`} color="#34d399" />
          {stats.roomId && <StatBox label="방 코드" value={stats.roomId} color="#7dd3fc" />}
        </div>

        {stats.playerResults.length > 0 && (
          <div style={playerSectionStyle}>
            <div style={sectionTitleStyle}>플레이어 결과</div>
            <div style={playerListStyle}>
              {stats.playerResults.map((p, i) => (
                <div key={i} style={playerRowStyle}>
                  <div style={playerInfoStyle}>
                    <span style={roleIconStyle}>{p.role === 'cop' ? '🚔' : '🕵️'}</span>
                    <span style={playerNameStyle}>{p.name}</span>
                    <span style={roleLabelStyle(p.role === 'cop')}>
                      {p.role === 'cop' ? '경찰' : '도둑'}
                    </span>
                  </div>
                  <div style={playerStatsStyle}>
                    {p.role !== 'cop' && (
                      <>
                        <span style={{ color: p.captured ? '#fca5a5' : '#34d399', fontSize: 12 }}>
                          {p.captured ? '체포됨' : '탈출'}
                        </span>
                        <span style={hitLabelStyle}>피격 {p.hitStack}/3</span>
                      </>
                    )}
                    {p.role === 'cop' && (
                      <span style={{ color: '#fbbf24', fontSize: 12 }}>수사 완료</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={actionRowStyle}>
          <button style={backBtnStyle} onClick={onBack}>
            로비로 돌아가기
          </button>
        </div>
      </div>
    </div>
  )
}

function StatBox({ label, value, color = '#e4e7ef' }: { label: string; value: string; color?: string }) {
  return (
    <div style={statBoxStyle}>
      <span style={statLabelStyle}>{label}</span>
      <span style={{ ...statValueStyle, color }}>{value}</span>
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#05070d',
  color: '#e4e7ef',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 24,
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  background: '#0f131d',
  border: '1px solid #1c2331',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
}

const bannerStyle = (win: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  padding: '28px 28px 24px',
  background: win
    ? 'linear-gradient(135deg, #064e3b 0%, #0f131d 70%)'
    : 'linear-gradient(135deg, #3b0a0a 0%, #0f131d 70%)',
  borderBottom: `1px solid ${win ? '#34d39930' : '#ef444430'}`,
})

const bannerIconStyle: React.CSSProperties = { fontSize: 52 }
const bannerTitleStyle: React.CSSProperties = { margin: 0, fontSize: 24, fontWeight: 800 }
const bannerSubStyle: React.CSSProperties = { margin: '4px 0 0', fontSize: 13, color: '#8a93a6' }

const statsRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  padding: '18px 24px',
  borderBottom: '1px solid #1a1f2a',
}

const statBoxStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#121725',
  border: '1px solid #1f2638',
  borderRadius: 10,
  padding: '10px 14px',
}

const statLabelStyle: React.CSSProperties = {
  fontSize: 10,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#6b7280',
  fontWeight: 700,
}

const statValueStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  fontFamily: 'ui-monospace, monospace',
}

const playerSectionStyle: React.CSSProperties = {
  padding: '16px 24px',
  borderBottom: '1px solid #1a1f2a',
}

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 1,
  color: '#6b7280',
  fontWeight: 700,
  marginBottom: 10,
}

const playerListStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }

const playerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '8px 12px',
  background: '#121725',
  border: '1px solid #1f2638',
  borderRadius: 8,
}

const playerInfoStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }
const roleIconStyle: React.CSSProperties = { fontSize: 16 }
const playerNameStyle: React.CSSProperties = { fontWeight: 600, fontSize: 14 }

const roleLabelStyle = (isCop: boolean): React.CSSProperties => ({
  fontSize: 11,
  padding: '2px 7px',
  borderRadius: 10,
  background: isCop ? '#3b0a0a' : '#0f2027',
  color: isCop ? '#fca5a5' : '#7dd3fc',
  fontWeight: 700,
})

const playerStatsStyle: React.CSSProperties = { display: 'flex', gap: 10, alignItems: 'center' }
const hitLabelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280' }

const actionRowStyle: React.CSSProperties = {
  padding: '20px 24px',
  display: 'flex',
  justifyContent: 'center',
}

const backBtnStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '11px 28px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
}
