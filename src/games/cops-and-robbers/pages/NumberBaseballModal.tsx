import { useEffect, useRef, useState } from 'react'
import type { NumberBaseballSession } from '../types'
import { isValidGuess, formatAttempt } from '../engine/numberBaseball'

interface NumberBaseballModalProps {
  session: NumberBaseballSession
  onSubmit: (guess: string) => void
  onClose: () => void
}

export default function NumberBaseballModal({
  session,
  onSubmit,
  onClose,
}: NumberBaseballModalProps) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const attemptsLeft = session.maxAttempts - session.attempts.length
  const finished = session.solved || session.failed

  useEffect(() => {
    inputRef.current?.focus()
  }, [session.attempts.length])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  function handleSubmit() {
    if (finished) return
    const trimmed = input.trim()
    if (!isValidGuess(trimmed, session.digits)) {
      setError(`서로 다른 ${session.digits}자리 숫자를 입력하세요`)
      return
    }
    if (session.attempts.some((a) => a.guess === trimmed)) {
      setError('이미 시도한 값입니다')
      return
    }
    setError(null)
    setInput('')
    onSubmit(trimmed)
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={panelTitleStyle}>🔒 금고 해킹</div>
            <div style={panelSubtitleStyle}>
              서로 다른 {session.digits}자리 숫자 · 스트라이크(S) / 볼(B) 판정
            </div>
          </div>
          <div style={counterStyle}>
            남은 시도 <strong>{attemptsLeft}</strong> / {session.maxAttempts}
          </div>
        </div>

        <div style={logStyle}>
          {session.attempts.length === 0 && (
            <div style={emptyLogStyle}>첫 번째 시도를 입력하세요</div>
          )}
          {session.attempts.map((a, i) => {
            const result = formatAttempt(a)
            const isOut = a.strikes === 0 && a.balls === 0
            return (
              <div key={i} style={attemptRowStyle}>
                <span style={attemptIndexStyle}>#{i + 1}</span>
                <span style={attemptGuessStyle}>{a.guess}</span>
                <span
                  style={{
                    ...attemptResultStyle,
                    color:
                      a.strikes === session.digits
                        ? '#34d399'
                        : isOut
                          ? '#6b7280'
                          : '#fbbf24',
                  }}
                >
                  {result}
                </span>
              </div>
            )
          })}
        </div>

        {session.solved && (
          <div style={{ ...bannerStyle, background: '#064e3b', color: '#34d399' }}>
            💎 금고를 열었습니다!
          </div>
        )}
        {session.failed && (
          <div style={{ ...bannerStyle, background: '#450a0a', color: '#fca5a5' }}>
            🚨 경보 발동! 경찰에게 위치가 노출됩니다
          </div>
        )}

        {!finished && (
          <div style={inputRowStyle}>
            <input
              ref={inputRef}
              value={input}
              maxLength={session.digits}
              inputMode="numeric"
              pattern="[0-9]*"
              onChange={(e) => {
                const v = e.target.value.replace(/[^0-9]/g, '')
                setInput(v)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder={'0'.repeat(session.digits)}
              style={inputStyle}
            />
            <button style={submitStyle} onClick={handleSubmit}>
              시도
            </button>
          </div>
        )}
        {error && <div style={errorStyle}>{error}</div>}

        <div style={footerStyle}>
          <button style={closeButtonStyle} onClick={onClose}>
            {finished ? '닫기' : '나가기 (ESC)'}
          </button>
          <div style={hintTextStyle}>
            닫으면 진행도 유지 · 최대 시도 초과 시 경보 발동
          </div>
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(3, 6, 12, 0.76)',
  backdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 50,
}

const panelStyle: React.CSSProperties = {
  width: 'min(460px, 92vw)',
  background: '#0f131d',
  border: '1px solid #2a3345',
  borderRadius: 14,
  padding: 22,
  boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
  color: '#e4e7ef',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 16,
}

const panelTitleStyle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 700,
  marginBottom: 4,
}

const panelSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#8a93a6',
}

const counterStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#c8cfdd',
  background: '#121725',
  border: '1px solid #1f2638',
  padding: '6px 10px',
  borderRadius: 8,
  whiteSpace: 'nowrap',
}

const logStyle: React.CSSProperties = {
  background: '#05070d',
  border: '1px solid #1c2331',
  borderRadius: 10,
  padding: 10,
  minHeight: 120,
  maxHeight: 180,
  overflowY: 'auto',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  marginBottom: 14,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const emptyLogStyle: React.CSSProperties = {
  color: '#4b5467',
  textAlign: 'center',
  padding: '30px 0',
  fontStyle: 'italic',
}

const attemptRowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '40px 1fr 80px',
  alignItems: 'center',
  padding: '4px 6px',
}

const attemptIndexStyle: React.CSSProperties = {
  color: '#6b7280',
}

const attemptGuessStyle: React.CSSProperties = {
  letterSpacing: 4,
  fontWeight: 700,
  color: '#e4e7ef',
}

const attemptResultStyle: React.CSSProperties = {
  textAlign: 'right',
  fontWeight: 700,
}

const bannerStyle: React.CSSProperties = {
  padding: '10px 12px',
  borderRadius: 8,
  textAlign: 'center',
  fontWeight: 700,
  marginBottom: 12,
}

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 8,
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  background: '#121725',
  border: '1px solid #2a3345',
  borderRadius: 8,
  color: '#e4e7ef',
  padding: '10px 12px',
  fontSize: 18,
  letterSpacing: 6,
  textAlign: 'center',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  outline: 'none',
}

const submitStyle: React.CSSProperties = {
  background: '#38bdf8',
  color: '#05070d',
  border: 'none',
  padding: '0 18px',
  borderRadius: 8,
  fontWeight: 700,
  cursor: 'pointer',
  fontSize: 14,
}

const errorStyle: React.CSSProperties = {
  color: '#fca5a5',
  fontSize: 12,
  marginTop: 4,
  marginBottom: 8,
}

const footerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  marginTop: 12,
}

const closeButtonStyle: React.CSSProperties = {
  background: '#1b2230',
  color: '#e4e7ef',
  border: '1px solid #2a3345',
  padding: '8px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 13,
}

const hintTextStyle: React.CSSProperties = {
  fontSize: 11,
  color: '#6b7280',
  textAlign: 'right',
  flex: 1,
  minWidth: 0,
}
