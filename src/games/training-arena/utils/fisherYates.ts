import { SeededRng } from './rng'

/** 시드 기반 Fisher-Yates 셔플 (원본 배열 불변) */
export function shuffle<T>(arr: readonly T[], rng: SeededRng): T[] {
  const result = [...arr]
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i + 1)
    const tmp = result[i]
    result[i] = result[j]
    result[j] = tmp
  }
  return result
}

/** 배열에서 n개를 중복 없이 랜덤 선택 */
export function pickN<T>(arr: readonly T[], n: number, rng: SeededRng): T[] {
  return shuffle(arr, rng).slice(0, n)
}
