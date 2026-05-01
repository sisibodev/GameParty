# GamePlane — 개발 규칙

## 게임 개발 버전 플래그

### 규칙
새 게임이 아직 개발/프로토타입 단계일 때는 `games.ts`에서 `devOnly: true`를 설정한다.
`devOnly: true` 게임은 로컬 개발 환경(`import.meta.env.DEV`)에서만 로비에 표시되고 라우트에 등록된다.
프로덕션 빌드에서는 목록에서 완전히 숨겨지며 URL 직접 접근도 차단된다.

### 적용 방법
```typescript
// src/data/games.ts
{
  id: 'my-new-game',
  devOnly: true,   // 로컬에서만 보임
  enabled: true,
  ...
}
```

### 프로덕션 준비 완료 시
`devOnly: true`를 제거하거나 `devOnly: false`로 변경한다.
