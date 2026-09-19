# TestFlight 모바일과의 LAN 연동

2026-09-19, 작업 기준 main `8b98cd328bb29f0c0444b6d713523630c3d71f2e`(0.1.2).
대응 모바일: vyuma/vibe-app main `a52dac9db10ef8b3a20e8cfb4503943f72d363a3`를 기준으로 진행한 동반 변경. 양쪽 수정은 함께 배포해야 한다. 커밋/PR은 아직 생성하지 않았다.

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
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml --lib pairing::server::tests -- --nocapture
```

빌드·정적 검사와 loopback HTTP/WS 통합 테스트는 통과했다. 테스트는 invalid token, pair, 측정/자세 상태, 재연결 snapshot, 획득/재전송, 틀린 ACK 거부, 분할 ACK+ping, ACK 후 제거, disconnect를 검증한다. 실제 Tauri 카메라/UI→iPhone TestFlight 흐름은 미검증이다.

PC 설치 바이너리는 다시 빌드해야 하며 팀원에게 기존 바이너리로 테스트를 요청하지 않는다. 이번 작업에서 로컬 `.app`과 DMG 패키징까지 실행했다. 팀 배포용 Developer ID 서명·공증·업데이트 배포는 기존 절차가 필요하다. PiiiN 웹 저장소는 수정하지 않는다.

## 단계별 추가 확인

작업 브랜치는 `fix/mobile-state-sync`, 모바일은 `fix/testflight-lan-integration`이다.
모바일의 `npm run test:contracts`로 7종의 ID/이름/희귀도/설명/색상/태그/순서와 PNG SHA-256을 비교해 일치를 확인했다. 데이터 내용은 덮어쓰지 않았고, 양쪽에 기존 별칭의 합집합(7개)을 적용했다. Rust 선택 필드 None은 null 대신 생략하며 타임라인을 구조체로 제한했다.

1단계 배포는 계정 생성과 실제 TestFlight/iPhone 검증이 남았다. 2단계 잠금·단절·PC 재시작 후 완료 결과 복구는 기존 기록을 지우지 않는 추가 저장 방식으로 구현했다. 이전 버전의 journal 없는 과거 컬렉션 일괄 이전은 포함하지 않는다. 3단계 기본 카메라의 앱 실행은 실기기 미검증이다. 전체 작업이 끝났다는 의미가 아니다.


## 잠금 중 종료 보완

- `src/features/pairing/services/measurementDelivery.ts`에 PC 완료 결과 journal과 출처 ID를 저장한다. 종료는 모바일 ACK를 기다리지 않는다. 저장 실패는 UI에 알리고 메모리에 보존해 재시도한다.
- 측정 시작 시 ID를 확정하고 상태 이벤트에도 전달한다. `measurement_completed`는 보상 없는 결과도 `result`로 전달하며 결과/캐릭터 저장 후 `status: stored` ACK를 받는다.
- 소수 밀리초를 실제 측정에서 사용하므로 native 시간 필드를 f64로 맞췄다.
- 느린 소켓 송신은 작업 스레드에서 처리한다. 재연결 snapshot은 현재 측정, 재전달 result는 해당 과거 측정으로 구분한다.
- 모바일 상세 보고: `docs/locked-completion.md`. 실제 iPhone 잠금·복귀·TestFlight 흐름은 미검증이다. 자동 검사에서는 단절 중 A 종료→B 시작→snapshot B와 결과 A 재수신을 검증했다.
# TestFlight 연동용 로컬 패키지

2026-09-19 `bun run tauri build`를 샌드박스 밖의 macOS `hdiutil` 환경에서 실행해 프런트엔드, Rust release, 앱 번들 및 arm64 DMG 생성을 확인했다.

- 앱: `/Users/kyoungpin/Desktop/01_coding/14hack1/posture-app/src-tauri/target/release/bundle/macos/PiiiN.app`
- DMG: `/Users/kyoungpin/Desktop/01_coding/14hack1/posture-app/src-tauri/target/release/bundle/dmg/PiiiN_0.1.2_aarch64.dmg`
- 로컬 앱 번들은 ad-hoc 서명 상태다. 다른 팀원에게 일반 설치 파일로 배포하려면 기존 Developer ID 서명·공증 절차로 다시 패키징해야 한다.
