# TestFlight 모바일과의 LAN 연동

2026-09-19, 데스크톱 변경은 PR [#20](https://github.com/vyuma/posture-app/pull/20)으로 main `8c4b558ec9a771242ef0fff3a44283a994d1a654`에 병합하고 [v0.1.3](https://github.com/vyuma/posture-app/releases/tag/v0.1.3)으로 배포했다.
대응 모바일은 TestFlight `1.0.0 (3)`으로 배포했다. 양쪽 배포본을 함께 사용해야 아래 확장 이벤트와 복구 계약이 동작한다.

모바일 저장소 `docs/testflight.md`에 계정 설정·빌드·업로드·팀 초대·실기기 인수 절차와 미검증 항목을 기록했다. 현재 체크아웃은 `/Users/kyoungpin/Desktop/01_coding/14hack1/vibe-app`이다.

## 기존 구현과 수정

기존 서버는 /health, /pair, /disconnect, /ws 및 snapshot/paired/disconnected/posture_bad/posture_good만 처리했다. App.tsx의 실제 측정 단계와 보상 결과를 기존 Tauri 브리지를 통해 전달하도록 연결했다. PiiiN 웹의 레거시 확장 구현을 참고했지만 웹 저장소는 수정하지 않았다.

추가 계약(기존 필드 유지):
- measuring_started/stopped, good_posture_registration_started/stopped
- snapshot 및 이벤트의 measuringSessionActive, goodPostureRegistrationActive, isBadPosture
- acquired_character: eventId, sequence, requiresAck, payload. 측정 ID/시각/통계/타임라인과 기존 캐릭터 ID/이름/희귀도/설명/색/태그를 전달
- 모바일 ack_event: ackEventId + ackSequence가 둘 다 일치해야 제거
- JSON ping에 pong 응답. 모바일은 heartbeat 무응답 시 재연결

미확인 획득 결과를 5초 간격 최대 5회(최초 송신 포함) 보내고, 이후에도 다음 소켓 연결 시 재전송한다. TCP ACK가 분할·합쳐져 수신되어도 처리하며 snapshot/replay와 broadcast 프레임이 섞이지 않게 쓴다. 연결 해제는 PC 측정을 중단시키지 않는다.

Rust 대기열은 메모리 안에 있지만, 새 측정 완료 결과는 PC localStorage journal에 먼저 저장하고 PC 재실행 시 재전달한다. 모바일 재실행/네트워크 단절은 PC가 계속 켜져 있는 조건에서 검증한다. PC 자체 재시작 시 새 port/token으로 QR 재스캔이 필요하다. 기존 캐릭터 카탈로그와 보상 조건은 변경하지 않았다.

## 검증

```sh
cd /Users/kyoungpin/Desktop/01_coding/14hack1/posture-app
bun run build
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib pairing::server::tests -- --nocapture
```

빌드·정적 검사와 loopback HTTP/WS 통합 테스트는 통과했다. 테스트는 invalid token, pair, 측정/자세 상태, 재연결 snapshot, 획득/재전송, 틀린 ACK 거부, 분할 ACK+ping, ACK 후 제거, disconnect를 검증한다. 실제 Tauri 카메라/UI→iPhone TestFlight 흐름은 미검증이다.

macOS 팀 배포용 v0.1.3은 Universal(arm64/x86_64)로 빌드하고 Developer ID 서명, Apple 공증, Gatekeeper 검사, Tauri updater 서명, SHA-256 검사를 통과했다. GitHub 최신 릴리스의 `latest.json`과 updater 압축 파일 공개 다운로드도 확인했다. PiiiN 웹 저장소는 수정하지 않았다.

## 단계별 추가 확인

데스크톱 구현 브랜치는 `fix/mobile-state-sync`, 모바일 구현 브랜치는 `fix/testflight-lan-integration`이다.
모바일의 `npm run test:contracts`로 7종의 ID/이름/희귀도/설명/색상/태그/순서와 PNG SHA-256을 비교해 일치를 확인했다. 데이터 내용은 덮어쓰지 않았고, 양쪽에 기존 별칭의 합집합(7개)을 적용했다. Rust 선택 필드 None은 null 대신 생략하며 타임라인을 구조체로 제한했다.

1단계 계정·TestFlight·데스크톱 업데이트 배포는 완료했다. 실제 iPhone에서 앱 실행, LAN 페어링, 측정 전체 흐름 검증은 남았다. 2단계 잠금·단절·PC 재시작 후 완료 결과 복구는 기존 기록을 지우지 않는 추가 저장 방식으로 구현했다. 이전 버전의 journal 없는 과거 컬렉션 일괄 이전은 포함하지 않는다. 3단계 기본 카메라의 앱 실행도 실기기 미검증이다.


## 잠금 중 종료 보완

- `src/features/pairing/services/measurementDelivery.ts`에 PC 완료 결과 journal과 출처 ID를 저장한다. 종료는 모바일 ACK를 기다리지 않는다. 저장 실패는 UI에 알리고 메모리에 보존해 재시도한다.
- 측정 시작 시 ID를 확정하고 상태 이벤트에도 전달한다. `measurement_completed`는 보상 없는 결과도 `result`로 전달하며 결과/캐릭터 저장 후 `status: stored` ACK를 받는다.
- 소수 밀리초를 실제 측정에서 사용하므로 native 시간 필드를 f64로 맞췄다.
- 느린 소켓 송신은 작업 스레드에서 처리한다. 재연결 snapshot은 현재 측정, 재전달 result는 해당 과거 측정으로 구분한다.
- 모바일 상세 보고: `docs/locked-completion.md`. 실제 iPhone 잠금·복귀·TestFlight 흐름은 미검증이다. 자동 검사에서는 단절 중 A 종료→B 시작→snapshot B와 결과 A 재수신을 검증했다.
## TestFlight 연동용 macOS 배포 패키지

2026-09-19 기존 `scripts/release-macos.mjs` 절차로 v0.1.3 Universal 패키지를 만들고 공개 릴리스에 게시했다.

- 릴리스: https://github.com/vyuma/posture-app/releases/tag/v0.1.3
- 새 설치: `PiiiN_0.1.3_universal.dmg`
- 자동 업데이트: `PiiiN_0.1.3_universal.app.tar.gz` + 서명, 공개 `latest.json`
- Apple 공증 ID: 앱 `4197d0f1-24db-4a9e-8bf2-5531c6086204`, DMG `f64b1efe-f5cf-4783-ad61-a20388f03f9b`
