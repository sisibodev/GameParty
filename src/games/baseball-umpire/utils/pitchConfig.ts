import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../../firebase/config'
import { FullPitchConfig, getDefaultPitchConfig, applyPitchConfig } from './pitch'

const COL = 'pitch_configs'
const DOC = 'default'

/** Firestore에서 pitch config 로드. 없으면 null 반환 */
export async function loadPitchConfig(): Promise<FullPitchConfig | null> {
  try {
    const snap = await getDoc(doc(db, COL, DOC))
    if (!snap.exists()) return null
    const data = snap.data() as Partial<FullPitchConfig>
    const defaults = getDefaultPitchConfig()

    // 구버전 Firestore 저장값에 누락된 필드(x1/x2 등)를 기본값으로 보완
    // 최상위 섹션이 없으면 defaults 전체를 쓰고, 있으면 구종/폼별 필드를 deep merge
    const pitchBreak = data.pitchBreak
      ? Object.fromEntries(
          Object.entries(defaults.pitchBreak).map(([type, defBp]) => {
            const saved = (data.pitchBreak as Record<string, typeof defBp>)[type] ?? {}
            return [type, { ...defBp, ...saved }]  // 기본값 위에 저장값 덮어씀 (누락 필드는 기본값 유지)
          })
        ) as typeof defaults.pitchBreak
      : defaults.pitchBreak

    const formBreakMult = data.formBreakMult
      ? Object.fromEntries(
          Object.entries(defaults.formBreakMult).map(([form, defFbm]) => {
            const saved = (data.formBreakMult as Record<string, typeof defFbm>)[form] ?? {}
            return [form, { ...defFbm, ...saved }]
          })
        ) as typeof defaults.formBreakMult
      : defaults.formBreakMult

    return {
      pitchMovement:  data.pitchMovement  ?? defaults.pitchMovement,
      formMult:       data.formMult       ?? defaults.formMult,
      pitchBreak,
      formBreakMult,
    }
  } catch {
    return null
  }
}

/** Firestore에 pitch config 저장 */
export async function savePitchConfig(config: FullPitchConfig): Promise<void> {
  await setDoc(doc(db, COL, DOC), {
    ...config,
    updatedAt: serverTimestamp(),
  })
}

/** 로드 후 즉시 런타임에 적용 (게임 시작 시 호출) */
export async function loadAndApplyPitchConfig(): Promise<void> {
  const config = await loadPitchConfig()
  if (config) applyPitchConfig(config)
}
