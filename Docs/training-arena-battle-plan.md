# ⚔️ 육성 전투 시뮬레이션 — 전투 시뮬레이션 기획서

> 버전: v0.7.0 (물리·마법 분리 공식 — 코드 기준 갱신)
> 최초 작성: 2026-04-23 / 최종 갱신: 2026-04-30
> 상태: 구현 완료
> 상위 기획서: [training-arena-plan.md](./training-arena-plan.md)

---

## 1. 개요

### 1.1 목적
- 자동 전투의 **결정론적 규칙** 정의
- 스탯 + 스킬 + 확률 판정이 어떻게 승패로 이어지는지 명확화
- 시각화(PixiJS)와 로그 기록의 기반 제공

### 1.2 기본 원칙
- 100% **자동 전투** (플레이어 개입 없음)
- 턴제 (공격속도 기반 행동 순서)
- **시드 기반 결정론** — 동일 시드면 동일 결과 (리플레이·디버그 목적)
- 전투 로그는 매 액션 단위로 기록

---

## 2. 전투 구조

### 2.1 전투 형식
- **1:1 단판** (기본) — 예선 / 본선 / 토너먼트 공통
- 다수전은 스킬의 `전체 적` 대상에만 영향 (2인전이어도 단일 타겟)
- 무승부 방지 규칙: MAX_TURNS(50) 초과 시 **HP% 높은 쪽 승리**, 동률이면 공격력 높은 쪽

### 2.2 전투 흐름

```
[전투 시작]
  ↓
1. 초기화
   - HP = maxHp, 마나 = maxMana × 50% (INITIAL_MANA_RATIO)
   - 버프/디버프 초기화, 쿨타임 0, ATB 게이지 0
   - 패시브 전투 시작 효과 적용 (stat_boost, battle_focus 등)
   - 전술 카드 효과 적용 (`tacticCards.ts`의 `effect.kind`와 카드별 수치 사용)
  ↓
2. ATB 루프
   - 매 tick: 각 캐릭터 gauge += spd (SPD 기반)
   - 속도 차이 과도 감쇠: effective = 1 + log₂(raw_ratio)
   - gauge ≥ 100 도달한 캐릭터 행동 (동시면 시드 기반 처리)
   - 행동 후 gauge = 0 리셋
  ↓
3. 행동 페이즈
   ├─ 턴 패시브 효과 적용 (regen, berserker_rage, last_stand_spd)
   ├─ 버프/디버프 지속시간 -1
   ├─ 스킬 or 일반 공격 선택
   ├─ 피격 처리 (명중→회피→크리→데미지→반사)
   ├─ 사망 체크 (HP ≤ 0 또는 iron_will 발동)
   └─ HP 자연 회복 (maxHp × 0.8% per tick, HP_REGEN_PER_TURN_RATIO)
  ↓
4. 종료 조건
   - 한쪽 HP 0 → 상대 승리
   - MAX_TURNS(50) 초과 → HP% 비교
  ↓
[전투 종료]
  - MatchResult 생성 (log, initialHp/Mana, winnerId 등)
  - 경기 사이 HP 회복: maxHp × 10% (INTER_MATCH_HP_REGEN_RATIO)
```

---

## 3. 행동 순서 (턴 시스템)

### 3.1 행동 게이지 방식 (ATB)
```
- MAX_ATB_GAUGE = 100
- 모든 캐릭터 gauge 0에서 시작 (`initiative` 계열 전술 카드 선택 시 카드별 ATB로 시작)
- 매 tick: gauge += spd
- gauge ≥ 100 도달 시 해당 캐릭터 행동
- 행동 후 gauge = 0 리셋
```

### 3.2 속도 차이 감쇠 (과도한 속도 격차 방지)
```
raw_ratio = faster_spd / slower_spd
effective_ratio = 1 + log₂(raw_ratio)
예) 2배 속도 → effective 2.0, 4배 → 3.0, 8배 → 4.0
```
빠른 캐릭터가 일방적으로 압도하는 것을 방지.

### 3.3 동시 발동 처리
- 같은 tick에 여러 캐릭터가 100 도달 → 시드 기반 랜덤 처리

---

## 4. 액션 유형

### 4.1 일반 공격
- 조건: 마나 부족 or 쿨타임 대기 or 적극성 판정 실패
- 데미지: 배율 1.0 적용 (아래 데미지 공식 참조)
- 마나 회복 (턴당): `maxMana × (maxHp + INT) × 0.001` (MANA_REGEN_COEFF)

### 4.2 스킬 사용
- 조건: 마나 ≥ cost, 쿨타임 0, 적극성 판정 통과
- 발동률: `50% + 적극성 × 0.5%` (최대 100%)
- 효과는 스킬 기획서 §4 참조

### 4.3 방어 (자동)
- 별도 액션 아님 — 피격 시 방어력/회피로 반영

---

## 5. 피격 판정 순서

```
1. 명중 판정
   hitChance = clamp(acc - eva, MIN_HIT_CHANCE(10), 100)
   - acc: 시전자 명중률 (AGI 기반, 기본 80)
   - eva: 수비자 회피율 (단, 공격자 SPD × 0.3 만큼 차감 — AGI_EVA_COUNTER_COEFF)
   실패 시 "evade" 로그, 데미지 0
  ↓
2. 크리티컬 판정
   성공 시 critDmg 배율 적용 (1.5 + LUK × 0.001, 최대 3.0 — CRIT_BASE_MULTIPLIER)
   예) LUK 0 → 1.5배 / LUK 500 → 2.0배 / LUK 1500 → 3.0배
  ↓
3. 데미지 계산 (v0.7.0 물리·마법 분리 ATK 경쟁 구조)
   base = multiplier × ATK² / (ATK + oppATK)
   final = base × K / (K + effectiveDef × (1 - pen))
   K = DAMAGE_DEF_K = 400
   최소 MIN_DAMAGE(1) 보장

   물리 스킬: pAtk vs oppPAtk, oppPDef 사용
   마법 스킬: mAtk vs oppMAtk, oppMDef 사용
  ↓
4. 전술 카드·버프 감쇠
   - barrier: 첫 피격 데미지 × 0.3 (70% 감소)
   - 방어 버프 효과 적용
  ↓
5. 반사 처리 (thorns 패시브)
   반사 데미지 = 원래 데미지 × thorns_pct (시전자에게 되돌림)
  ↓
6. HP 차감 + iron_will 체크 (1회 사망 방지)
   + DoT (독 단검 중독) 처리
```

---

## 6. 상태이상 / 버프 시스템

### 6.1 중첩 규칙
| 유형 | 같은 효과 중첩 | 다른 효과 |
|------|----------------|----------|
| 버프 | **덮어쓰기 (지속시간 갱신)** | 공존 |
| 디버프 | **덮어쓰기 (더 강한 값 우선)** | 공존 |
| DoT/HoT | **스택 (최대 5)** | 공존 |

### 6.2 지속시간 감소 타이밍
- 턴 시작 시 -1
- 0 도달 → 해당 턴 효과까지 발동 후 제거

### 6.3 해제 조건
- `완전 회복` 같은 정화 스킬
- 전투 종료 (다음 경기로 이월되지 않음)

---

## 7. 마나 시스템

### 7.1 초기 마나
- 전투 시작 시: 최대 마나 × 50% (INITIAL_MANA_RATIO = 0.5)
- mana_burst 카드: +100% 추가 (전투 시작)

### 7.2 턴당 회복
```
마나 회복 = maxMana × (maxHp + INT) × 0.001   // MANA_REGEN_COEFF
예) maxMana 200, maxHp 100, INT 50 → 턴당 30 회복
```
- mana_burst 카드 효과 중: 리젠 × 1.5 (5턴간)

### 7.3 스킬 사용 실패
- 마나 부족 시 스킬 슬롯 스킵 → 일반 공격
- 쿨타임 중 스킬은 선택 풀에서 제외

---

## 8. 적극성과 스킬 선택

### 8.1 적극성 판정
- 매 턴 행동 시점에 확률 판정
- 성공 → 스킬 사용 시도 / 실패 → 일반 공격

### 8.2 스킬 선택 알고리즘
```
사용 가능 스킬 = 쿨타임 0 + 마나 충족
  ↓
priority 낮은 순 정렬
  ↓
동일 priority 내에서 가중치 랜덤:
  - 일반: 1
  - 희귀: 2
  - 영웅: 4
  - 전설: 8
  ↓
선택된 스킬 발동
```

### 8.3 조건부 트리거
- `불굴의 의지`: HP 20% 이하 시 자동 발동 (적극성 무관)
- `반격 태세`: 피격 시 조건 충족하면 자동 반격
- 조건부 스킬은 priority 0으로 최우선 처리

---

## 9. 결정론과 시드

### 9.1 시드 사용 범위
- 전투 시작 시 시드 생성 (대회 ID + 경기 번호)
- 모든 랜덤(명중/크리/적극성/스킬선택)에 동일 RNG 사용
- 리플레이·디버그 시 동일 시드로 재현

### 9.2 RNG 구현
- xorshift32 또는 Mulberry32 등 가벼운 PRNG
- 전역 `Math.random` 사용 금지

---

## 10. 전투 로그

### 10.1 액션 로그 구조
```json
{
  "turn": 3,
  "actor": "char_042",
  "action": "skill",
  "skillId": "atk_05",
  "target": "char_017",
  "damage": 127,
  "critical": true,
  "evaded": false,
  "hpAfter": { "char_017": 345 }
}
```

### 10.2 용도
- 전투 시각화 재생 (PixiJS에서 로그 순차 재생)
- 결과 화면의 하이라이트 추출
- 디버그/밸런스 분석

---

## 11. 시각화 (PixiJS)

### 11.1 연출 요소
- 캐릭터 스프라이트 2체 좌우 배치
- HP/마나 바 (상단)
- 스킬 사용 시 이펙트 + 스킬명 팝업
- 데미지 숫자 플로팅 (크리는 더 크게)
- 버프/디버프 아이콘 스택

### 11.2 재생 속도
- 기본 1x / 2x / 4x / 스킵 (즉시 결과)
- 시뮬레이션 모드는 스킵 기본값

---

## 12. Firestore 스키마 (전투 결과)

```
/matches/{matchId}
  - tournamentId: string
  - round: "예선" | "본선" | "토너먼트" | "결승"
  - seed: number
  - attacker: charId
  - defender: charId
  - winner: charId
  - totalTurns: number
  - createdAt: timestamp (ISO 8601)

/matches/{matchId}/log/{turnIndex}
  - turn, actor, action, skillId, target
  - damage, critical, evaded, hpAfter
```

---

## 13. 밸런스 튜닝 포인트

| 변수 | 기본값 | 영향 |
|------|--------|------|
| 데미지 공식 | ATK²/(ATK+oppATK) × K/(K+DEF), K=400 | ATK 경쟁 구조 — 방어가 완전 무력화되지 않음 |
| 크리 배율 | 1.5 + LUK × 0.001 (cap 3.0) | LUK 스탯이 배율에 영향 |
| HP 자연 회복 | maxHp × 0.008 per tick | 장기전에서 탱커 유리 |
| 경기 간 HP 회복 | maxHp × 10% | 연속 경기 체력 관리 |
| 마나 회복 계수 | 0.001 | 낮추면 스킬 사용 간격 증가 |
| 최대 턴 수 | 50 (MAX_TURNS) | 장기전 방지 |
| 속도 감쇠 | 1 + log₂(ratio) | 속도 격차 완화 |
| 최소 명중률 | 10% (MIN_HIT_CHANCE) | 회피 캐릭 완전 무적 방지 |

---

## 14. 미결 사항 (TODO)

- [x] 데미지 공식 확정 — ATK²/(ATK+oppATK) × K/(K+DEF), K=400 (v0.7.0)
- [x] 크리 대미지 확정 — `1.5 + LUK×0.001` (cap 3.0)
- [x] 명중/회피 공식 — clamp(acc-eva, 10, 100), AGI EVA 역보정 적용
- [x] 패시브 전투 적용 — thorns, lifesteal, iron_will 등 구현
- [x] 직군별 전술 카드 64장 적용 (battleEngine.ts + tacticCards.ts)
- [x] ATB 속도 감쇠 — 1 + log₂(ratio)
- [x] ReplayPage 구현 — 전투 로그 재생
- [ ] 시뮬레이션 모드 배치 전투 속도 최적화
- [ ] 리플레이 공유 기능 (시드 + 캐릭터 상태 스냅샷)

---

## 15. 관련 문서

- [메인 기획서](./training-arena-plan.md)
- [캐릭터 기획서](./training-arena-character-plan.md)
- [스킬 기획서](./training-arena-skill-plan.md)

---

*이 문서는 전투 시뮬레이션 상세 기획서이며, 스탯/스킬 수치는 상위 기획서와 스킬 기획서를 참고한다.*
