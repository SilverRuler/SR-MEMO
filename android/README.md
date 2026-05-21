# SR-MEMO Android App

이 폴더는 SR-MEMO를 위한 안드로이드 WebView 앱 소스코드입니다.

## 기능
- `https://memo.silverruler.xyz` 주소를 로드하는 WebView 기반 앱.
- **자동 로그인**: `CookieManager`를 통해 쿠키를 영구적으로 보관하여 한 번 로그인하면 앱 종료 후에도 로그인이 유지됩니다.
- **모바일 최적화**: 서버 측 UI 수정을 통해 모바일 접속 시 섹션 리스트가 기본적으로 펼쳐진 상태로 표시됩니다.

## 빌드 방법
1. 안드로이드 스튜디오(Android Studio)를 실행합니다.
2. `Import Project` 또는 `Open`을 선택하고 이 `android` 폴더를 선택합니다.
3. Gradle 빌드가 완료되면 `Run` 버튼을 눌러 에뮬레이터 또는 실제 기기에서 실행합니다.

## 주의 사항
- `index.js`에서 세션 `maxAge`가 30일로 연장되었습니다. 30일이 지나면 다시 로그인해야 할 수 있습니다.
- 보안을 위해 HTTPS를 사용하며, WebView에서 쿠키를 허용하도록 설정되어 있습니다.
