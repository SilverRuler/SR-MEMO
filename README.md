# 📝 SR-MEMO (Personal Note Server)

Firebase Realtime Database 연동 기반의 개인 메모 시스템입니다. GUI 대쉬보드와 CLI(curl) 환경을 모두 지원합니다.

## 🛠️ 설치 및 배포 (Docker)

가장 안전한 배포 방식은 도커 이미지 외부에서 Firebase 키 파일을 주입하는 것입니다.

```bash
docker run -d \
  -p 1111:1111 \
  -p 2096:2096 \
  -v /path/to/your/firebase-key.json:/usr/src/app/firebase-key.json:ro \
  --name sr-memo \
  --restart always \
  silverruler/sr-memo:latest
```

> **주의**: `/path/to/your/firebase-key.json` 부분을 실제 키 파일이 위치한 절대 경로로 수정하세요.

---

## 🖥️ 사용 방법

### 1. 웹 대쉬보드 (관리용)
- **주소**: `http://YOUR_SERVER_IP:2096`
- **로그인**: Firebase `/auth` 노드에 설정한 ID/PW를 사용하세요.

### 2. 터미널 조회 (curl)
로그인 없이 빠르게 리스트를 확인하거나 상세 내용을 볼 수 있습니다.

- **섹션 리스트 확인**: `curl http://YOUR_SERVER_IP:1111/command`
- **특정 메모 상세 확인**: `curl http://YOUR_SERVER_IP:1111/command/1`

### 3. CLI를 통한 메모 관리 (로그인 불가 시)
`X-SR-TOKEN` 헤더에 비밀번호를 넣어서 사용합니다.

- **메모 추가**:
  ```bash
  curl -X POST \
       -H "X-SR-TOKEN: YOUR_PASSWORD" \
       -H "Content-Type: application/json" \
       -d '{"content":"메모 내용"}' \
       http://YOUR_SERVER_IP:1111/api/memos/command
  ```
- **메모 삭제**:
  ```bash
  curl -X DELETE -H "X-SR-TOKEN: YOUR_PASSWORD" http://YOUR_SERVER_IP:1111/api/memos/command/1
  ```

---

## 🔧 빌드 및 개발

### 환경 설정
`firebase-key.json` 파일이 프로젝트 루트에 존재해야 합니다. (이미지 빌드 시에는 보안을 위해 제외됩니다.)

### 로컬 실행
```bash
npm install
node index.js
```

---

## 🔐 보안 안내
- **도커 이미지 보안**: 현재 도커 허브에 배포된 이미지에는 인증 키가 포함되어 있지 않아 안전합니다. 실행 시 반드시 `-v` 옵션으로 키를 주입해야 합니다.
- **Firebase 권장 규칙**: 콘솔에서 `.read`, `.write` 규칙을 모두 `false`로 설정하여 외부 접근을 차단하세요.
- **비밀번호 관리**: Firebase 콘솔의 `/auth` 노드에서 수시로 로그인 정보를 변경하는 것을 권장합니다.
