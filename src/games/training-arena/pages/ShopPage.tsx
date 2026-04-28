import { useState, useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import type { ItemDef, ItemTier, ItemKind, GrowthStats } from '../types'
import { randomSeed } from '../utils/rng'
import { getItemById, sumGoldMultiplier } from '../data/items'
import { SHOP_REROLL_COST, MAX_INVENTORY_SIZE } from '../constants'
import HeaderBar from '../components/ui/HeaderBar'
import '../styles/arena.css'

type FilterKey = 'all' | 'stat' | 'combat'

const TIER_COLOR: Record<ItemTier, string> = {
  common: '#9aa3b2',
  rare:   '#67e8f9',
  hero:   '#c78bff',
  legend: '#ffd66b',
}

const TIER_LABEL: Record<ItemTier, string> = {
  common: 'COMMON',
  rare:   'RARE',
  hero:   'HERO',
  legend: 'LEGEND',
}

const KIND_LABEL: Record<ItemKind, string> = {
  stat:    '영구 스탯',
  combat:  '전투 발동',
  utility: '유틸리티',
}

const STAT_ICON: Record<string, string> = {
  hp: '💗', str: '⚔️', agi: '👟', int: '🔮', luk: '🍀',
}

const COMBAT_ICON: Record<string, string> = {
  poison_dagger: '🗡️',
  mana_seal:     '⛓️',
  vampire_ring:  '💍',
  indomitable:   '🛡️',
  golden_glove:  '🧤',
}

function getItemIcon(item: ItemDef): string {
  if (item.kind === 'stat' && item.statBonus) {
    const key = Object.keys(item.statBonus)[0]
    return STAT_ICON[key] ?? '📦'
  }
  return COMBAT_ICON[item.id] ?? '📦'
}

const STAT_DISPLAY: Array<[keyof GrowthStats, string]> = [
  ['hp', 'HP'], ['str', 'STR'], ['agi', 'AGI'], ['int', 'INT'], ['luk', 'LUK'],
]

interface TooltipItem {
  def: ItemDef
  x: number
  y: number
}

export default function ShopPage() {
  const { activeSlot, shopItems, enterShopPhase, buyItem, leaveShop, rerollShop, setPhase } = useGameStore()
  const [filter, setFilter] = useState<FilterKey>('all')
  const [tooltip, setTooltip] = useState<TooltipItem | null>(null)

  useEffect(() => {
    if (shopItems.length === 0) enterShopPhase(randomSeed())
  }, [])

  if (!activeSlot) return null

  const gold      = activeSlot.gold ?? 0
  const inventory = activeSlot.inventory ?? []
  const canReroll = gold >= SHOP_REROLL_COST

  const filteredItems = shopItems.filter(item => {
    if (filter === 'all')    return true
    if (filter === 'stat')   return item.kind === 'stat'
    if (filter === 'combat') return item.kind === 'combat' || item.kind === 'utility'
    return true
  })

  const inventoryIds = inventory.map(i => i.itemId)

  const accStats: Partial<Record<keyof GrowthStats, number>> = {}
  for (const id of inventoryIds) {
    const def = getItemById(id)
    if (def?.statBonus) {
      for (const [k, v] of Object.entries(def.statBonus)) {
        const key = k as keyof GrowthStats
        accStats[key] = (accStats[key] ?? 0) + (v ?? 0)
      }
    }
  }

  const goldMult = sumGoldMultiplier(inventoryIds)
  const goldPct  = Math.round((goldMult - 1) * 100)

  // 5칸씩 확장: 4개 차면 10칸, 9개 차면 15칸 …
  const slotCount = Math.min(
    MAX_INVENTORY_SIZE,
    Math.max(5, Math.ceil((inventory.length + 1) / 5) * 5),
  )

  const hasEffects = STAT_DISPLAY.some(([k]) => (accStats[k] ?? 0) > 0) || goldPct > 0

  return (
    <div className="arena-bg" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <HeaderBar subtitle="TRAVELING SHOP" round={activeSlot.currentRound} gold={gold} onExit={() => { if (confirm('메인 화면으로 나가시겠습니까?\n현재까지의 진행은 저장되어 있습니다.')) useGameStore.setState({ phase: 'slot_select' }) }} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Left 7 ────────────────────────────────────────── */}
        <div style={{ flex: 7, padding: 24, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', letterSpacing: '-.01em' }}>
                떠들이 상인의 좌판
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', marginTop: 4 }}>
                오늘 풀린 {shopItems.length}개 품목 중 원하는 것을 골라라.&nbsp;
                인벤토리 {inventory.length} / {MAX_INVENTORY_SIZE}.
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {(['all', 'stat', 'combat'] as FilterKey[]).map(f => (
                <button
                  key={f}
                  className="arena-btn"
                  style={{
                    fontSize: 12, padding: '6px 14px', borderRadius: 999,
                    background: filter === f ? 'var(--violet)' : 'transparent',
                    color: filter === f ? '#fff' : 'var(--ink-dim)',
                    border: `1px solid ${filter === f ? 'var(--violet)' : 'var(--line)'}`,
                  }}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? '전체' : f === 'stat' ? '스탯' : '전투발동'}
                </button>
              ))}
              <button
                className="arena-btn"
                style={{
                  fontSize: 12, padding: '6px 14px',
                  opacity: canReroll ? 1 : 0.35,
                  cursor: canReroll ? 'pointer' : 'not-allowed',
                }}
                disabled={!canReroll}
                onClick={() => rerollShop(randomSeed())}
              >
                🎲 리롤 ({SHOP_REROLL_COST} G)
              </button>
            </div>
          </div>

          {/* Item grid */}
          {filteredItems.length === 0 ? (
            <div style={{ color: 'var(--ink-mute)', textAlign: 'center', padding: '3rem', fontSize: 14 }}>
              {shopItems.length === 0 ? '모든 아이템 구매 완료' : '해당 종류의 아이템 없음'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
              {filteredItems.map((item, i) => (
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

        {/* ── Right 3 ───────────────────────────────────────── */}
        <div style={{
          flex: 3, borderLeft: '1px solid var(--line)', padding: 20,
          display: 'flex', flexDirection: 'column', gap: 16,
          background: 'rgba(10,6,20,.6)', overflowY: 'auto',
        }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ink-mute)', letterSpacing: '.1em', marginBottom: 2 }}>
              MY INVENTORY
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--violet-glow)' }}>
              보유 아이템{' '}
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-mute)' }}>
                ({inventory.length} / {MAX_INVENTORY_SIZE})
              </span>
            </div>
          </div>

          {/* Icon grid — 5열, 슬롯 동적 확장 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 40px)', gap: 6, position: 'relative' }}>
            {Array.from({ length: slotCount }).map((_, idx) => {
              const inv   = inventory[idx]
              const def   = inv ? getItemById(inv.itemId) : undefined
              const icon  = def ? getItemIcon(def) : null
              const color = def ? TIER_COLOR[def.tier] : undefined
              return (
                <div
                  key={idx}
                  style={{
                    width: 40, height: 40, borderRadius: 8,
                    border: `1px solid ${color ?? 'rgba(160,130,255,.18)'}`,
                    background: color ? `${color}18` : 'rgba(255,255,255,.03)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, cursor: def ? 'default' : undefined,
                  }}
                  onMouseEnter={def ? (e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                    setTooltip({ def, x: rect.left, y: rect.top })
                  } : undefined}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {icon}
                </div>
              )
            })}
          </div>

          {/* Accumulated effects */}
          <div style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-mute)', marginBottom: 10, letterSpacing: '.05em' }}>
              현재 누적 효과
            </div>
            {hasEffects ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {STAT_DISPLAY.map(([key, label]) => {
                  const val = accStats[key] ?? 0
                  if (val === 0) return null
                  return (
                    <div key={key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: 'var(--ink-dim)' }}>{label}</span>
                      <span style={{ color: 'var(--cyan)', fontWeight: 700 }}>+{val}</span>
                    </div>
                  )
                })}
                {goldPct > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ color: 'var(--ink-dim)' }}>승리 시 골드</span>
                    <span style={{ color: 'var(--gold)', fontWeight: 700 }}>+{goldPct}%</span>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--ink-mute)', textAlign: 'center', marginTop: 8 }}>
                효과 없음
              </div>
            )}
          </div>

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="arena-btn"
              style={{ width: '100%', justifyContent: 'center', borderRadius: 12, padding: '10px 0', fontSize: 13, border: '1px solid var(--violet)', color: 'var(--violet)' }}
              onClick={() => setPhase('skill_enhance')}
            >
              스킬 강화 →
            </button>
            <button
              className="arena-btn arena-btn-primary"
              style={{ width: '100%', justifyContent: 'center', borderRadius: 12, padding: '12px 0', fontSize: 14 }}
              onClick={leaveShop}
            >
              상점 떠나기 →
            </button>
          </div>
        </div>
      </div>

      {tooltip && <InventoryTooltip item={tooltip.def} x={tooltip.x} y={tooltip.y} />}
    </div>
  )
}

interface ShopCardProps {
  item:      ItemDef
  canAfford: boolean
  onBuy:     () => void
}

function InventoryTooltip({ item, x, y }: { item: ItemDef; x: number; y: number }) {
  const color = TIER_COLOR[item.tier]
  const icon  = getItemIcon(item)

  const left = x - 220 < 0 ? x + 50 : x - 220
  const top  = Math.max(8, y - 10)

  return (
    <div style={{
      position: 'fixed', left, top, zIndex: 9999,
      width: 200, pointerEvents: 'none',
      background: 'linear-gradient(180deg,rgba(28,18,54,.98),rgba(16,10,34,.98))',
      border: `1px solid ${color}55`,
      borderRadius: 12, padding: '12px 14px',
      boxShadow: `0 8px 32px rgba(0,0,0,.6), 0 0 0 1px ${color}22`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 22 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.name}</div>
          <span style={{
            fontSize: 9, fontWeight: 700, color,
            border: `1px solid ${color}55`, borderRadius: 999, padding: '1px 6px',
          }}>
            {TIER_LABEL[item.tier]}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink-mute)', marginBottom: 6 }}>{KIND_LABEL[item.kind]}</div>
      <div style={{ fontSize: 12, color: 'var(--green)', lineHeight: 1.5 }}>{item.description}</div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--gold)', fontWeight: 700 }}>● {item.price} G</div>
    </div>
  )
}

function ShopCard({ item, canAfford, onBuy }: ShopCardProps) {
  const color = TIER_COLOR[item.tier]
  const icon  = getItemIcon(item)

  return (
    <div
      className="arena-shop-card"
      style={{
        display: 'flex', flexDirection: 'column', gap: 0,
        padding: 0, overflow: 'hidden',
        border: `1px solid ${color}44`,
      }}
    >
      {/* Image area */}
      <div style={{
        height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(135deg, ${color}28, ${color}08)`,
        fontSize: 36,
      }}>
        {icon}
      </div>

      {/* Info area */}
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{item.name}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, color,
            border: `1px solid ${color}55`, borderRadius: 999,
            padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            {TIER_LABEL[item.tier]}
          </span>
        </div>

        <div style={{ fontSize: 11, color: 'var(--ink-mute)' }}>{KIND_LABEL[item.kind]}</div>
        <div style={{ fontSize: 12, color: 'var(--green)', flex: 1, marginTop: 2 }}>{item.description}</div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 }}>
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: canAfford ? 'var(--gold)' : 'var(--ink-mute)',
            opacity: canAfford ? 1 : 0.5,
          }}>
            ● {item.price}
          </span>
          <button
            className="arena-btn arena-btn-primary"
            style={{
              opacity: canAfford ? 1 : 0.35,
              cursor: canAfford ? 'pointer' : 'not-allowed',
              padding: '5px 14px', borderRadius: 8, fontSize: 12,
            }}
            disabled={!canAfford}
            onClick={onBuy}
          >
            {canAfford ? '구매' : '골드 부족'}
          </button>
        </div>
      </div>
    </div>
  )
}
