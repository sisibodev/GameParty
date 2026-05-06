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

## 로컬 개발 로그인 (Firebase Anonymous Auth)

### 규칙
Firebase가 포함된 프로젝트에서는 로컬 테스트 시 Google 팝업 없이 즉시 로그인할 수 있도록 Dev 익명 로그인 버튼을 LoginPage에 항상 포함한다.

- 버튼은 `import.meta.env.DEV`에서만 렌더링한다 (프로덕션 빌드에서 완전히 제거됨)
- Firebase Anonymous Auth로 실제 UID를 발급받아 RTDB/Firestore 쓰기가 정상 동작한다
- 익명 유저 displayName은 `"Dev User"`로 자동 설정한다

### 적용 방법

**1. Firebase 콘솔 (프로젝트당 한 번)**
Authentication → Sign-in method → Anonymous 활성화

**2. `src/firebase/auth.ts`에 함수 추가**
```typescript
import { signInAnonymously, updateProfile } from 'firebase/auth'

export async function signInAnonymouslyDev(): Promise<void> {
  const result = await signInAnonymously(auth)
  if (!result.user.displayName) {
    await updateProfile(result.user, { displayName: 'Dev User' })
  }
}
```

**3. `src/pages/LoginPage.tsx`에 버튼 추가**
```tsx
const isDev = import.meta.env.DEV

// handleDevLogin 핸들러
async function handleDevLogin() {
  try {
    await signInAnonymouslyDev()
    navigate('/', { replace: true })
  } catch {
    setError('익명 로그인 실패. Firebase 콘솔에서 Anonymous 제공업체를 활성화해주세요.')
  }
}

// JSX — Google 버튼 아래에 추가
{isDev && (
  <button className={styles.devButton} onClick={handleDevLogin}>
    🔧 Dev 익명 로그인 (로컬 전용)
  </button>
)}
```

**4. `src/pages/LoginPage.module.css`에 스타일 추가**
```css
.devButton {
  width: 100%;
  padding: 0.65rem 1.5rem;
  background: rgba(255, 200, 0, 0.08);
  color: #e6be00;
  border: 1px dashed rgba(255, 200, 0, 0.4);
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
}
.devButton:hover:not(:disabled) {
  background: rgba(255, 200, 0, 0.15);
}
```
