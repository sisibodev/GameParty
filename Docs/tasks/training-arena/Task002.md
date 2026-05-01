# Task002 — NPC 성장/보상 수정 + 전술 카드 개편 + UI 다수 개선

**일자**: 2026-05-01

## 요약

NPC 성장 규칙 및 보상 수치 조정, 아키타입 기반 전술 카드 시스템 개편,
그리고 매치 프리뷰·전투창·전투 결과창·대진표·패시브 표기 다수 UI 개선을 진행한다.

---

## Phase 1 — 데이터/로직

### 1-A. NPC 보상 수치 변경 (`constants.ts`)
| 상수 | 기존 | 변경 |
|------|------|------|
| REWARD_DARKHORSE | 8 | 10 |
| REWARD_TOURNAMENT_OUT | 4 | 3 |

### 1-B. 예선 탈락자 보상 추가 (`rewardEngine.ts`)
- NPC 예선 탈락자: 올스탯 +1 (전 스탯 균등, 랜덤 아님)
- 플레이어 예선 탈락 시에는 적용 안 함

### 1-C. 라이벌 성장 공식 수정 (`useGameStore.ts` npcGrowth)
- 기존: `RIVAL_STAT_PER_ROUND * round` (회차 곱셈 누적)
- 변경: `RIVAL_STAT_PER_ROUND` (고정 +5, 회차 무관)

### 1-D. 패시브 효과 타입 한글 매핑
- `execute_bonus` 등 영어 effect.type 한글 표시
- 매핑 테이블 신규 파일 `data/passiveEffectLabels.ts` 로 추가

---

## Phase 2 — 전술 카드 개편

### 설계 원칙
- 기존 8개 카드에 `validFor: string[]` 필드 추가
- 아키타입 전용 카드 6개 신규 추가 (총 14개)
- MatchPreviewPage에서 내 아키타입 기준 필터링

### 아키타입별 카드 목록
| 아키타입 | 카드 |
|---------|------|
| warrior | first_strike, barrier, ambush, potion, last_stand |
| mage | mana_burst, curse, insight, arcane_amplify |
| assassin | first_strike, ambush, insight, shadow_walk |
| tank | barrier, potion, fortress_stance |
| support | mana_burst, curse, potion, holy_aura |
| ranger | first_strike, insight, curse, rapid_shot |
| berserker | first_strike, ambush, last_stand, berserker_fury |
| paladin | barrier, potion, last_stand, holy_aura |

### 신규 카드 6종
| ID | 이름 | 효과 |
|----|------|------|
| berserker_fury | 광폭화 | HP 50% 이하 진입 시 ATK +50%, 받는 피해 +20% |
| arcane_amplify | 마법 증폭 | 마법 ATK +40%, 마법 관통 +20% (전투 내내) |
| shadow_walk | 그림자 걸음 | 회피율 +25%, 첫 3턴 공격 크리 확정 |
| fortress_stance | 요새 자세 | DEF +60%, ATK -15%, HP 자연 회복 2배 |
| holy_aura | 신성 기운 | 매 턴 HP 1.5% 회복, 디버프 지속시간 -1 |
| rapid_shot | 신속 사격 | 상대 회피율 0, 첫 공격 2회 연속 (각 70% 위력) |

---

## Phase 3 — UI 개선

### 3-A. 매치 프리뷰 (`MatchPreviewPage.tsx`)
1. 스탯 카드: hp/atk/def → 베이스 스탯 (바이탈/힘/민첩/지력/행운)
2. 통산전적 위: HP·MP 프로그레스바 추가
3. 프로그레스바 아래: 공격(물리/마법)/방어/속도/크리율/회피율
4. 최고기록 버그: `bestClearRound` null 처리 로직 수정

### 3-B. 전투창 (`BattlePage.tsx` + `tournamentEngine.ts`)
1. MP 최대치 초과 클램프 확인 및 수정
2. 예선전 경기 간 HP 회복 로직 제거
3. 캐릭터 패널 아래 전술 이름/효과 표시
4. `DODGE` → `회피`, `CRIT` → `크리`
5. 주요 폰트 크기 +2

### 3-C. 전투 결과창 (`MatchResultPage.tsx`)
1. 액티브 스킬 이름 색상: 노란색 → 스킬 등급 색
2. 내 액티브 스킬 목록 이름 색상: 등급 색
3. 패시브 스킬 색상: 가시성 개선 (액티브와 다른 색)
4. 섹션 타이틀 폰트 크기 20

### 3-D. 대진표 (`BracketPage.tsx`)
1. `title` 속성 제거 → 커스텀 툴팁 컴포넌트
2. 툴팁 순서: ① 베이스 스탯 → ② 전투 스탯 → ③ 기존 전적/스킬

---

## 변경 파일 목록

| 파일 | 내용 |
|------|------|
| `constants.ts` | REWARD_DARKHORSE 10, REWARD_TOURNAMENT_OUT 3 |
| `rewardEngine.ts` | 예선 탈락 올스탯 +1 |
| `useGameStore.ts` | npcGrowth 라이벌 공식 고정 |
| `data/tacticCards.ts` | validFor 추가, 신규 카드 6종 |
| `data/passiveEffectLabels.ts` | 패시브 효과 한글 매핑 (신규) |
| `pages/MatchPreviewPage.tsx` | 스탯 재구성, 카드 필터, 버그 수정 |
| `pages/BattlePage.tsx` | 한글화, 폰트, 전술 표시, MP 클램프 |
| `engine/tournamentEngine.ts` | qualifier HP regen 제거 |
| `pages/MatchResultPage.tsx` | 스킬 색상, 타이틀 폰트 |
| `pages/BracketPage.tsx` | 커스텀 툴팁 |

---

## 완료 조건

- [ ] `npm run build` 통과
- [ ] 라이벌 NPC 성장: 회차 무관 고정 +5
- [ ] 전술 카드: 아키타입 기준 필터링 동작
- [ ] 매치 프리뷰: 베이스 스탯 + HP/MP 바 + 전투 스탯 표시
- [ ] 전투창: 회피/크리 한글, 전술 표시, HP regen 제거
- [ ] 결과창: 스킬 등급 색상 적용, 타이틀 폰트 20
- [ ] 대진표: 커스텀 툴팁 (베이스→전투→전적)
