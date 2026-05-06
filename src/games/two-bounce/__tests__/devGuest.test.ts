/**
 * devGuest.ts 단위 테스트 — 순수 함수 부분만 검증
 *
 * Firebase SDK 의존 함수는 Firebase Emulator가 필요하므로 제외한다.
 * 네트워크 없이 실행 가능한 순수 함수만 테스트한다.
 *
 * Task016 기준.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('../../../firebase/config', () => ({ rtdb: null, db: null, auth: null }))

import {
  isDevGuestUid,
  usedGuestIndices,
  nextGuestIndex,
  DEV_GUEST_PREFIX,
} from '../utils/devGuest'

// ─── DEV_GUEST_PREFIX ─────────────────────────────────────────────────────────

describe('DEV_GUEST_PREFIX', () => {
  it('"dev-guest-" 값을 가진다', () => {
    expect(DEV_GUEST_PREFIX).toBe('dev-guest-')
  })
})

// ─── isDevGuestUid ────────────────────────────────────────────────────────────

describe('isDevGuestUid', () => {
  it('dev-guest- prefix이면 true를 반환한다', () => {
    expect(isDevGuestUid('dev-guest-1')).toBe(true)
    expect(isDevGuestUid('dev-guest-2')).toBe(true)
    expect(isDevGuestUid('dev-guest-10')).toBe(true)
  })

  it('prefix만 있는 문자열은 true를 반환한다', () => {
    expect(isDevGuestUid('dev-guest-')).toBe(true)
  })

  it('일반 uid이면 false를 반환한다', () => {
    expect(isDevGuestUid('realuser123')).toBe(false)
    expect(isDevGuestUid('guest')).toBe(false)
    expect(isDevGuestUid('Guest 1')).toBe(false)
  })

  it('빈 문자열이면 false를 반환한다', () => {
    expect(isDevGuestUid('')).toBe(false)
  })

  it('유사 prefix는 false를 반환한다', () => {
    expect(isDevGuestUid('dev-GUEST-1')).toBe(false)
    expect(isDevGuestUid('dev_guest_1')).toBe(false)
  })
})

// ─── usedGuestIndices ─────────────────────────────────────────────────────────

describe('usedGuestIndices', () => {
  it('dev guest uid에서 인덱스를 추출한다', () => {
    expect(usedGuestIndices(['dev-guest-1', 'dev-guest-3'])).toEqual([1, 3])
  })

  it('일반 uid는 무시한다', () => {
    expect(usedGuestIndices(['user-abc', 'dev-guest-2'])).toEqual([2])
  })

  it('빈 배열이면 빈 배열을 반환한다', () => {
    expect(usedGuestIndices([])).toEqual([])
  })

  it('실제 사용자 uid만 있으면 빈 배열을 반환한다', () => {
    expect(usedGuestIndices(['uid1', 'uid2'])).toEqual([])
  })

  it('숫자가 아닌 suffix는 필터된다', () => {
    const result = usedGuestIndices(['dev-guest-1', 'dev-guest-abc'])
    expect(result).toContain(1)
    expect(result.some(Number.isNaN)).toBe(false)
  })
})

// ─── nextGuestIndex ───────────────────────────────────────────────────────────

describe('nextGuestIndex', () => {
  it('게스트가 없으면 1을 반환한다', () => {
    expect(nextGuestIndex([])).toBe(1)
    expect(nextGuestIndex(['uid1', 'uid2'])).toBe(1)
  })

  it('1이 있으면 2를 반환한다', () => {
    expect(nextGuestIndex(['dev-guest-1'])).toBe(2)
  })

  it('1, 2가 있으면 3을 반환한다', () => {
    expect(nextGuestIndex(['dev-guest-1', 'dev-guest-2'])).toBe(3)
  })

  it('빈 자리를 찾아서 반환한다', () => {
    expect(nextGuestIndex(['dev-guest-1', 'dev-guest-3'])).toBe(2)
  })

  it('1, 2, 3이 있으면 4를 반환한다', () => {
    expect(nextGuestIndex(['dev-guest-1', 'dev-guest-2', 'dev-guest-3'])).toBe(4)
  })

  it('순서에 무관하게 동작한다', () => {
    expect(nextGuestIndex(['dev-guest-3', 'dev-guest-1', 'dev-guest-2'])).toBe(4)
  })
})
