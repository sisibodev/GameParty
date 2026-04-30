import type { ItemDef, ItemTier } from '../types'
import { ITEMS } from '../data/items'
import { ITEM_TIERS, ITEM_TIER_PROBS, SHOP_SIZE } from '../constants'
import { SeededRng } from '../utils/rng'

function rollTier(rng: SeededRng, probs: Record<ItemTier, number> = ITEM_TIER_PROBS): ItemTier {
  let roll = rng.next()
  for (const tier of ITEM_TIERS) {
    const prob = probs[tier]
    if (roll < prob) return tier
    roll -= prob
  }
  return 'common'
}

// 라운드별 NPC 아이템 티어 확률 (라운드↑ → 상위 등급 가중)
function npcTierProbs(round: number): Record<ItemTier, number> {
  if (round <= 2)  return { common: 0.60, rare: 0.30, hero: 0.08, legend: 0.02 }
  if (round <= 4)  return { common: 0.40, rare: 0.35, hero: 0.20, legend: 0.05 }
  if (round <= 6)  return { common: 0.25, rare: 0.35, hero: 0.30, legend: 0.10 }
  return                  { common: 0.15, rare: 0.30, hero: 0.35, legend: 0.20 }
}

// NPC 아이템: 라운드-1개, 티어 확률 적용 (중복 가능)
export function rollNpcItems(count: number, round: number, seed: number): string[] {
  if (count <= 0) return []
  const rng = new SeededRng(seed)
  const probs = npcTierProbs(round)
  const byTier: Record<ItemTier, ItemDef[]> = {
    common: ITEMS.filter(i => i.tier === 'common'),
    rare:   ITEMS.filter(i => i.tier === 'rare'),
    hero:   ITEMS.filter(i => i.tier === 'hero'),
    legend: ITEMS.filter(i => i.tier === 'legend'),
  }
  const result: string[] = []
  for (let i = 0; i < count; i++) {
    const tier = rollTier(rng, probs)
    const pool = byTier[tier].length > 0 ? byTier[tier] : byTier.common
    if (pool.length === 0) continue
    result.push(rng.pick(pool).id)
  }
  return result
}

// 등급 확률로 N개 아이템을 진열 (중복 가능)
export function rollShopItems(seed: number): ItemDef[] {
  const rng = new SeededRng(seed)
  const byTier: Record<ItemTier, ItemDef[]> = {
    common: ITEMS.filter(i => i.tier === 'common'),
    rare:   ITEMS.filter(i => i.tier === 'rare'),
    hero:   ITEMS.filter(i => i.tier === 'hero'),
    legend: ITEMS.filter(i => i.tier === 'legend'),
  }

  const result: ItemDef[] = []
  const used = new Set<string>()
  for (let i = 0; i < SHOP_SIZE; i++) {
    const tier = rollTier(rng)
    const pool = byTier[tier]
    if (pool.length === 0) continue
    const available = pool.filter(it => !used.has(it.id))
    const item = rng.pick(available.length > 0 ? available : pool)
    used.add(item.id)
    result.push(item)
  }
  return result
}
