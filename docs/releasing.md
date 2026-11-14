# GPUI 릴리스

기존 `.github/workflows/release.yaml`은 이제 **Release GPUI** 워크플로입니다.
Tauri UI를 빌드하지 않고 GPUI의 Apple Silicon/Intel 배포물을 만들어 GitHub 릴리스
초안에 첨부합니다. 이 워크플로를 실행해도 자동으로 공개하지 않습니다.

## 업데이트 경로

1. 기존 Tauri 앱은 기존 주소의 `latest.json`과 기존 공개키로 검증할 수 있는
   `Mdit_VERSION_ARCH.app.tar.gz`를 받습니다.
2. 번들의 이름은 `Mdit.app`, 식별자는 `app.mdit`, 실행 파일은
   `Contents/MacOS/mdit`으로 유지합니다. GPUI의 Cargo 바이너리 이름은 그대로입니다.
3. GPUI는 `appcast-aarch64.xml` 또는 `appcast-x86_64.xml`을 읽고,
   Sparkle이 ZIP 다운로드·EdDSA 검증·설치·재시작과 네이티브 UI를 담당합니다.
4. 자동 확인은 기본 활성화입니다. 자동 다운로드/설치는 비활성화하고,
   `SUAllowsAutomaticUpdates=false`로 매번 설치 승인을 받습니다.

사용자 데이터는 가져오거나 삭제하지 않습니다. 기존 데이터 형식에 의존하지 않는
새 기능만 이 앱에 추가합니다. Cargo의 개발용 버전과 배포 버전은 별개이며,
릴리스 입력값을 `CFBundleVersion`/`CFBundleShortVersionString`에 기록합니다.
Sparkle은 이 번들 버전으로 업데이트를 비교합니다.

## GitHub 설정

기존 Secrets를 재사용합니다:

- `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY` (기존과 같은 Developer ID Application 인증서/팀)
- `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, `KEYCHAIN_PASSWORD`
- `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

새로 필요한 항목:

- Secret `SPARKLE_PRIVATE_KEY`: Sparkle 도구로 내보낸 EdDSA 개인키 파일의 내용
- Variable `SPARKLE_PUBLIC_KEY`: 대응하는 base64 공개키

Sparkle 키는 Tauri의 minisign 키와 별개입니다. **기존 Tauri 키를 교체하면 기존
설치본이 GPUI 업데이트를 검증하지 못합니다.** 배포 스크립트는 실제 Tauri 설정의
공개키로 `.sig`를 검증해 잘못된 키로 릴리스하는 것을 막습니다.

키를 한 번 생성하고 안전하게 백업한 다음 등록하세요. 다음 명령은 개인키를
터미널에 출력하지 않습니다. 키체인 접근이 요청되면 직접 승인합니다.

```sh
python3 tooling/release/download_sparkle.py
target/sparkle/bin/generate_keys --account app.mdit.sparkle
```

개인키를 저장소 밖의 보호된 임시 파일로 내보내고 GitHub에 등록합니다:

```sh
umask 077
sparkle_key_file=$(mktemp -t mdit-sparkle-key)
target/sparkle/bin/generate_keys --account app.mdit.sparkle -x "$sparkle_key_file"
gh secret set SPARKLE_PRIVATE_KEY --repo hjinco/mdit < "$sparkle_key_file"
target/sparkle/bin/generate_keys --account app.mdit.sparkle -p |
  gh variable set SPARKLE_PUBLIC_KEY --repo hjinco/mdit
rm "$sparkle_key_file"
```

키는 로그인 키체인에 남습니다. 별도의 안전한 백업도 유지해야 합니다.
개인키나 인증서를 Git에 추가하지 마세요.

## 릴리스 실행

1. `apps/desktop/RELEASE_NOTES.md`를 실제 배포 기능에 맞춰 수정합니다.
2. GitHub Actions의 **Release GPUI**에서 `version`을 입력합니다(예: `0.9.0`).
   기존 Tauri 설정 버전과 GitHub의 최신 공개 버전보다 커야 합니다.
3. 두 아키텍처 빌드 → 중첩 Sparkle 코드부터 서명 → Apple 공증 → 티켓 stapling
   → Tauri 서명/검증 → Sparkle 서명 피드 생성이 모두 성공하면 초안을 만듭니다.
4. 초안의 자산과 전환 테스트를 확인한 뒤 직접 공개합니다.

각 릴리스에는 아래 파일이 모두 필요합니다:

- `latest.json`
- 아키텍처별 `.app.tar.gz`와 `.app.tar.gz.sig` (Tauri 전환)
- 아키텍처별 `.zip`과 `appcast-ARCH.xml` (직접 설치 및 Sparkle 후속 업데이트)

`latest.json`은 두 아키텍처의 결과를 모은 뒤 한 번만 생성합니다.
Sparkle 공식 `generate_appcast`가 번들의 공개키와 개인키를 확인하고 ZIP 및 피드에
서명합니다. 다운로드한 Sparkle 배포판은 버전과 SHA-256으로 고정합니다.
일반 사용자용 ZIP은 압축을 풀고 `Mdit.app`을 Applications 폴더에 복사하면 됩니다.

**공개하면 기존 Tauri 앱도 자동 다운로드·설치를 시작할 수 있습니다.** 현재 GPUI는
초기 창과 업데이트 기능만 있으므로, 전환 가능한 기능이 준비되기 전에는 초안으로
유지합니다. 첫 전환 뒤의 릴리스에도 두 종류의 피드를 계속 포함해야 합니다.
오래된 Tauri 워크플로만으로 새 릴리스를 올리면 `/releases/latest/download/`의
Sparkle 피드가 사라질 수 있습니다.

## 검증

```sh
cargo check --all-targets --manifest-path apps/desktop/Cargo.toml --locked
python3 -m unittest discover -s tooling/release -p 'test_*.py'
```

실제 공개 전에 테스트 설치본으로 아래 흐름을 확인합니다:

- 실제 배포된 Tauri 버전에서 서명된 GPUI 아카이브 설치 및 재실행
- 낮은 GPUI 번들 버전에서 새 버전 탐지, 설치 버튼, 설치 후 재실행
- 최신 버전에서 업데이트 없음, 다운로드 취소, 잘못된 서명 거부
- Apple Silicon과 Intel에서 실행 및 공증/Gatekeeper 검증

프로덕션 키 없이 로컬 번들만 확인하려면 `release.py bundle`을 사용합니다.
`--identity`를 생략하면 ad-hoc 서명이고, `--notarize`를 생략하면 공증하지 않습니다.
`artifacts` 명령은 공증된 앱만 허용하므로 이런 번들이 릴리스에 섞이지 않습니다.

참고: [Sparkle 설정](https://sparkle-project.org/documentation/),
[업데이트 정책](https://sparkle-project.org/documentation/customization/),
[Tauri updater 형식](https://v2.tauri.app/plugin/updater/).
