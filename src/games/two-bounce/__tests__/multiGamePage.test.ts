import { describe, it, expect } from 'vitest'
import { isFreeThrowPos, PHYSICS } from '../utils/physics'

describe('isFreeThrowPos', () => {
  it('null 위치는 자유투 위치로 간주', () => {
    expect(isFreeThrowPos(null)).toBe(true)
  })

  it('자유투 위치와 정확히 일치하면 true', () => {
    expect(isFreeThrowPos({ ...PHYSICS.FREE_THROW_POS })).toBe(true)
  })

  it('자유투 위치에서 0.2 이내 오차는 true', () => {
    const ft = PHYSICS.FREE_THROW_POS
    expect(isFreeThrowPos({ x: ft.x + 0.2, y: ft.y, z: ft.z - 0.2 })).toBe(true)
  })

  it('자유투 위치에서 0.3 초과 차이는 false', () => {
    const ft = PHYSICS.FREE_THROW_POS
    expect(isFreeThrowPos({ x: ft.x + 0.5, y: ft.y, z: ft.z })).toBe(false)
  })

  it('2바운드 위치(x=0.2, z=5.5)는 false', () => {
    expect(isFreeThrowPos({ x: 0.2, y: 1.0, z: 5.5 })).toBe(false)
  })

  it('완전히 다른 위치는 false', () => {
    expect(isFreeThrowPos({ x: 3.0, y: 1.0, z: 1.0 })).toBe(false)
  })
})
