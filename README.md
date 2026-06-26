# 망상리조트 알림 대시보드

콘솔 모니터링 코드가 감지한 취소/예약가능 정보를 로컬 서버로 보내고, 웹 대시보드에서 확인하는 A안 구조입니다.

## 로컬 실행

```powershell
cd C:\Users\User\Documents\Codex\2026-06-23\goek\dashboard
node server.js
```

브라우저에서 확인:

```txt
http://localhost:3000
```

## 콘솔 수집기 사용

1. 대시보드 서버를 먼저 켭니다.
2. 망상 예약 페이지를 엽니다.
3. 개발자도구 콘솔에 `collector-console.js` 내용을 전체 붙여넣습니다.
4. 대시보드가 3초마다 자동 갱신됩니다.

## Render 배포

GitHub 저장소 루트에 `server.js`가 있는 구조로 배포할 때는 아래처럼 설정합니다.

- Root Directory: 비워두기
- Build Command: 비워두기
- Start Command: `node server.js`
- Environment: Node

배포 후에는 `collector-console.js` 상단의 값을 Render 주소로 바꿉니다.

```js
const DASHBOARD_URL = "https://내주소.onrender.com";
```
