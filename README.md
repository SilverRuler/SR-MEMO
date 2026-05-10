# 📝 SR-MEMO (Personal Note Server)

Firebase Realtime Database 연동 기반의 개인 메모 시스템입니다. GUI 대쉬보드와 CLI(curl) 환경을 모두 지원하여 어떤 환경에서든 빠른 메모 조회 및 관리가 가능합니다.

## 🚀 주요 기능
- **멀티 디바이스 지원**: 브라우저(대쉬보드) 및 터미널(curl) 동시 지원
- **Firebase 연동**: 데이터 유실 걱정 없는 클라우드 저장 방식
- **동적 섹션 관리**: 섹션(태그) 생성, 수정, 삭제 가능
- **CLI 관리**: GUI 없이 터미널만으로 메모 추가/삭제 가능 (API Key 인증)

---

## 🛠️ 설치 및 배포 (Docker)

가장 빠른 방법은 도커를 사용하는 것입니다.

```bash
docker run -d \
  -p 1111:1111 \
  -p 2096:2096 \
  --name sr-memo \
  --restart always \
  silverruler/sr-memo:latest
```

- **API Port**: 1111 (조회 및 CLI 관리)
- **UI Port**: 2096 (웹 대쉬보드)

---

## 🖥️ 사용 방법

### 1. 웹 대쉬보드 (관리용)
- **주소**: `http://YOUR_SERVER_IP:2096`
- **로그인**: `ID: aa` / `PW: bb` (Firebase `/auth` 노드에서 수정 가능)
- **기능**: 섹션 관리, 메모 작성/삭제, 실시간 동기화

### 2. 터미널 조회 (curl)
로그인 없이 빠르게 리스트를 확인하거나 상세 내용을 볼 수 있습니다.

- **섹션 리스트 확인**:
  ```bash
  curl http://YOUR_SERVER_IP:1111/command
  ```
- **특정 메모 상세 확인**:
  ```bash
  curl http://YOUR_SERVER_IP:1111/command/1
  ```

### 3. CLI를 통한 메모 관리 (로그인 불가 시)
대쉬보드에 접속할 수 없는 환경에서는 `X-SR-TOKEN` 헤더(비밀번호)를 사용하여 관리 기능을 수행합니다.

- **메모 추가 (POST)**:
  ```bash
  curl -X POST \
       -H "X-SR-TOKEN: bb" \
       -H "Content-Type: application/json" \
       -d '{"content":"터미널에서 작성한 메모"}' \
       http://YOUR_SERVER_IP:1111/api/memos/command
  ```
- **메모 삭제 (DELETE)**:
  ```bash
  curl -X DELETE \
       -H "X-SR-TOKEN: bb" \
       http://YOUR_SERVER_IP:1111/api/memos/command/1
  ```

---

## 🔧 빌드 및 개발

### 환경 설정
`firebase-key.json` 파일이 프로젝트 루트에 존재해야 합니다.

### 로컬 실행
```bash
npm install
node index.js
```

### 도커 빌드
```bash
docker build -t silverruler/sr-memo .
```

---

## 🔐 보안 안내
- 이 프로젝트는 개인용으로 설계되었습니다.
- `firebase-key.json`은 절대로 외부에 노출되지 않도록 주의하세요.
- 기본 비밀번호(`bb`)는 Firebase 콘솔의 `/auth/pw`에서 즉시 변경하는 것을 권장합니다.
