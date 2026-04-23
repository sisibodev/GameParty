// Mulberry32 — 시드 기반 결정론적 난수 생성기
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

  /** [min, max) 정수 */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min
  }

  /** 확률 판정 (0~1) */
  chance(probability: number): boolean {
    return this.next() < probability
  }

  /** 배열에서 랜덤 선택 */
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(0, arr.length)]
  }
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000)
}
