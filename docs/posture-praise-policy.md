# 칭찬 말풍선 발행 조건

2026-10-29 후속 사용자 결정. 웹 PiiiN과 데스크톱 posture-app에 적용했다.

## 규칙

- 새 측정의 첫 집중 구간에서 유효한 좋음이 안정적으로 확인되면 `いい感じ！` 한 번.
- 이후에는 집중 중 유효하고 새로운 **나쁨 판정**을 관측한 뒤 좋음으로 회복했을 때만 한 번.
- 계속 좋음, 잠깐의 인식 누락/hold, 전체 판정은 좋음인 상태에서 세부 원인 안내만 해소된 경우에는 칭찬을 추가 발행하지 않는다.
- 일시정지/휴식/기준 재등록 후 재개 자체에는 칭찬하지 않는다. 중단 전 나쁨 기록을 재개 후 회복으로 연결하지 않는다. 재개한 집중 구간에서 새 나쁨→좋음이 확인되어야 한다.
- 준비/기준 등록의 off 상태는 새 측정의 첫 집중 기회를 소모하지 않는다. 첫 칭찬 전이라도 집중을 중단했다가 재개하는 것만으로 칭찬하지 않는다.
- 기존 좋음 확인 350ms, 원인 지속/해제 기준, 말풍선 전체 3.68초 및 등장·흔들림·퇴장 수식, 펫 본체 애니메이션, 점수·획득 기준은 유지한다.

## 구현

`feedbackSpeech.ts`에서 대사의 마지막 종류와 **칭찬 발행 자격**을 분리했다. 세션의 첫 집중 또는 fresh/valid bad 관측만 자격을 부여한다. 모드/기준 변경은 자격을 초기화하며 같은 세션의 첫 칭찬을 다시 허용하지 않는다.

`usePostureSpeech.ts`와 `WorkApp.tsx`는 기준 구간/관측 epoch와 별개로 안정적인 측정 session ID를 전달한다. 기록한 SpeechEvent/API/저장 형식은 바꾸지 않았다. `FeedbackPreview.tsx`에 재현 전용 `Praise rules` 시나리오를 추가했다.

## 검증

수정 전 테스트에서 ‘전체 상태는 good이지만 세부 원인이 해소됨’, paused/rest/off→focus의 4개 사례가 예상 1회 대신 2회 칭찬하여 실패했다. 수정 후 모두 통과했다.

양쪽 저장소에서:

`bun test scripts/posture-praise-policy.test.ts scripts/posture-speech-stability.test.ts scripts/posture-feedback.test.ts scripts/widget.test.ts scripts/timelapse.test.ts scripts/work-session.test.ts`

- 각각 **60 tests / 474 assertions 통과**. 새 정책 테스트 9개 포함.
- 양쪽 `bun run build`, `git diff --check` 통과.
- desktop `cargo check --manifest-path src-tauri/Cargo.toml` 통과. 기존 pairing 미사용 경고 32개, 번들/Lottie 관련 기존 빌드 경고 유지.

Chrome 실제 개발 UI에서 22초 합성 시나리오:

| 시각 | 발행 |
| --- | --- |
| 0.4s | いい感じ！ |
| 4.5s | お疲れさま！ (일시정지) |
| 5.5s 재개 | 새 칭찬 없음 |
| 8.5s | ストレッチした？ (휴식) |
| 9.5s 재개 | 새 칭찬 없음 |
| 12.5s | 姿勢を戻して！ (새 나쁨) |
| 14.9s | いい感じ！ (회복) |

종료 후 표시 중인 말풍선 DOM 개수 0 확인. 브라우저 콘솔 오류 없음. macOS `PiiiN Timelapse QA`의 동일 시나리오 이력에서도 칭찬은 0.4s, 15.6s 두 번뿐이었다. 다른 안내는 4.6s 일시정지, 8.5s 휴식, 12.6s 나쁨. 이는 합성 관측 검증이며 실제 카메라 분류 정확도나 별도 네이티브 펫 패널의 시각 검증을 의미하지 않는다.

증적: 웹 `output/pet-speech-drag/praise-policy-web.jpg`, `praise-policy-web.txt`, `praise-policy-native.txt`. 기존 미커밋 작업은 유지했고 push/merge하지 않았다. 캐릭터·통신 계약 변경이 없어 모바일은 수정하지 않았다.
