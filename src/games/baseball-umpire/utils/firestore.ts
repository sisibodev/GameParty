import {
  collection, addDoc, query, orderBy, limit, getDocs,
  serverTimestamp, Timestamp,
} from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { PitchParams, PitchType } from '../types'

export interface UmpireRecord {
  uid: string
  email: string
  playedAt: Timestamp | null
  difficulty: string
  totalPitches: number
  correctJudgments: number
  accuracy: number
  totalScore: number
  maxCombo: number
  grade: string
  pitchStats: Record<string, { total: number; correct: number }>
}

export interface RankEntry {
  id: string
  email: string
  totalScore: number
  accuracy: number
  grade: string
  difficulty: string
  playedAt: Timestamp | null
}

function calcGrade(accuracy: number): string {
  if (accuracy >= 95) return 'S'
  if (accuracy >= 85) return 'A'
  if (accuracy >= 70) return 'B'
  if (accuracy >= 55) return 'C'
  return 'D'
}

function buildPitchStats(pitchHistory: PitchParams[]): Record<string, { total: number; correct: number }> {
  const stats: Record<string, { total: number; correct: number }> = {}
  for (const p of pitchHistory) {
    if (!stats[p.pitchType]) stats[p.pitchType] = { total: 0, correct: 0 }
    stats[p.pitchType].total++
    if (p.correct) stats[p.pitchType].correct++
  }
  return stats
}

/** 일반 모드 종료 시 기록 저장 */
export async function saveUmpireRecord(params: {
  uid: string
  email: string
  difficulty: string
  totalPitches: number
  correctCount: number
  score: number
  maxCombo: number
  pitchHistory: PitchParams[]
}): Promise<void> {
  const { uid, email, difficulty, totalPitches, correctCount, score, maxCombo, pitchHistory } = params
  const accuracy = totalPitches > 0 ? Math.round((correctCount / totalPitches) * 1000) / 10 : 0
  const grade = calcGrade(accuracy)

  const record: Omit<UmpireRecord, 'playedAt'> & { playedAt: ReturnType<typeof serverTimestamp> } = {
    uid,
    email,
    playedAt: serverTimestamp() as ReturnType<typeof serverTimestamp>,
    difficulty,
    totalPitches,
    correctJudgments: correctCount,
    accuracy,
    totalScore: score,
    maxCombo,
    grade,
    pitchStats: buildPitchStats(pitchHistory),
  }

  await addDoc(collection(db, 'umpire_records'), record)
}

/** TOP 랭킹 조회 (점수 기준 내림차순) */
export async function fetchTopRankings(count = 10): Promise<RankEntry[]> {
  const q = query(
    collection(db, 'umpire_records'),
    orderBy('totalScore', 'desc'),
    limit(count),
  )
  const snap = await getDocs(q)
  return snap.docs.map(d => {
    const data = d.data() as UmpireRecord
    return {
      id: d.id,
      email: data.email,
      totalScore: data.totalScore,
      accuracy: data.accuracy,
      grade: data.grade,
      difficulty: data.difficulty,
      playedAt: data.playedAt,
    }
  })
}

export type { PitchType }
