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
    return {
      pitchMovement:  data.pitchMovement  ?? defaults.pitchMovement,
      formMult:       data.formMult       ?? defaults.formMult,
      pitchBreak:     data.pitchBreak     ?? defaults.pitchBreak,
      formBreakMult:  data.formBreakMult  ?? defaults.formBreakMult,
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
