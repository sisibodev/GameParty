import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { ItemDef, ItemTier } from '../types'
import { randomSeed } from '../utils/rng'
import { getItemById } from '../data/items'
import { SHOP_REROLL_COST } from '../constants'

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#aaa',
  rare:   '#44aaff',
  hero:   '#c05cfc',
  legend: '#ffd700',
}

const TIER_LABEL: Record<ItemTier, string> = {
  common: '보통',
  rare:   '희귀',
  hero:   '영웅',
  legend: '전설',
}

export default function ShopPage() {
  const { activeSlot, shopItems, enterShopPhase, buyItem, leaveShop, rerollShop } = useGameStore()

  useEffect(() => {
    if (shopItems.length === 0) {
      enterShopPhase(randomSeed())
    }
  }, [])

  if (!activeSlot) return null

  const gold = activeSlot.gold ?? 0
  const inventory = activeSlot.inventory ?? []
  const canReroll = gold >= SHOP_REROLL_COST

  const inventoryByTier: Record<ItemTier, ItemDef[]> = { common: [], rare: [], hero: [], legend: [] }
  for (const inv of inventory) {
    const def = getItemById(inv.itemId)
    if (def) inventoryByTier[def.tier].push(def)
  }

  return (
    <div style={s.root}>
      <h2 style={s.title}>상점</h2>
      <p style={s.sub}>Round {activeSlot.currentRound} — 다음 라운드 준비</p>

      <div style={s.topBar}>
        <div style={s.goldBadge}>💰 {gold} G</div>
        <button
          style={{ ...s.rerollBtn, opacity: canReroll ? 1 : 0.35, cursor: canReroll ? 'pointer' : 'not-allowed' }}
          disabled={!canReroll}
          onClick={() => rerollShop(randomSeed())}
        >
          🎲 리롤 ({SHOP_REROLL_COST} G)
        </button>
      </div>

      <div style={s.grid}>
        {shopItems.length === 0 ? (
          <p style={s.empty}>모든 아이템 구매 완료</p>
        ) : (
          shopItems.map((item, i) => (
            <ShopCard
              key={`${item.id}-${i}`}
              item={item}
              canAfford={gold >= item.price}
              onBuy={() => buyItem(item.id)}
            />
          ))
        )}
      </div>

      <div style={s.invBox}>
        <h3 style={s.invTitle}>보유 아이템 ({inventory.length})</h3>
        {inventory.length === 0 ? (
          <p style={s.invEmpty}>아직 구매한 아이템이 없습니다</p>
        ) : (
          <div style={s.invList}>
            {(['legend', 'hero', 'rare', 'common'] as ItemTier[]).map(tier => (
              inventoryByTier[tier].length > 0 && (
                <div key={tier} style={s.invTierRow}>
                  <span style={{ ...s.invTierLabel, color: TIER_COLOR[tier], borderColor: TIER_COLOR[tier] }}>
                    {TIER_LABEL[tier]}
                  </span>
                  <div style={s.invItems}>
                    {inventoryByTier[tier].map((def, i) => (
                      <span key={`${def.id}-${i}`} style={{ ...s.invChip, borderColor: TIER_COLOR[tier] }}>
                        {def.name}
                      </span>
                    ))}
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      <button style={s.btnLeave} onClick={leaveShop}>
        가챠로 진행 →
      </button>
    </div>
  )
}

interface ShopCardProps {
  item:      ItemDef
  canAfford: boolean
  onBuy:     () => void
}

function ShopCard({ item, canAfford, onBuy }: ShopCardProps) {
  const color = TIER_COLOR[item.tier]
  return (
    <div style={{ ...s.card, borderColor: color }}>
      <div style={{ ...s.tierBadge, color, borderColor: color }}>
        {TIER_LABEL[item.tier]}
      </div>
      <div style={s.itemName}>{item.name}</div>
      <div style={s.itemDesc}>{item.description}</div>
      <button
        style={{ ...s.buyBtn, opacity: canAfford ? 1 : 0.35, cursor: canAfford ? 'pointer' : 'not-allowed' }}
        disabled={!canAfford}
        onClick={onBuy}
      >
        {item.price} G
      </button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  root:       { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '1.5rem', minHeight: '100vh', background: '#0d0d1a', color: '#e8e8ff', gap: '1rem' },
  title:      { fontSize: '1.5rem', fontWeight: 700, color: '#c0aaff', margin: 0 },
  sub:        { color: '#888', margin: 0, fontSize: '0.9rem' },
  goldBadge:  { background: 'linear-gradient(135deg,#ffb040,#ff8040)', border: 'none', borderRadius: '10px', padding: '0.5rem 1.25rem', color: '#1a1a2e', fontWeight: 800, fontSize: '1rem' },
  grid:       { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', width: '100%', maxWidth: '560px' },
  empty:      { gridColumn: '1 / -1', color: '#666', textAlign: 'center', padding: '2rem' },
  card:       { background: '#1a1a2e', border: '2px solid', borderRadius: '10px', padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' },
  tierBadge:  { fontSize: '0.7rem', fontWeight: 700, border: '1px solid', borderRadius: '4px', padding: '1px 8px' },
  itemName:   { fontSize: '0.95rem', fontWeight: 700, color: '#e8e8ff', textAlign: 'center' },
  itemDesc:   { fontSize: '0.8rem', color: '#44ffaa', textAlign: 'center' },
  buyBtn:     { background: '#7c5cfc', border: 'none', borderRadius: '6px', color: '#fff', padding: '0.35rem 0.8rem', fontSize: '0.85rem', fontWeight: 700, marginTop: '0.25rem' },
  btnLeave:   { background: 'linear-gradient(135deg,#7c5cfc,#c05cfc)', border: 'none', borderRadius: '12px', color: '#fff', padding: '0.9rem 2.5rem', cursor: 'pointer', fontSize: '1rem', fontWeight: 700, marginTop: '0.5rem' },
  topBar:     { display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' },
  rerollBtn:  { background: '#2a2a3e', border: '1px solid #7c5cfc', borderRadius: '10px', color: '#c0aaff', padding: '0.5rem 1rem', fontSize: '0.85rem', fontWeight: 700 },
  invBox:     { width: '100%', maxWidth: '560px', background: '#15152a', border: '1px solid #2a2a3e', borderRadius: '10px', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  invTitle:   { margin: 0, fontSize: '0.95rem', color: '#c0aaff', fontWeight: 700 },
  invEmpty:   { margin: 0, color: '#666', fontSize: '0.85rem', textAlign: 'center', padding: '0.5rem' },
  invList:    { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  invTierRow: { display: 'flex', gap: '0.5rem', alignItems: 'flex-start' },
  invTierLabel: { fontSize: '0.7rem', fontWeight: 700, border: '1px solid', borderRadius: '4px', padding: '1px 6px', flexShrink: 0, minWidth: '32px', textAlign: 'center' },
  invItems:   { display: 'flex', flexWrap: 'wrap', gap: '0.3rem', flex: 1 },
  invChip:    { fontSize: '0.75rem', color: '#e8e8ff', border: '1px solid', borderRadius: '4px', padding: '1px 6px', background: '#1a1a2e' },
}
