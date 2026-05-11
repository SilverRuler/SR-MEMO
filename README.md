# 📝 SR-MEMO (Personal Note Server)

Firebase Realtime Database 연동 기반의 개인 메모 시스템입니다. GUI 대쉬보드와 CLI(curl) 환경을 모두 지원하며, Cloudflare Proxy 환경에 최적화되어 있습니다.

## 🚀 주요 기능
- **멀티 디바이스 지원**: 브라우저(대쉬보드) 및 터미널(curl) 동시 지원
- **Cloudflare Proxy 지원**: 8443(API), 2096(UI) 포트를 사용하여 보안 프록시 통과
- **Firebase 연동**: 데이터 유실 걱정 없는 클라우드 저장 방식
- **동적 섹션 관리**: 섹션 생성, 수정, 삭제 가능
- **CLI 관리**: GUI 없이 터미널만으로 메모 추가/삭제 가능 (X-SR-TOKEN 인증)

---

## 🛠️ 설치 및 배포 (Docker Compose)

가장 권장되는 방식은 Nginx 리버스 프록시를 포함한 Docker Compose 배포입니다.

### 1. 환경 준비
`firebase-key.json`, `cert.pem`, `key.pem` 파일이 프로젝트 루트에 필요합니다.

### 2. 실행
```bash
docker compose up -d
```

---

## 🖥️ 사용 방법

### 1. 웹 대쉬보드 (UI)
- **주소**: `https://memo.silverruler.xyz:2096`
- **로그인**: Firebase `/auth` 노드에 설정한 ID/PW를 사용하세요. (초기값: aa/bb)

### 2. 터미널 조회 (curl)
로그인 없이 빠르게 리스트를 확인하거나 상세 내용을 볼 수 있습니다.

- **섹션 리스트 확인**:
  ```bash
  curl https://memo.silverruler.xyz:8443/command
  ```
- **특정 메모 상세 확인**:
  ```bash
  curl https://memo.silverruler.xyz:8443/command/1
  ```

### 3. CLI를 통한 메모 관리
`X-SR-TOKEN` 헤더에 비밀번호를 넣어서 사용합니다.

- **메모 추가**:
  ```bash
  curl -X POST \
       -H "X-SR-TOKEN: YOUR_PASSWORD" \
       -H "Content-Type: application/json" \
       -d '{"content":"메모 내용"}' \
       https://memo.silverruler.xyz:8443/api/memos/command
  ```

---

## ☁️ Cloudflare 설정 가이드 (필수)

Cloudflare Proxy(주황색 구름) 환경에서 정상 작동을 위해 아래 설정이 반드시 필요합니다.

### 1. Redirect Rules (무한 루프 방지)
포트 번호 없이 접속했을 때 자동으로 2096으로 보내주는 규칙입니다.

- **When incoming requests match**:
  - `Hostname` equals `memo.silverruler.xyz`
  - **AND** `SSL/HTTPS` equals `Off` (매우 중요: 루프 방지)
- **Then...**:
  - **URL Redirect**: `Dynamic`
  - **Expression**: `concat("https://memo.silverruler.xyz:2096", http.request.uri.path)`
  - **Status Code**: `301`

### 2. SSL/TLS 모드
- `memo.silverruler.xyz` 도메인에 대해 **Full (Strict)** 모드를 사용하세요.

---

## 🔐 보안 안내
- `firebase-key.json` 및 `key.pem`은 절대로 GitHub 등 외부로 유출되지 않도록 주의하세요.
- 도커 이미지 빌드 시 해당 보안 파일들은 자동으로 제외됩니다.
