# SR-MEMO 안드로이드 APK 만드는 법

이 문서는 `memo-server/` 안의 `android/` 프로젝트로부터 SR-MEMO 안드로이드 앱(APK)을 만든 과정과,
다음에 같은 작업(재빌드, URL 변경, 버전 올리기 등)을 다시 할 때 따라가면 되는 단계를 정리한다.

---

## 1. 앱이 하는 일

- `WebView` 한 개를 풀스크린으로 띄워서 메모 대쉬보드 사이트(`HOME_URL`)를 로드하는 것이 전부다.
- 새로 만든 코드/디자인은 없다. **데스크톱 브라우저에서 보는 그 사이트 그대로**를 앱 안에서 보여준다.
- 한 번 로그인하면 명시적으로 로그아웃하기 전까지는 로그인 상태가 유지된다 (자세한 동작은 아래 §4 참고).

> **현재 가리키는 주소:** `https://memo.silverruler.xyz:2096`
> 바꾸려면 `android/app/src/main/java/com/silverruler/srmemo/MainActivity.java`의 `HOME_URL` 상수만 고치면 된다.

---

## 2. 빌드 환경

이 머신에 이미 설치되어 있어서 새로 설치할 건 없었다.

| 도구 | 위치 / 버전 |
| --- | --- |
| JDK | `/usr/bin/java` — OpenJDK 21 |
| Android SDK | `/root/android-sdk` (platforms: android-34/35/36, build-tools: 35.0.0) |
| Gradle | `/root/.gradle/wrapper/dists/gradle-8.14.4-all/.../gradle-8.14.4/bin/gradle` (캐시됨) |
| Android Gradle Plugin (AGP) | 8.13.2 (Maven 캐시에 있던 버전을 그대로 사용) |
| ImageMagick `convert` | 런처 아이콘 리사이즈용 |

`ANDROID_HOME` / `ANDROID_SDK_ROOT` 환경변수가 비어 있을 수 있어서 빌드할 때는 `ANDROID_HOME=/root/android-sdk`를 앞에 붙여줬다.
또는 `android/local.properties`에 `sdk.dir=/root/android-sdk` 한 줄이 들어 있어서 그것만으로도 인식된다.

---

## 3. 안드로이드 프로젝트 구조

```
android/
├── build.gradle              # 루트 - AGP 8.13.2 classpath 선언
├── settings.gradle           # rootProject.name = "SR-MEMO", include ':app'
├── gradle.properties         # JVM 메모리, AndroidX 활성화 옵션
├── local.properties          # sdk.dir 지정 (이 머신 전용, 커밋하지 말 것)
├── gradlew, gradlew.bat      # Gradle Wrapper (8.14.4)
├── gradle/wrapper/           # gradle-wrapper.jar, gradle-wrapper.properties
└── app/
    ├── build.gradle          # applicationId, minSdk 24, targetSdk 34, versionCode/Name
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/silverruler/srmemo/MainActivity.java
        └── res/
            ├── values/strings.xml
            ├── mipmap-mdpi/ic_launcher.png    (48x48)
            ├── mipmap-hdpi/ic_launcher.png    (72x72)
            ├── mipmap-xhdpi/ic_launcher.png   (96x96)
            ├── mipmap-xxhdpi/ic_launcher.png  (144x144)
            └── mipmap-xxxhdpi/ic_launcher.png (192x192)
```

---

## 4. 핵심 코드 — `MainActivity.java`

WebView 하나만 있는 앱이지만, **로그아웃 전까지 계속 로그인 유지** + **섹션에서 뒤로가기 → 섹션 리스트로** + **당겨서 새로고침** 까지 받쳐주려면 몇 가지가 필요하다.

1. **세션 쿠키를 영구 저장하도록 한다.** `CookieManager.setAcceptCookie(true)` + `setAcceptThirdPartyCookies(webView, true)`.
2. **쿠키를 디스크로 flush 한다.** Android의 `CookieManager`는 메모리에만 들고 있다가 앱이 죽으면 날아가는 경우가 있어서,
   - `WebViewClient.onPageFinished()`
   - `Activity.onPause()`
   두 군데에서 `CookieManager.getInstance().flush()`를 호출해 디스크에 강제로 내려쓴다.
3. **회전/배경 전환 때 세션을 잃지 않게 한다.** `onSaveInstanceState`에서 `webView.saveState()`, `onCreate`에서 `restoreState()`.
4. **앱 안에서 링크 열기.** `shouldOverrideUrlLoading`을 오버라이드해서 외부 브라우저로 튀어나가지 않게 한다.
5. **당겨서 새로고침 (Pull-to-Refresh) — 섹션 상태 유지.** `androidx.swiperefreshlayout.widget.SwipeRefreshLayout`으로 `WebView`를 감싼다.
   - `webView.setOnScrollChangeListener(...)`로 `scrollY == 0`일 때만 swipe를 활성화한다. 그래야 메모 리스트를 스크롤 중에 새로고침이 끼어들지 않는다.
   - **단순 `webView.reload()` 은 안 된다.** 대쉬보드가 SPA라서 페이지를 다시 받아오면 페이지 안의 `cur` 변수가 초기화돼 섹션 리스트 상태로 돌아가버린다 (= 사용자가 TEMP 안에 있다가 새로고침하면 TEMP 밖으로 튕긴다).
   - 그래서 두 단계로 처리:
     1. **소프트 새로고침** (`SOFT_REFRESH_JS`): 페이지의 전역 `cur` 가 있으면 페이지에 이미 정의된 `load()` 만 다시 호출한다. `load()` 는 `/api/data` 만 다시 받아와서 같은 자리에 다시 렌더링하므로 `cur` 이 유지된다 → **현재 섹션 안에서 메모 목록만 새로고침**.
     2. `cur` 이 없으면 (= 섹션 리스트 화면이면) 그땐 `webView.reload()` 로 풀 리로드.
   - `load()` 가 비동기(`async function`)이므로 끝나는 시점을 알려면 작은 다리가 필요하다. `webView.addJavascriptInterface(new JsBridge(), "SRMemo")` 로 Android 메서드 `refreshDone()` 을 노출하고, JS 쪽에서 `load().then(SRMemo.refreshDone, SRMemo.refreshDone)` 으로 스피너를 끄게 한다.
   - 안전망으로 4초 타임아웃: 만에 하나 `refreshDone()` 콜백이 안 오면 스피너가 영원히 도는 걸 막는다.
   - 풀 리로드 경로(`webView.reload()`)는 `WebViewClient.onPageFinished()` 에서 스피너를 끈다.
6. **뒤로가기 = 섹션 리스트로 (SPA-aware Back).**
   대쉬보드는 단일 페이지(SPA)다 — 섹션을 눌러도 URL이 안 바뀌므로 `WebView.canGoBack()`이 false이고, 그래서 뒤로가기를 누르면 그냥 앱이 종료돼버린다.
   이걸 막기 위해 `onKeyDown(KEYCODE_BACK)`에서 다음 순서로 처리한다:
     1. `webView.evaluateJavascript(BACK_JS, ...)` 를 호출. `BACK_JS`는 페이지의 전역 `cur` 변수(현재 선택된 섹션)를 확인하고, 값이 있으면 `cur=null`로 두고 메모 영역(`#ui`, `#acts`)을 숨기고 사이드바(`#sidebar`)에 `open` 클래스를 다시 붙여서 "섹션 리스트" 상태로 되돌린 뒤 `"true"`를 리턴.
     2. 콜백이 받은 값이 `"true"`면 그대로 머문다 (섹션 리스트로 돌아간 상태).
     3. `"false"`면 `webView.canGoBack()` 체크 → 진짜 웹 히스토리가 있으면 `goBack()`, 없으면 `finish()` 로 앱 종료.

   이 방식은 서버(`index.js`) 코드는 그대로 두고 Android 쪽에서만 처리한다. 대쉬보드 HTML 안의 변수명(`cur`)/엘리먼트 id(`ui`, `acts`, `title`, `sidebar`)에 의존하므로, 서버 UI를 크게 리팩터하면 `BACK_JS` 를 같이 손봐야 한다.

서버 쪽 `index.js`에서 이미 세션 `maxAge`를 30일로 잡아놨기 때문에, 위의 쿠키 영구 저장과 합쳐지면 사실상 사용자가 "로그아웃" 버튼을 누르기 전까지 로그인이 유지된다.

---

## 5. 매니페스트 — `AndroidManifest.xml`

- `android.permission.INTERNET` (필수)
- `android.permission.ACCESS_NETWORK_STATE` (WebView가 네트워크 상태 체크할 때 경고 줄이는 용도)
- `android:icon` / `android:roundIcon` → `@mipmap/ic_launcher`
- `android:configChanges` 를 넉넉히 잡아서 회전/키보드 변경 등에 액티비티가 재생성되지 않게 한다 (WebView 세션 유지에 유리).
- `android:theme="@android:style/Theme.NoTitleBar"` 로 상단 액션바 제거.
- 주의: AGP 8.x부터는 매니페스트의 `package="..."` 속성이 deprecate 됐기 때문에 빼고, 대신 `app/build.gradle`의 `namespace 'com.silverruler.srmemo'` 가 그 역할을 한다.

---

## 6. 런처 아이콘 만들기

원본 `memo-server/favicon.png` (1161x1168 PNG) 한 장을 ImageMagick으로 5가지 해상도로 리사이즈했다.

```bash
cd android/app/src/main/res
mkdir -p mipmap-mdpi mipmap-hdpi mipmap-xhdpi mipmap-xxhdpi mipmap-xxxhdpi
convert ../../../../../favicon.png -resize 48x48   mipmap-mdpi/ic_launcher.png
convert ../../../../../favicon.png -resize 72x72   mipmap-hdpi/ic_launcher.png
convert ../../../../../favicon.png -resize 96x96   mipmap-xhdpi/ic_launcher.png
convert ../../../../../favicon.png -resize 144x144 mipmap-xxhdpi/ic_launcher.png
convert ../../../../../favicon.png -resize 192x192 mipmap-xxxhdpi/ic_launcher.png
```

---

## 7. Gradle Wrapper 생성

기존 프로젝트에는 `gradle/wrapper/` 폴더만 비어 있고 `gradlew`, `gradle-wrapper.jar` 등이 없었다.
이미 캐시에 있던 Gradle 8.14.4 바이너리로 한 번만 만들어주면 끝.

```bash
cd android
/root/.gradle/wrapper/dists/gradle-8.14.4-all/*/gradle-8.14.4/bin/gradle \
    wrapper --gradle-version 8.14.4 --distribution-type bin
```

이걸 한 번 돌리고 나면 `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, `gradle/wrapper/gradle-wrapper.properties` 가 생성된다.
**이후로는 그냥 `./gradlew` 만 쓰면 된다.**

---

## 8. AGP 버전 맞추기

원래 `build.gradle`에 적혀있던 AGP 8.2.2는 Gradle 8.14와 호환되지 않아서 빌드가 깨진다.
다행히 로컬 Maven 캐시에 AGP **8.13.2** 가 이미 받아져 있어서 그걸 그대로 사용했다.

```gradle
// android/build.gradle
buildscript {
    repositories { google(); mavenCentral() }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.13.2'
    }
}
```

> 나중에 다른 머신에서 빌드한다면, 인터넷이 되는 한 Gradle / AGP는 알아서 받아오므로 큰 문제는 없다.
> 단, AGP ↔ Gradle 호환 표(https://developer.android.com/build/releases/gradle-plugin)는 한 번씩 확인하자.

---

## 9. 빌드 명령

디버그 APK (디버그 키스토어로 자동 서명됨 — 개인 사용에는 충분):

```bash
cd android
ANDROID_HOME=/root/android-sdk ANDROID_SDK_ROOT=/root/android-sdk ./gradlew assembleDebug
```

산출물 경로:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

이걸 그냥 폰으로 옮긴 뒤 "출처를 알 수 없는 앱" 설치를 허용하고 탭하면 설치된다.

편의를 위해 빌드 후 프로젝트 루트로 복사해두는 흐름을 쓰고 있다:

```bash
cp android/app/build/outputs/apk/debug/app-debug.apk ./SR-MEMO.apk
```

---

## 10. 자주 하게 될 변경들

### (a) 대쉬보드 URL 바꾸기

`android/app/src/main/java/com/silverruler/srmemo/MainActivity.java`:

```java
private static final String HOME_URL = "https://memo.silverruler.xyz:2096";
```

이 한 줄만 고치고 `./gradlew assembleDebug` 다시.

### (b) 앱 버전 올리기

`android/app/build.gradle`:

```gradle
defaultConfig {
    versionCode 2     // 정수, 빌드 올릴 때마다 +1
    versionName "1.1" // 사람이 읽는 버전, 자유 형식
}
```

같은 `versionCode`로 다시 설치하려고 하면 폰에 따라 거부될 수 있다.

### (c) 아이콘 다시 만들기

§6의 `convert` 5줄을 다시 실행하면 끝. `favicon.png`만 바꿔주면 자동으로 모든 해상도가 갱신된다.

### (d) 캐시/빌드 산출물 청소

```bash
cd android && ./gradlew clean
```

---

## 11. 이번에 한 일 요약 (변경 이력)

**v1.0 (initial build)**
1. 기존 `android/` 폴더에 빠져있던 Gradle Wrapper 일체와 `gradle.properties`, `local.properties` 추가.
2. AGP를 8.2.2 → **8.13.2**로, Gradle을 **8.14.4** Wrapper로 정렬.
3. `AndroidManifest.xml`에서 deprecated `package` 속성 제거, 런처 아이콘/`configChanges` 보강.
4. `MainActivity.java`에 `CookieManager.flush()` (onPageFinished, onPause), `saveState/restoreState`, `onKeyDown` 백버튼 처리 추가.
5. `favicon.png`로부터 mdpi ~ xxxhdpi 런처 아이콘 5종 생성.

**v1.1 (URL 변경)**
6. `HOME_URL`을 `https://memo.silverruler.xyz` → **`https://memo.silverruler.xyz:2096`** 으로 변경.

**v1.2 (UX 보강)**
7. `app/build.gradle`에 `androidx.swiperefreshlayout:swiperefreshlayout:1.1.0` 의존성 추가.
8. `MainActivity`를 `SwipeRefreshLayout` + `WebView` 구조로 변경. **당겨서 새로고침** 동작 추가 (스크롤 최상단일 때만 발동).
9. 뒤로가기 동작 개선: 단순히 `webView.goBack()` 하던 것을 → `evaluateJavascript`로 페이지의 `cur` 변수를 확인하고, 섹션이 선택된 상태면 **섹션 리스트 화면으로 복귀**, 아니면 웹 히스토리/앱 종료 순으로 폴백.

**v1.3 (새로고침 버그 수정)**
10. v1.2에서 섹션 안(예: TEMP)에 들어가 있을 때 pull-to-refresh를 하면 `webView.reload()`가 페이지 전체를 다시 그려서 섹션 리스트 화면으로 튕기는 문제가 있었다.
11. 이제 새로고침 시 페이지의 전역 `cur` 변수를 보고 분기한다 — 섹션이 선택돼 있으면 페이지 함수 `load()` 만 호출(현재 섹션 그대로, 메모만 다시 불러옴). 섹션 리스트 화면이면 그대로 풀 리로드.
12. 비동기 `load()` 완료를 받기 위해 `JavascriptInterface` (`window.SRMemo.refreshDone()`) 추가 + 4초 안전망 타임아웃.

빌드 명령은 그대로 `./gradlew assembleDebug` → 결과물은 `android/app/build/outputs/apk/debug/app-debug.apk` (약 5.4 MB), 사용 편의를 위해 `memo-server/SR-MEMO.apk` 로 복사.

---

## 12. 다음에 같은 일을 0부터 다시 한다면

```bash
# 0. 작업 위치
cd /root/memo/memo-server/android

# 1. 한 번만: Gradle Wrapper 생성 (이미 있다면 skip)
/root/.gradle/wrapper/dists/gradle-8.14.4-all/*/gradle-8.14.4/bin/gradle \
    wrapper --gradle-version 8.14.4 --distribution-type bin

# 2. (필요시) URL 수정
$EDITOR app/src/main/java/com/silverruler/srmemo/MainActivity.java

# 3. (선택) 버전 올리기
$EDITOR app/build.gradle    # versionCode / versionName

# 4. 빌드
ANDROID_HOME=/root/android-sdk ./gradlew assembleDebug

# 5. APK 꺼내기
cp app/build/outputs/apk/debug/app-debug.apk ../SR-MEMO.apk
```

끝.
