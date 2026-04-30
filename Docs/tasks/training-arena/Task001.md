# Task001 — 기획문서 코드 기준 갱신 + 빌드 오류 수정

**일자**: 2026-05-01

## 요약

코드 실제 구현 기준으로 training-arena 관련 기획 문서 전체를 갱신하고,
누적된 TypeScript 빌드 오류를 수정하여 GitHub Pages 배포를 복구한다.

## 작업 범위

### 기획 문서
| 파일 | 변경 내용 |
|------|----------|
| `Docs/game-platform-plan.md` | §6 개발 규약 추가 (테스트 커버리지 80%+, 태스크 문서 규약) |
| `Docs/training-arena-plan.md` | v0.9.0 갱신 — 골드/보상/점수/스킬수/슬롯/HP회복/UI 테이블 |
| `Docs/training-arena-battle-plan.md` | v0.7.0 갱신 — ATB·데미지·마나·명중 실제 수치 반영 |
| `Docs/training-arena-skill-plan.md` | v0.5.1 갱신 — 스킬 79종·슬롯 6개 반영 |
| `Docs/training-arena-tournament-plan.md` | v0.5.0 갱신 — HP회복 10%·다크호스 +8·tournament_out +4 |

### 코드
| 파일 | 변경 내용 |
|------|----------|
| `src/games/training-arena/types.ts` | `CharacterDef.skills` 튜플→`string[]` (슬롯 최대 6개) |
| `src/games/training-arena/store/useGameStore.ts` | 누락된 `MatchResult` import 추가 |
| `src/games/training-arena/engine/rewardEngine.ts` | 미사용 `REWARD_DARKHORSE` 제거 |
| `src/games/training-arena/__tests__/rewardEngine.test.ts` | 미사용 `REWARD_DARKHORSE` import 제거 |
| `src/games/training-arena/pages/BracketPage.tsx` | `activeSlot` null 체크 추가 |
| `src/games/training-arena/pages/ShopPage.tsx` | `coeffs` 타입 캐스트 수정 |
| `src/games/training-arena/pages/MatchPreviewPage.tsx` | 미사용 변수 제거 |

## 완료 조건

- [x] `npm run build` 통과 (tsc + vite)
- [x] 기획 문서 수치가 코드 상수와 일치
- [x] `git push origin main` 완료 → GitHub Actions deploy 정상 실행
