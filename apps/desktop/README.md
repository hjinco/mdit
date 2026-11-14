# Mdit Desktop

Mdit의 새 네이티브 앱. macOS에서 최소 창을 띄우는 것부터 시작합니다.
기존 기능은 단계적으로 추가합니다.

## 개발 환경

- 최신 stable Rust (`rustup update stable`)
- Xcode 및 macOS 개발 구성 요소, Metal Toolchain
- `xcode-select -p`가 Xcode의 Developer 디렉터리를 가리키고,
  `xcrun --find metal`이 성공해야 합니다.

GPUI 설치 요구 사항은 [공식 README](https://docs.rs/crate/gpui/0.2.2)를 참고하세요.

## 실행

저장소 루트에서:

```sh
pnpm dev:desktop
pnpm check:desktop
pnpm build:desktop
```

Node.js 없이 Cargo만으로도 실행할 수 있습니다:

```sh
cargo run -p mdit-desktop --locked
```

창을 닫거나 `Cmd+Q` 또는 앱 메뉴의 `Quit Mdit`를 선택하면 종료합니다.
릴리스 바이너리는 `target/release/mdit-desktop`에 생성됩니다.
개발 실행에서는 업데이트를 확인하지 않습니다. 배포 앱에서는 자동으로 새 버전을
확인하고 Sparkle 알림의 설치 버튼을 누르면 다운로드·설치·재시작합니다.
승인 없이 자동 설치하지 않으며, `Mdit → Check for Updates…`로 수동 확인도 가능합니다.

## 구조 및 검사

- `src/main.rs`: 앱 시작, 창, 메뉴, 최초 화면
- `src/updater.rs`: Sparkle 초기화와 업데이트 메뉴
- `resources/`: 앱 아이콘 등 배포 리소스
- `../../tooling/release/`: 번들 생성, 서명, 업데이트 피드 및 테스트
- `Cargo.toml`: `mdit-desktop` 패키지 정의. 워크스페이스와 lockfile은 저장소 루트에서 관리

기존 Tauri 앱과 공유 크레이트를 포함한 루트 Cargo 워크스페이스에 속합니다.
`check:rust:all`과 `test:rust:all`에 포함되며, 이 앱만 검사하려면
`pnpm check:desktop`을 사용합니다. Linux CI는 이 앱을 제외하고, macOS의
`Desktop Checks` CI가 검사합니다. 배포 대상은 macOS 12 이상입니다.

Rust 코드 변경 후 포맷:

```sh
cargo fmt --all --manifest-path Cargo.toml
```

배포 및 서명 키 설정은 [배포 문서](../../docs/releasing.md)를 참고하세요.
