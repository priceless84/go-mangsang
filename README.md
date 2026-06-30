# 망상리조트 알림 대시보드

콘솔/NAS 수집기가 감지한 취소 진행 시설을 `/api/report`로 보내고, Render 대시보드에서 확인하는 구조입니다.

## 이번 수정 내용

- 콘솔 수집기가 `MA` 예약코드만 조회하던 문제를 수정했습니다.
- 든바다/난바다/허허바다/자동차 전체 예약코드를 조회합니다.
- 대시보드 업로드용 `collector-console.js`와 `public/collector-console.js`를 동일하게 수정했습니다.
- 조회 간격을 5초에서 15초로 조정해 과도한 요청을 줄였습니다.

## Render 배포

- Root Directory: 비워두기
- Build Command: 비워두기
- Start Command: `node server.js`
- Environment: Node

## 콘솔 수집기 사용

1. Render 배포 후 대시보드를 엽니다.
2. 망상 예약 페이지를 엽니다.
3. 개발자도구 콘솔에 `collector-console.js` 전체 내용을 붙여넣습니다.
4. 대시보드는 3초마다 자동 갱신됩니다.

## 중지 명령

```js
stopWatchAll()
```

## 기록 리셋

```js
resetCancelLog()
```
