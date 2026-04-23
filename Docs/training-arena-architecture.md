# Architecture: 배틀 그랑프리 (Battle Grand Prix) — Sprint 1

> 작성일: 2026-04-23
> 범위: Sprint 1 MVP — 시뮬레이션 모드, 텍스트 UI, 전투 엔진, 대회 엔진, 저장소 레이어

---

## Design Decisions

- **게임 ID는 training-arena**: App.tsx 라우트와 src/games/ 폴더 경로에 training-arena를 사용한다.
- **기존 패턴 완전 답습**: cops-and-robbers가 types.ts / engine/ / pages/ / utils/ 구조를 그대로 따른다.
- **SeededRng 로컬 복사**: baseball-umpire/utils/rng.ts의 Mulberry32를 독립 복사한다.
- **엔진은 순수 함수**: runMatch, runTournament는 React와 Firebase에 의존하지 않는다.
- **데이터는 JSON 정적 파일**: 캐릭터 100명, 스킬 60종은 data/ 폴더 JSON으로 번들에 포함한다.
- **IndexedDB 래퍼는 idb 패키지**: 타입 안전하고 Promise 기반이다.
- **Zustand 도입**: 여러 페이지에 걸치는 회차 진행 상태를 전역 스토어로 관리한다.
- **Sprint 1은 텍스트 UI만**: PixiJS 렌더링은 Sprint 3까지 없다.
- **Firestore 슬롯 스키마는 기획서 §11.3 그대로**: /users/{uid}/slots/{1|2|3}

---

## Folder Structure

```
src/games/training-arena/
├── TrainingArenaGame.tsx          # 게임 루트 컴포넌트 (App.tsx에 등록)
├── types.ts                       # 모든 도메인 타입
├── constants.ts                   # 게임 상수
├── data/
│   ├── characters.json            # 오리지널 캐릭터 100명
│   ├── skills.json                # 스킬 60종
│   └── ipCharacters.json          # IP 캐릭터 (시뮬레이션 전용)
├── engine/
│   ├── battleEngine.ts            # runMatch(seed, charA, charB) -> MatchLog
│   ├── gachaEngine.ts             # runGacha(seed, chars, pulls) -> GachaResult[]
│   ├── tournamentEngine.ts        # runTournament(participants, seed) -> TournamentResult
│   ├── statDeriver.ts             # deriveStats(growthStats, baseStats) -> CombatStats
│   └── rewardEngine.ts            # calcRewards(result) -> RewardMap
├── store/
│   └── useGameStore.ts            # Zustand 스토어
├── hooks/
│   ├── useSaveSlot.ts             # Firestore 슬롯 CRUD
│   └── useMatchLog.ts             # IndexedDB matchLogs 읽기/쓰기
├── utils/
│   ├── rng.ts                     # SeededRng (Mulberry32)
│   └── fisherYates.ts             # shuffle(arr, rng) -> T[]
└── pages/
    ├── ModeSelect.tsx
    ├── SlotSelect.tsx
    ├── CharacterSelect.tsx
    ├── StatDistribute.tsx
    ├── GachaScreen.tsx
    ├── TournamentBracket.tsx
    ├── BattleLog.tsx
    └── RewardScreen.tsx
```

---

## Core TypeScript Types

아래는 src/games/training-arena/types.ts에 정의할 타입 청사진이다.

### 성장 스탯 / 전투 스탯

```typescript
export interface GrowthStats { hp: number; str: number; agi: number; int: number; luk: number }
export interface CombatStats { maxHp: number; atk: number; def: number; spd: number; crit: number; evade: number; mana: number; aggro: number }
```

### 캐릭터

```typescript
export interface CharacterDefinition {
  id: string; name: string; archetype: string; isOriginal: boolean; ipId: number | null
  baseStats: CombatStats; description: string
}
export interface CharacterState {
  definition: CharacterDefinition; growthStats: GrowthStats; skillIds: string[]; currentHp: number
}
```

### 스킬

```typescript
export type SkillTier = "common" | "rare" | "hero" | "legend"
export type SkillCategory = "attack" | "defense" | "buff" | "debuff" | "heal" | "special"
export type SkillTarget = "self" | "single" | "all_enemy" | "ally" | "all"
export type SkillTrigger = "turn_start" | "hp_below" | "on_hit" | "active"
export interface SkillDefinition {
  id: string; name: string; tier: SkillTier; category: SkillCategory; target: SkillTarget
  manaCost: number; cooldown: number; priority: number; trigger: SkillTrigger
  triggerValue?: number; effectFormula: string; description: string
}
```

### 전투 로그

```typescript
export type ActionType = "attack" | "skill" | "buff" | "debuff" | "heal" | "dot" | "evade"
export interface TurnAction {
  turn: number; actor: string; action: ActionType; skillId?: string; target: string
  damage: number; critical: boolean; evaded: boolean; hpAfter: Record<string, number>; manaAfter?: Record<string, number>
}
export interface MatchLog {
  matchId: string; seed: number; charA: string; charB: string; winner: string; loser: string; totalTurns: number; actions: TurnAction[]
}
```

### 대회 결과

```typescript
export type TournamentStage = "qualifier" | "group" | "tournament"
export interface GroupResult { groupId: string; players: string[]; rank1: string; rank2: string; eliminated: string[]; matches: MatchLog[] }
export interface BracketRound { round: "16강" | "8강" | "4강" | "결승"; matches: MatchLog[] }
export type RewardMap = Record<string, CharReward>
export interface CharReward { charId: string; statBonus: Partial<GrowthStats>; playerStatPoints?: number; acquiredSkillId?: string }
export interface TournamentResult {
  tournamentId: string; seed: number; qualifiers: string[]; groups: GroupResult[]
  finalists: string[]; bracket: BracketRound[]; winner: string; darkhorses: string[]; rewards: RewardMap
}
```

### 저장 슬롯

```typescript
export type SlotId = 1 | 2 | 3
export interface SaveSlot { slotId: SlotId; characterId: string; growthStats: GrowthStats; skillIds: string[]; currentRound: number; bestClearRound: number | null; createdAt: string; updatedAt: string }
export interface TournamentSummary { tournamentId: string; round: number; winner: string; playerResult: "win" | "tournament" | "group" | "qualifier" | "eliminated"; rewards: CharReward }
export type GamePhase = "mode_select" | "slot_select" | "character_select" | "stat_distribute" | "gacha" | "tournament_bracket" | "battle_log" | "reward" | "history"
export type GameMode = "player" | "simulation"
export type GachaGrade = "C" | "B" | "A" | "S" | "SS" | "SSS"
export interface GachaResult { pullIndex: number; grade: GachaGrade; targetCharId: string; statKey: keyof GrowthStats; statAmount: number; isPlayerChar: boolean }
```

---

## Module Dependency Graph

순환 의존을 방지하기 위해 계층을 엄격하게 지킨다.

```
Layer 0: types.ts, constants.ts  (아무것도 import 안 함)

Layer 1: utils/
  rng.ts              -> (없음)
  fisherYates.ts      -> utils/rng.ts

Layer 2: engine/
  statDeriver.ts      -> types, constants
  battleEngine.ts     -> types, constants, utils/rng, engine/statDeriver
  gachaEngine.ts      -> types, constants, utils/rng
  tournamentEngine.ts -> types, constants, utils/rng, utils/fisherYates, engine/battleEngine
  rewardEngine.ts     -> types, constants

Layer 3: hooks/  [React + 외부 IO]
  useSaveSlot.ts  -> types, src/firebase/config (Firestore)
  useMatchLog.ts  -> types, idb

Layer 4: store/
  useGameStore.ts -> types, engine/*, hooks/*

Layer 5: pages/
  각 페이지        -> types, store/useGameStore  (engine/* 직접 호출 금지)

Layer 6: TrainingArenaGame.tsx -> pages/*, store/useGameStore, types
```

금지 패턴:
- engine/ 이 hooks/ 또는 store/ 를 import하는 것 (React 오염)
- pages/ 가 engine/ 을 직접 호출하는 것 (store를 경유해야 함)
- types.ts 가 다른 모듈을 import하는 것

---

## Data Flow

### 가챠 -> 스탯 적용 -> 대회 실행 -> 결과 저장

```
[사용자: 가챠 시작]
  -> gachaEngine.runGacha(seed, participants, 100) -> GachaResult[]
  -> useGameStore.applyGachaResults() — CharacterState.growthStats 누적 (immutable spread)
  -> tournamentEngine.runTournament(participants, seed)
     내부: Fisher-Yates 셔플 -> 예선 대진 생성
     각 경기: battleEngine.runMatch()
       내부: statDeriver.deriveStats() -> ATB 루프 -> SeededRng -> TurnAction[]
       -> MatchLog
     -> TournamentResult
  -> rewardEngine.calcRewards() -> RewardMap
  -> useMatchLog.saveLogs()      [IndexedDB]
  -> useSaveSlot.saveTournamentSummary()  [Firestore]
```

### 슬롯 로드 흐름

```
TrainingArenaGame 마운트
  -> useSaveSlot.loadSlots(uid) -> Firestore 읽기 -> useGameStore.setSlots()
  -> SlotSelect 렌더링
```

---

## Key Interface Signatures

```typescript
export function runMatch(seed: number, charA: CharacterState, charB: CharacterState): MatchLog
export function runTournament(participants: CharacterState[], seed: number): TournamentResult
export function runGacha(seed: number, participants: CharacterState[], pulls: number): GachaResult[]
export function deriveStats(def: CharacterDefinition, growth: GrowthStats): CombatStats
export function calcRewards(result: TournamentResult, playerCharId: string | null): RewardMap
export function useSaveSlot(): {
  slots: (SaveSlot | null)[]
  loadSlots: (uid: string) => Promise<void>
  saveSlot: (uid: string, slot: SaveSlot) => Promise<void>
  saveTournamentSummary: (uid: string, slotId: SlotId, summary: TournamentSummary) => Promise<void>
  deleteSlot: (uid: string, slotId: SlotId) => Promise<void>
}
export function useMatchLog(): {
  saveLogs: (logs: MatchLog[], tournamentId: string, slotId: SlotId) => Promise<void>
  getLogs: (tournamentId: string) => Promise<MatchLog[]>
}
```

---

## Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| src/games/training-arena/types.ts | 모든 도메인 타입 정의 | P0 |
| src/games/training-arena/constants.ts | 가챠 확률표, 스탯 기본값, 게임 상수 | P0 |
| src/games/training-arena/data/characters.json | 오리지널 캐릭터 100명 데이터 | P0 |
| src/games/training-arena/data/skills.json | 스킬 60종 데이터 | P0 |
| src/games/training-arena/data/ipCharacters.json | IP 캐릭터 초기 4명 | P1 |
| src/games/training-arena/utils/rng.ts | SeededRng Mulberry32 | P0 |
| src/games/training-arena/utils/fisherYates.ts | Fisher-Yates 셔플 | P0 |
| src/games/training-arena/engine/statDeriver.ts | GrowthStats -> CombatStats 파생 | P0 |
| src/games/training-arena/engine/battleEngine.ts | runMatch 핵심 전투 루프 | P0 |
| src/games/training-arena/engine/gachaEngine.ts | 100연 가챠 로직 | P0 |
| src/games/training-arena/engine/tournamentEngine.ts | 예선/본선/토너먼트 오케스트레이션 | P0 |
| src/games/training-arena/engine/rewardEngine.ts | 보상 계산 | P1 |
| src/games/training-arena/hooks/useSaveSlot.ts | Firestore 슬롯 훅 | P1 |
| src/games/training-arena/hooks/useMatchLog.ts | IndexedDB 로그 훅 | P1 |
| src/games/training-arena/store/useGameStore.ts | Zustand 전역 스토어 | P1 |
| src/games/training-arena/pages/ModeSelect.tsx | 모드 선택 텍스트 UI | P2 |
| src/games/training-arena/pages/SlotSelect.tsx | 슬롯 선택 UI | P2 |
| src/games/training-arena/pages/CharacterSelect.tsx | 캐릭터 선택 UI | P2 |
| src/games/training-arena/pages/StatDistribute.tsx | 스탯 분배 UI | P2 |
| src/games/training-arena/pages/GachaScreen.tsx | 가챠 결과 텍스트 UI | P2 |
| src/games/training-arena/pages/TournamentBracket.tsx | 대진표 + 결과 텍스트 | P2 |
| src/games/training-arena/pages/BattleLog.tsx | 단일 경기 로그 뷰 | P2 |
| src/games/training-arena/pages/RewardScreen.tsx | 보상 수령 UI | P2 |
| src/games/training-arena/TrainingArenaGame.tsx | 게임 루트 컴포넌트 | P2 |

---

## Files to Modify

| File | Changes | Priority |
|------|---------|----------|
| src/App.tsx | /game/training-arena/* 라우트 + TrainingArenaGame import 추가 | P2 |
| src/pages/LobbyPage.tsx | 배틀 그랑프리 게임 카드 + 링크 추가 | P2 |
| package.json | idb, zustand 패키지 추가 | P0 |

---

## External Package Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| idb | ^8.x | IndexedDB 타입 안전 래퍼. 전투 로그 저장 |
| zustand | ^5.x | 경량 전역 상태 관리. 회차 진행 상태 공유 |

설치 명령: npm install idb zustand

기존 패키지 (firebase, react-router-dom, pixi.js) 는 이미 설치되어 있다. PixiJS는 Sprint 3까지 사용하지 않는다.

---

## Build Sequence

### Step 1 — 타입 + 상수 (Layer 0)
1. src/games/training-arena/types.ts
2. src/games/training-arena/constants.ts

### Step 2 — 유틸리티 (Layer 1)
3. src/games/training-arena/utils/rng.ts
4. src/games/training-arena/utils/fisherYates.ts

### Step 3 — 데이터 JSON
5. src/games/training-arena/data/characters.json
6. src/games/training-arena/data/skills.json
7. src/games/training-arena/data/ipCharacters.json

### Step 4 — 엔진 (Layer 2, 의존 순서 준수)
8. engine/statDeriver.ts — types, constants만 의존
9. engine/battleEngine.ts — statDeriver, rng 의존
10. engine/gachaEngine.ts — rng 의존
11. engine/tournamentEngine.ts — battleEngine, fisherYates 의존
12. engine/rewardEngine.ts — types, constants만 의존

### Step 5 — 저장소 훅 + 패키지 설치 (Layer 3)
13. npm install idb zustand
14. hooks/useSaveSlot.ts
15. hooks/useMatchLog.ts

### Step 6 — 스토어 (Layer 4)
16. store/useGameStore.ts

### Step 7 — UI 페이지 (Layer 5, 병렬 작업 가능)
17~24. pages/*.tsx (8개 파일 병렬)

### Step 8 — 게임 루트 + 플랫폼 연결 (Layer 6)
25. TrainingArenaGame.tsx
26. src/App.tsx 라우트 추가
27. src/pages/LobbyPage.tsx 게임 카드 추가

### Step 9 — 검증
28. 시뮬레이션 모드로 회차 1회 전체 실행 (텍스트 UI)
29. Firestore 슬롯 저장/로드 확인
30. IndexedDB 전투 로그 저장 확인
31. 동일 시드 재실행 시 동일 결과 확인 (결정론 검증)

---

## constants.ts 핵심 내용 (청사진)

```typescript
export const GACHA_GRADE_TABLE = [
  { grade: "C"   as const, prob: 0.40, amount: 1 },
  { grade: "B"   as const, prob: 0.24, amount: 2 },
  { grade: "A"   as const, prob: 0.14, amount: 3 },
  { grade: "S"   as const, prob: 0.09, amount: 4 },
  { grade: "SS"  as const, prob: 0.07, amount: 5 },
  { grade: "SSS" as const, prob: 0.06, amount: 6 },
]
export const GACHA_PULLS_PER_ROUND = 100
export const BASE_COMBAT_STATS = { maxHp: 20, atk: 10, def: 5, spd: 1, crit: 10, evade: 0, mana: 10, aggro: 5 }
export const CHARACTER_EXTRA_STAT_POINTS = 100
export const PLAYER_INITIAL_STAT_POINTS = 20
export const PLAYER_ROUND_STAT_POINTS = 10
export const MAX_BATTLE_TURNS = 50
export const HP_REGEN_RATIO = 0.3
export const INITIAL_MANA_RATIO = 0.5
export const CRIT_BASE_MULTIPLIER = 1.5
export const CRIT_LUCK_COEFFICIENT = 0.001
export const CRIT_MAX_MULTIPLIER = 3.0
export const AGGRO_BASE_CHANCE = 0.5
export const AGGRO_COEFFICIENT = 0.005
export const MANA_REGEN_COEFFICIENT = 0.001
export const QUALIFIER_TARGET = 32
export const GROUP_COUNT = 8
export const GROUP_SIZE = 4
export const FINALS_SIZE = 16
export const DARKHORSE_RATIO = 0.3
export const MAX_GROWTH_STAT = 9999
export const MAX_PLAYER_SKILLS = 8
export const INDEXEDDB_NAME = "battleGrandPrix"
export const INDEXEDDB_STORE = "matchLogs"
export const INDEXEDDB_VERSION = 1
```

---

## IndexedDB Schema (idb 타입 정의)

```typescript
import { DBSchema } from "idb"
interface BattleGrandPrixDB extends DBSchema {
  matchLogs: {
    key: string
    indexes: { "by-tournament": string; "by-slot": SlotId }
    indexes: { "by-tournament": string; "by-slot": SlotId }
  }
}
```

---

## Zustand Store Shape

```typescript
interface GameStore {
  mode: GameMode | null; setMode: (mode: GameMode) => void
  slots: (SaveSlot | null)[]; activeSlot: SlotId | null
  setSlots: (slots: (SaveSlot | null)[]) => void; setActiveSlot: (id: SlotId) => void
  participants: CharacterState[]
  setParticipants: (chars: CharacterState[]) => void
  applyGachaResults: (results: GachaResult[]) => void
  currentTournament: TournamentResult | null
  setCurrentTournament: (result: TournamentResult) => void
  phase: GamePhase; setPhase: (phase: GamePhase) => void
}
```

---

*이 문서는 Sprint 1 구현의 기준 설계다. Sprint 2 이후 변경사항은 별도 개정판으로 관리한다.*