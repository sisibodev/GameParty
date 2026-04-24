# 🛡️ 배틀 그랑프리 — 아케타입 성장 계수 기획서

> 버전: v0.1 (2026-04-24 최초 작성)
> 상위 문서: [training-arena-plan.md](./training-arena-plan.md)
> 연관 코드: `src/games/training-arena/constants.ts` (`ARCHETYPE_GROWTH_COEFFS`), `src/games/training-arena/engine/statDeriver.ts`

---

## 1. 목적

성장 스탯(HP / STR / AGI / INT / LUK) → 전투 스탯(maxHp / atk / def / spd / crit / eva / maxMana) 변환을 **직업(아케타입)별로 차등** 적용한다.
같은 수치의 성장 스탯이라도 직업에 따라 전투 스탯이 달라져서 각 직업의 정체성과 빌드 방향이 명확해진다.

---

## 2. 아케타입 목록 (8종)

| ID | 이름 | 컨셉 | 주력 성장 스탯 |
|----|------|------|---------------|
| tank      | 탱커   | 높은 체력·방어, 적의 공격을 버텨냄 | HP, STR |
| berserker | 버서커 | 고위험 고보상 딜러, 크리 폭발 | STR, LUK |
| assassin  | 어쌔신 | 빠른 속도·높은 회피 | AGI, LUK |
| ranger    | 레인저 | 원거리 크리 딜러 | AGI, LUK |
| mage      | 마법사 | 마나·스킬 의존 딜러 | INT, STR |
| paladin   | 성기사 | 체력·방어 + 지력으로 생존력 극대 | HP, STR, INT |
| support   | 서포트 | 지력 기반 유틸리티 | INT, LUK |
| warrior   | 워리어 | 균형 잡힌 근접 딜러 | STR, HP |

---

## 3. 계수 정의

```ts
interface ArchetypeCoeffs {
  hp_to_maxHp: number   // HP 성장 1당 maxHp 증가
  str_to_atk:  number   // STR 성장 1당 ATK 증가
  str_to_def:  number   // STR 성장 1당 DEF 증가
  agi_to_spd:  number   // AGI 성장 1당 SPD 증가
  agi_to_eva:  number   // AGI 성장 1당 EVA 증가
  luk_to_crit: number   // LUK 성장 1당 CRIT 증가
  int_to_mana: number   // INT 성장 1당 maxMana 증가
  hp_to_def:   number   // HP → DEF 추가 보너스
  int_to_atk:  number   // INT → ATK 추가 보너스 (마법 공격)
  int_to_spd:  number   // INT → SPD 추가 보너스
  luk_to_eva:  number   // LUK → EVA 추가 보너스
  str_to_crit: number   // STR → CRIT 추가 보너스
  int_to_maxHp:number   // INT → maxHp 추가 보너스
  str_to_spd:  number   // STR → SPD 추가 보너스
}
```

---

## 4. 기본값 (DEFAULT_COEFFS)

```ts
{
  hp_to_maxHp: 10, str_to_atk: 3, str_to_def: 1, agi_to_spd: 2,
  agi_to_eva: 0.5, luk_to_crit: 0.5, int_to_mana: 5,
  hp_to_def: 0, int_to_atk: 0, int_to_spd: 0, luk_to_eva: 0,
  str_to_crit: 0, int_to_maxHp: 0, str_to_spd: 0,
}
```

---

## 5. 아케타입별 계수표 (현재 튜닝값)

> 기본값에서 **변경된 항목만** 표기. 미표기 항목은 DEFAULT와 동일.

### 5.1 tank (탱커)
```
hp_to_maxHp 10, str_to_atk 3.0, str_to_def 1.5, hp_to_def 0.1, str_to_spd 0.3
```
체력·방어 중심. STR이 속도에도 약간 기여해 행동력 보강.

### 5.2 berserker (버서커)
```
hp_to_maxHp 8, str_to_atk 4.0, luk_to_crit 0.7, str_to_crit 0.2
```
STR→ATK 계수가 가장 높음. 크리 폭발을 위한 LUK·STR→크리 추가 보정.

### 5.3 assassin (어쌔신)
```
str_to_atk 2.2, agi_to_spd 2.0, luk_to_crit 0.5, luk_to_eva 0.4
```
기본 스탯이 이미 강해서 STR→ATK 배율을 낮추고 회피 강화로 차별화.

### 5.4 ranger (레인저)
```
luk_to_crit 0.4
```
다른 건 기본값, LUK→CRIT만 소폭 상향 (LOW 구간 탈출).

### 5.5 mage (마법사)
```
str_to_atk 1.5, int_to_mana 8, int_to_atk 1.5, int_to_spd 0.5
```
STR→ATK 크게 낮추고 INT→ATK·SPD·마나를 핵심으로 설정.

### 5.6 paladin (성기사)
```
hp_to_maxHp 12, str_to_atk 2, str_to_def 2, int_to_maxHp 3
```
탱커보다도 체력 계수가 높고 INT가 체력에 기여.

### 5.7 support (서포트)
```
str_to_atk 2.5, luk_to_crit 0.3, int_to_mana 7, int_to_spd 0.3,
luk_to_eva 0.3, int_to_atk 0.4
```
INT 기반 유틸리티, LUK→회피로 생존 보강.

### 5.8 warrior (워리어)
```
str_to_atk 3.5
```
균형형, STR→ATK만 소폭 상향.

---

## 6. 전투 스탯 파생 공식

```
maxHp  = baseMaxHp + hp  * hp_to_maxHp  + int * int_to_maxHp
atk    = baseAtk   + str * str_to_atk   + int * int_to_atk
def    = baseDef   + str * str_to_def   + hp  * hp_to_def
spd    = baseSpd   + agi * agi_to_spd   + int * int_to_spd   + str * str_to_spd
crit   = baseCrit  + luk * luk_to_crit  + str * str_to_crit
eva    = baseEva   + agi * agi_to_eva   + luk * luk_to_eva
maxMana= baseMaxMana + int * int_to_mana
```

`base*`는 캐릭터별 `CharacterDef.baseCombat` 값.

---

## 7. 밸런스 목표

- **초반(R1~R3)**: 직업 간 강함 차이가 크지 않도록. 가챠 운에 따라 누구나 뜰 수 있게.
- **중반(R4~R7)**: 빌드(스탯 편중)에 따라 직업 강점이 드러남.
- **후반(R8~)**: 직업+아이템+스킬 시너지가 최고조. 균형이 약간 무너져도 플레이어 선택으로 극복.

### 현재 체크포인트
- R5 / R10 기준 전 직업이 우승 가능한 승률 편차 (20% 이내 목표).
- 버서커 폭발이 과하지 않도록 str_to_crit 0.2 선에서 억제.
- 마법사 생존력 확보 위해 INT→maxHp 병행.

---

## 8. 튜닝 이력

| 일자 | 변경 | 비고 |
|------|------|------|
| 2026-04-22 | 아케타입별 차등화 최초 도입 (commit e3f9334) | DEFAULT 대비 직업 특성 부여 |
| 2026-04-23 | R5/R10 균형 목표로 계수 재조정 (commit 3b9a6ac) | 전 직업 승률 평탄화 |
| 2026-04-23 | 플레이어 성장 커브 재조정 (commit 4651d08) | 초반 너무 어려움·후반 너무 쉬움 개선 |

---

## 9. 향후 과제

- 각 직업별 **대표 빌드 예시** (어떤 스탯을 얼마나 편중하면 좋은가) 정리
- **아이템 효과 × 계수** 상호작용 검증 (v0.4 아이템 시스템 도입 후)
- 자동 밸런스 시뮬레이터(`scripts/balance-check.ts`)로 승률 검증 자동화
