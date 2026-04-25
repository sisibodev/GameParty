import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { ItemDef, ItemTier } from '../types'
import { randomSeed } from '../utils/rng'
import { getItemById } from '../data/items'
import { SHOP_REROLL_COST } from '../constants'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#9aa3b2',
  rare:   '#67e8f9',
  hero:   '#c78bff',
  legend: '#ffd66b',
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
    <div className="arena-bg" style={{ display:'flex', flexDirection:'column' as const, minHeight:'100vh' }}>
      <HeaderBar
        subtitle="TRAVELING SHOP"
        round={activeSlot.currentRound}
        gold={gold}
      />

      <div style={{ display:'flex', flex:1, overflow:'hidden' }}>
        {/* Left: shop items grid */}
        <div style={{ flex:1, padding:24, overflowY:'auto' as const }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
            <div style={{ fontSize:13, color:'var(--ink-mute)' }}>라운드 {activeSlot.currentRound} 상점</div>
            <button
              className="arena-btn"
              style={{ opacity: canReroll ? 1 : 0.35, cursor: canReroll ? 'pointer' : 'not-allowed', fontSize:13 }}
              disabled={!canReroll}
              onClick={() => rerollShop(randomSeed())}
            >
              🎲 리롤 ({SHOP_REROLL_COST} G)
            </button>
          </div>

          {shopItems.length === 0 ? (
            <div style={{ color:'var(--ink-mute)', textAlign:'center' as const, padding:'3rem', fontSize:14 }}>모든 아이템 구매 완료</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(160px, 1fr))', gap:14 }}>
              {shopItems.map((item, i) => (
                <ShopCard
                  key={`${item.id}-${i}`}
                  item={item}
                  canAfford={gold >= item.price}
                  onBuy={() => buyItem(item.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: inventory panel */}
        <div style={{ width:260, borderLeft:'1px solid var(--line)', padding:20, display:'flex', flexDirection:'column' as const, gap:14, background:'rgba(10,6,20,.5)', overflowY:'auto' as const }}>
          <div style={{ fontSize:13, fontWeight:700, color:'var(--violet-glow)' }}>인벤토리 ({inventory.length})</div>

          {inventory.length === 0 ? (
            <div style={{ fontSize:12, color:'var(--ink-mute)', textAlign:'center' as const, marginTop:24 }}>아이템 없음</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column' as const, gap:10 }}>
              {(['legend', 'hero', 'rare', 'common'] as ItemTier[]).map(tier =>
                inventoryByTier[tier].length > 0 && (
                  <div key={tier}>
                    <div style={{ fontSize:10, fontWeight:700, color:TIER_COLOR[tier], marginBottom:6, letterSpacing:'.08em' }}>{TIER_LABEL[tier]}</div>
                    <div style={{ display:'flex', flexWrap:'wrap' as const, gap:6 }}>
                      {inventoryByTier[tier].map((def, idx) => (
                        <span key={`${def.id}-${idx}`} style={{ fontSize:11, color:TIER_COLOR[tier], border:`1px solid ${TIER_COLOR[tier]}44`, borderRadius:6, padding:'3px 8px', background:`${TIER_COLOR[tier]}0d` }}>
                          {def.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          <div style={{ marginTop:'auto' }}>
            <button
              className="arena-btn arena-btn-primary"
              style={{ width:'100%', justifyContent:'center', borderRadius:12, padding:'12px 0', fontSize:14 }}
              onClick={leaveShop}
            >
              가챠로 진행 →
            </button>
          </div>
        </div>
      </div>
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
    <div className="arena-shop-card" style={{ display:'flex', flexDirection:'column' as const, gap:10 }}>
      <div>
        <span style={{ fontSize:10, fontWeight:700, color, border:`1px solid ${color}55`, borderRadius:999, padding:'2px 8px' }}>
          {TIER_LABEL[item.tier]}
        </span>
      </div>
      <div style={{ fontSize:14, fontWeight:700, color:'var(--ink)' }}>{item.name}</div>
      <div style={{ fontSize:12, color:'var(--green)', flex:1 }}>{item.description}</div>
      <button
        className="arena-btn arena-btn-primary"
        style={{ opacity: canAfford ? 1 : 0.35, cursor: canAfford ? 'pointer' : 'not-allowed', justifyContent:'center', borderRadius:8, padding:'8px 0', fontSize:13 }}
        disabled={!canAfford}
        onClick={onBuy}
      >
        {item.price} G
      </button>
    </div>
  )
}
