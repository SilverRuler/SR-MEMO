# 📝 SR-MEMO Project Summary

이 문서는 **SR-MEMO** 프로젝트의 현재 상태와 인프라 구성을 요약한 파일입니다. 다음 작업 시 이 파일을 참고하여 연속성을 유지하세요.

## 1. 프로젝트 개요
- **목적**: 브라우저(GUI)와 터미널(CLI)에서 동시에 접근 및 관리 가능한 개인용 메모 서버.
- **데이터 저장**: Firebase Realtime Database (실시간 동기화 및 클라우드 영구 보존).
- **보안**: Cloudflare Origin SSL 인증서 기반 HTTPS 통신, Rate Limiting(속도 제한), Firebase 기반 동적 인증.

## 2. 접속 정보 (Cloudflare Proxy 활성 기준)
- **Web Dashboard**: `https://memo.silverruler.xyz:2096`
- **CLI (curl) 조회**: `https://memo.silverruler.xyz:8443/command`
- **관리 API**: `https://memo.silverruler.xyz:8443/api/memos/:section`

## 3. 핵심 기술 스택 및 포트 구성
- **Nginx (Container)**: 외부 관문 (Configurable Domain/IP)
  - `2096 (HTTPS)` -> `sr-memo-app:3001` (UI)
  - `8443 (HTTPS)` -> `sr-memo-app:3000` (API)
- **Node.js (Container)**: 메인 로직 (Responsive UI)
  - `3000`: API 전용 내부 포트
  - `3001`: UI 전용 내부 포트
- **Docker Hub**: `silverruler/sr-memo:latest`

## 4. 보안 및 인증 체계
- **대쉬보드 로그인**: Firebase `/auth` 노드에서 ID/PW 검증 (초기값: `aa`/`bb`).
- **CLI 인증**: 요청 헤더에 `X-SR-TOKEN: [PW]` 포함 시 관리 기능(추가/삭제) 허용.
- **보안 조치**: 
  - 1시간 내 로그인 10회 실패 시 IP 차단.
  - 15분 내 API 요청 100회 초과 시 제한.
  - 도커 이미지 내부에 Secret 파일 포함 안 됨 (Runtime 주입 방식).

## 5. 서버 이전 및 복구 (Migration)
- **핵심 파일**: `/root/memo/memo.tar` (절대 유실 주의)
- **포함 파일**: `firebase-key.json`, `cert.pem`, `key.pem`, `nginx.conf.template`, `docker-compose.yml`, `instruction.txt`
- **복구 방법**:
  ```bash
  tar -xvf memo.tar
  docker compose up -d
  ```

## 6. 도메인 설정 (docker-compose.yml)
- `DOMAIN` 환경변수를 자신의 공인 IP 또는 도메인으로 수정하세요.
- 기본값: `YOUR_PUBLIC_IP`

## 7. 주요 업데이트 (2026-05-11)
- **UI 개선**: 타이틀 변경 (SR-MEMO), 파비콘 적용, 모바일 반응형 뷰 구현.
- **SEO/공유**: 카카오톡/인스타 공유용 메타데이터(OG Tag) 추가.
- **유연성**: Nginx 도메인 설정을 환경변수화하여 배포 편의성 증대.

---
**마지막 작업 일시**: 2026-05-11
**저장소**: https://github.com/SilverRuler/SR-MEMO
