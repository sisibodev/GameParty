/**
 * 시드 기반 난수 생성기 (멀티플레이 동기화용)
 * Mulberry32 알고리즘
 */
export class SeededRng {
  private seed: number

  constructor(seed: number) {
    this.seed = seed >>> 0
  }

  next(): number {
    this.seed |= 0
    this.seed = (this.seed + 0x6d2b79f5) | 0
    let t = Math.imul(this.seed ^ (this.seed >>> 15), 1 | this.seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  /** [min, max) 범위 정수 */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min
  }

  /** [min, max) 범위 실수 */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min
  }

  /** 배열에서 랜덤 선택 */
  pick<T>(arr: T[]): T {
    return arr[this.int(0, arr.length)]
  }
}

/** 현재 시각 기반 시드 생성 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
