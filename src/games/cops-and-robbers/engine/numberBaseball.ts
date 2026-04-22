import type { NumberBaseballAttempt } from '../types'

export function generateSecret(digits: number): string {
  if (digits < 1 || digits > 9) {
    throw new Error(`invalid digit count: ${digits}`)
  }
  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  const picked = pool.slice(0, digits)
  if (picked[0] === 0 && digits > 1) {
    const swapIdx = picked.findIndex((v, i) => i > 0 && v !== 0)
    if (swapIdx > 0) {
      ;[picked[0], picked[swapIdx]] = [picked[swapIdx], picked[0]]
    }
  }
  return picked.join('')
}

export function isValidGuess(guess: string, digits: number): boolean {
  if (guess.length !== digits) return false
  if (!/^[0-9]+$/.test(guess)) return false
  const set = new Set(guess)
  return set.size === digits
}

export function judge(secret: string, guess: string): NumberBaseballAttempt {
  let strikes = 0
  let balls = 0
  for (let i = 0; i < secret.length; i++) {
    const g = guess[i]
    if (g === secret[i]) {
      strikes++
    } else if (secret.includes(g)) {
      balls++
    }
  }
  return { guess, strikes, balls }
}

export function formatAttempt(attempt: NumberBaseballAttempt): string {
  if (attempt.strikes === 0 && attempt.balls === 0) return '아웃'
  const parts: string[] = []
  if (attempt.strikes > 0) parts.push(`${attempt.strikes}S`)
  if (attempt.balls > 0) parts.push(`${attempt.balls}B`)
  return parts.join(' ')
}
