# Mac App Store 配布準備

2026-10-30。作業ブランチ: `feat/mac-app-store`。**App Review 未提出・一般公開前。署名済み universal PKG を Transporter に送り、TestFlight で検証中。アップロード成功は審査合格を意味しない。**

## 確定した方針

- 個人会員 GWAK KYOUNGPIN / Team ID `XR3N5USJR9` を使用。アプリ名は PiiiN。猫背〜ずの法人登録やアプリ内へのチーム名追加はしない。
- 最初は日本向けの無料 Mac アプリ。課金は今回実装しない。モバイル公開は保留。
- App Store Connect の既存 PiiiN（Apple ID `6813624120`）に macOS 1.0 を追加済み。状態は提出準備中。Bundle ID は `com.kyoungpin.piiin`。iOS 版も同じレコードにあるが未公開。
- 既存 DMG の `com.vyuma.posture-app` と更新経路は当面維持する。Store 移行時にユーザーデータを消さない。

## 今回の分離

- 既定の `direct-distribution` feature は従来の macOS 更新プラグインとメニューを維持。
- `--no-default-features --features mac-app-store` では更新・再起動プラグインをリンクせず、更新 ACL も読み込まない。両 feature 同時指定は build.rs で拒否。
- フロントエンドは `VITE_DISTRIBUTION_CHANNEL=mac-app-store` で外部アップデーターを表示・起動しない。
- `tauri.appstore.conf.json` は Store の識別子・1.0.0・sandbox entitlement・capability を分離する。既定設定と既存配布版の識別子は変更しない。
- `entitlements.appstore.plist` は camera、network client、ユーザーが選んだファイルへのアクセスを設定。Downloads フォルダ全体への権限は追加しない。

## 提出を止めている項目

1. **透明ペット**: Store 専用の AppKit + Lottie 描画を実装し、公開 NSPanel に接続した。既存 JSON のポーズ・遷移区間を再利用する。直接配布版は従来の描画を維持。Store ARM64 debug バイナリのリンクと、既知の `drawsBackground` / `fullScreenEnabled` 文字列がないことは確認済み。ただし実際の Tauri Store アプリ内でカメラ連携、ボタン、ドラッグ、画面端、Spaces、縮小表示、Reduce Motion、性能を通して検証する必要がある。単体プローブの表示確認だけでは同等性を保証しない。
2. **保存・共有**: Store 向けに NSSavePanel と Cocoa の atomic 保存を実装。共有は元の export が解放されても読めるよう app container 内へ一時コピーして NSSharingServicePicker に渡す。取消、既存ファイル置換、容量不足、共有サービスの読み取りを sandbox 実機で確認する必要がある。共有コピーは現在コレクション初期化で消えるが、共有完了後の安全な回収・上限管理も提出前に実装する。直接配布版の Downloads 保存は変更しない。
3. **データ移行**: identifier と sandbox container が変わる。旧アプリの測定 DB、コレクション、設定、動画をユーザー操作で移行する方法が必要。SQLite の稼働中ファイルを単純コピーしない。旧データを上書き・削除しない。
4. **署名**: ユーザー承認後、Mac App Distribution（7AJM9U7DK5）と Mac Installer Distribution（7D8YUQG497）を発行し、対応する秘密鍵と共に login keychain にインポート済み。名義は GWAK KYOUNGPIN、期限は2027-10-30。承認された「PiiiN Mac App Store 2026」profile を組み込み、Application / Installer 証明書で署名済み。codesign --verify --deep --strict と pkgutil --check-signature が成功。秘密鍵を資料へ記載しない。kokuri-notary は既存 DMG 公証用のローカル名であり Store の表示名ではない。
5. **提出資料**: 実機スクリーンショット、最新の日本語説明、サポート・プライバシー URL、年齢レーティング、カテゴリ、価格と配信地域、審査連絡先、輸出コンプライアンスの確認が必要。旧 `store-listing.ja.draft.md` は Windows 向けで、削除済みのお気に入り・スマホ機能を含むため流用しない。

## 検証

既存配布: `bun run build` / `bun run test:updates` / `cargo check --manifest-path src-tauri/Cargo.toml`。

Store フロントエンドと同梱モデル: `bun run build:store` と `VITE_DISTRIBUTION_CHANNEL=mac-app-store bun test scripts/appstore-updater.test.tsx`。

Store Rust 検査は `TAURI_CONFIG` に `tauri.appstore.conf.json` の JSON 内容を設定し `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features --features mac-app-store`。設定ファイルを既定設定へ上書きしない。

コンパイル成功は sandbox 上のカメラ・ペット・保存・共有の動作検証や Apple の審査合格を意味しない。提出前に universal 署名済みアプリで各動作、再起動後のデータ保持、旧版からの移行を実行する。

## 一次資料

- https://v2.tauri.app/distribute/app-store/
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/help/app-store-connect/create-an-app-record/add-platforms/

### 2026-10-30 の実行結果

- 通常/Store フロントエンドの build 成功。通常 updater 4 tests、Store updater 1 test 成功。
- 通常/Store 設定で cargo check 成功（既存の未使用 pairing コードの警告あり）。
- Store の依存ツリーに updater/process plugin がないこと、生成 JS に updater command/menu がないことを確認。
- Store entitlement の plutil 検査と git diff --check 成功。
- 以降に追加した署名・TestFlight の実行結果は次節を参照。データ移行は未検証。


### ネイティブペットの追加検証（2026-10-30）

- Swift package は Lottie 4.6.1 に固定。公式 MIT ライセンスと PrivacyInfo.xcprivacy を同梱する。
- 元の Lottie JSON は変更しない。Web/native の out-point 判定差のみ、読み込み時にレイヤー終端を exclusive に合わせる。
- `scripts/native-pet-fixtures.ts` は実際の `widgetPresentation.ts` から72件の期待値を作る。4ポーズ×3ウィンドウ高×Reduce Motion有無×3時点の形状比較と、怒りの揺れの周期テストが成功した。
- Swift単体プローブで通常・怒り・休憩・一時停止、吹き出しと影を表示した。全遷移の映像比較、実際のStoreビルドでのパネル操作、読み上げ、CPU計測は未完了。吹き出し期限後のaccessibility labelも要確認。
- 元のタイマーは178×65、ボタン30×30、バー148×8を維持する。テストは計算値の一致であり、フォントや描画結果の全ピクセル一致を意味しない。
- 通常ビルドでは Cargo の `direct-distribution` が `tauri/macos-private-api` を有効化する。Storeでは無効。tauri-build の検査に合わせて既定JSONのmacOSPrivateApiはfalseにし、機能選択はCargo featureで行う。
- Store アプリの正式署名・sandbox 検証とデータ移行が終わるまで、既存版の置換、公開、審査提出はしない。

### 署名バックアップ（2026-10-30）

- ユーザーが Keychain Access でパスワード保護した `.p12` に、Store配布用の証明書2件と対応秘密鍵2件を書き出した。
- ローカルの一時検証で復号・秘密鍵による試験署名・公開証明書との照合が成功。検証でキーチェーンの内容は変更していない。
- パスワードはユーザーが直接入力し、チャット・ログ・リポジトリに保存していない。`.p12` もリポジトリ外で保管する。
- **別端末・外部媒体へのコピーは未実施**。暗号化された外部媒体、またはユーザー指定の安全な個人保管先を選んでからコピーし、ハッシュ照合する。
- このバックアップに既存DMG用のupdater秘密鍵は含まれない。


### TestFlight と保存経路の実機検証（2026-10-30）

- Store `1.0.0 (1)` を 15:08 に Transporter でデリバリし、15:10 に TestFlight からインストール。初回ストーリー→ホーム、カメラ許可、基準姿勢登録、測定、停止、結果カード、コレクションからの再表示を確認。
- 実際の録画をタイムラプス画面で再生・一時停止できた。NSSavePanel で指定したローカル MP4 が生成された。ffprobe: H.264 / 1280×720 / 30fps / 124.431667秒 / 28,628,889 bytes / 音声ストリームなし。検証後、録画設定はオフに戻した。
- 動画の共有メニューにサムネイルと28.6MBのファイル情報が表示された。外部の相手への送信は行っていないため、受信側の確認は未実施。
- build 1 のカード画像保存は、ブラウザーの Blob ダウンロードを呼ぶだけで「保存しました」と表示し、保存先選択もファイル生成もなかった。所有者も保存ダイアログが見えなかったと回答。これは不具合であり成功扱いしない。
- build 2 は Store 画像保存を `save_result_image` に接続。動画と共有する NSSavePanel で保存先を選び、Cocoa の atomic write 成功後のみ成功を返す。取消は `aborted`、失敗はエラーにする。通常配布とWebのフォールバックは維持。
- 回帰テストは修正前7成功/4失敗、修正後11成功/0失敗（39 assertions）。通常/Store frontend build、通常/Store cargo check、universal Store build、コード署名・PKG署名検証が成功。
- `PiiiN-1.0.0-2.pkg` を 15:53 に Transporter デリバリ。SHA256: `bf306b6d6c64ed748c56897f3d66cf12f071d4c03fedf6408112733dfcae0af8`。TestFlightでbuild 2へ更新し、保存ダイアログ→PNG生成（1822×1034、195,247 bytes、alpha有り）、取消後に成功メッセージを出さないことを確認。Finderの「クリップボードを表示」でカード画像の実データも確認した。更新後に1件のコレクションとそのカード・動画の入口が保持されている。
- App Store Connect: 日本だけ・無料（JPY 0）。所有者が選んだ承認後の自動公開を維持。日本語説明、サポート/プライバシーURL、カテゴリ、年齢評価9+、レビュー連絡先を保存。TestFlight実機のホーム・タイマー設定画像（各2560×1600）2枚を登録。所有者が自己制作または再配布権を確認したためコンテンツ権利も保存した。App Privacy詳細と最終審査提出は未完了。
- 生のカメラ映像は公開の証拠・Store画像・Gitへ含めない。顔を含む検証用動画はローカルのみ。

残る実機確認: Storeペットの画面上の外観・ドラッグ・ボタン・Spaces・画面端・Reduce Motion・性能、共有先での読み取り、動画を含む更新後データの全件保持。既存 JSON やアニメーションのタイミングは変更していない。


### Mac App Store の姿勢推定を端末内で完結させる変更（build 3）

- 所有者の承認に基づき、Mac App Store版だけモデル・WASMを同梱する。Web・直接配布・現在のWindows Storeパッケージは従来の取得経路を維持し、公開ポリシーで区別する。
- `bun run build:store` はSDK 0.10.34を確認し、公式のLiteモデルv1をビルド時に取得する。SHA256 `59929e1d1ee95287735ddd833b19cf4ac46d29bc7afddbbf6753c459690d574a` に一致しない場合は失敗する。インストール後の外部フォールバックはない。
- modelと6種類のJS/WASMを含む7ファイル、40,476,641 bytes。Apache 2.0 LICENSE/NOTICEとファイルごとのhash manifestを同梱。元のモデル・SDK内容は変更しない。全推移依存のSBOM監査が完了したという意味ではない。
- StoreのCSPで外部接続を制限。既存Lottie/WASMに必要な評価とローカルIPC/asset/blob/dataを許可する。ペット画像・アニメーションは変更しない。
- キャッシュ利用時のネットワークなしビルド、全ファイルのmanifest照合、不正model拒否、Store updater非表示の4テスト/26 assertionsが成功。Web・通常desktop・Store frontend build、通常cargo check、universal署名付きStore buildが成功した。
- `PiiiN-1.0.0-3.pkg` は2026-10-30 18:48にTransporterでデリバリ済み。SHA256 `e12f53109c76fdcb87b5eb7b87803bcda2026447021d1a6e7b427542051d8ac0`。codesign厳格検証とPKG署名検証が成功。
- TestFlight build 3へ更新し、同梱モデルでカメラ初期化・基準登録・集中→休憩→集中・結果カードを実機確認。録画はオフ。build 3での保存・共有の再検証は未完了。App Store Connectの提出前ドラフトはbuild 3を選択して保存済み。
- 公開ポリシーの対応PR: https://github.com/Kyoung9/PiiiN/pull/30


### ペットの瞬間的な別ポーズ表示（build 4修正）

- TestFlight build 3で、操作していないのに睡眠/一時停止のようなポーズが瞬間的に挟まると所有者が報告。審査提出を保留した。
- オフスクリーンNSWindowに実際のPetRigを載せ、good→badの1回だけで再現。Lottie 4.6.1の完了delegateがcurrentFrameを書き換え、明示的な遷移終了後にcurrentFrameの暗黙アニメーション（約0.25秒）を追加していた。183→213の後に約213→1を補間し、間にある別のポーズを描画していた。
- 完了時の暗黙currentFrameアニメーションだけ除去し、目的の静止フレームを即時描画。遷移終端はWeb同様exclusiveにする。元のJSON、形状、色、30fps、遷移時間と怒りの揺れ/拡大は維持する。直接配布・Windows・Webの描画は変更しない。
- `PetPlaybackTests`で12遷移、連続要求の最終状態、Reduce Motion割込み、実際のPetWidgetでの反復snapshot/怒りの拡大/休憩遷移を検証。修正前の再現テストは失敗、修正後はSwift全5テスト（既存72ケース含む）成功。macOS CIにも同じテストを追加。
- 実行: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path src-tauri/native-pet`。単体描画の検証をTestFlight実機の検証済みとは扱わない。build 4の実機確認はこれから。
- 頭の傾きの案内と怒り/ピーン率は既存仕様で別判定。`feedback.ts`の耳・目の傾きは案内専用、`engine.spec.ts`の総合スコアには直接加算されない。案内が残っても総合goodならピーン率は上がる。その後、所有者が持続する頭の傾きをbad/ピーン率にも反映することを承認。下記の変更をbuild 4に同梱する。


### 頭の傾きとbad判定の接続（build 4）

- 同一カメラフレームの耳と目のロール差（基準姿勢からの絶対変化、両者の方向/角度が一致する場合のみ）をbad候補に含める。左右・ミラー表示で対称。基準値12度または基準測定のMAD×5の大きい方を使用し、既存の1200ms持続判定・350ms回復を通す。解除側は0.65倍で境界の点滅を抑える。医学的な閾値ではない。
- ピーン率とペットは同じ確定postureStateを参照する。数値の加重偏差スコア/グラフ式そのものは変更しない。新規測定のscoreVersionを`baseline-distance-v1-head-tilt-v1`にし、過去のカード・測定結果は再計算しない。
- 閾値未満の短い動作、目の欠落、カメラ変更、長い観測間隔は頭傾きだけではbad確定しない。以前の基準にfeedback較正が保存されていない場合は推測せず、再登録後に有効になる。
- 左右18度・ミラー有無の4ケース、基準自体が6度のケース、回復/短期ノイズ、実際のmeasurementReading→advanceSessionのgoodMs/ピーン率まで回帰検証。デスクトップとWebに同一ドメイン変更を反映。モバイル通信のフィールドは変更しない。
- ユーザーが報告した実際の左右差の原因は、生のランドマーク記録がなく未確定。対称な入力では旧加重スコアが左右ともgoodに残ることは再現した。実際のカメラでの左右確認はbuild 4で実施する。

- 基準登録完了フレームで説明用の較正も確定し、保存/復元時に欠落しないことを回帰検証。対応Web PR: https://github.com/Kyoung9/PiiiN/pull/31

- 最終PKG `PiiiN-1.0.0-4-final.pkg`（SHA256 `d77637aaa1acdf3bfec55e7283ebd89a11aaaa1328106908351763b87337a213`）の厳格codesign/PKG署名検証が成功。2026-10-30 20:32 JSTにTransporterデリバリ成功。Apple処理中で、TestFlight build 4実機確認は未完了。Web/desktop統合は各51 tests / 491 assertions成功。macOS CI成功、Windows CIは確認待ち。


### 2026-10-31 リリース継続時の確認

- TestFlight `1.0.0 (4)` は前日にインストール済み。2026-10-31に実行中のプロセスが `/Applications/PiiiN.app/Contents/MacOS/posture-app` であること、同アプリのInfo.plistが `com.kyoungpin.piiin / 1.0.0 / build 4` であることを照合した。所有者はこのアプリについて、ペットの瞬間的な別ポーズ表示と左右の頭の傾き判定が正常と回答した。この2項目を実機確認済みとする。ホームの既存コレクション2件も保持されていた。Spaces・画面端・性能・build 4での保存/共有の再検証まで完了したとは扱わない。
- 最終コード `e0a13b1`、記録追加 `faefc11` の [Mac/Windows CI](https://github.com/vyuma/posture-app/actions/runs/41048906178) と [Windows Store package](https://github.com/vyuma/posture-app/actions/runs/41049368735) が成功。Windows実機の検証とは区別する。
- 所有者の指定: Apple審査通過まではLPのMacダウンロードを従来版のまま維持する。公開GET `https://www.piiin.app/api/download-mac` は302で `https://github.com/vyuma/posture-app/releases/download/v0.1.9/PiiiN_0.1.9_universal.dmg` を返した。LPコード・既存Release・updater配信は変更していない。
- LPは最新GitHub Releaseを参照するため、審査中に新しい直接配布Releaseを公開しない。Store用PKGをこの経路へ置換しない。App Storeへの導線変更は審査通過の確認後に別途行う。
- ブラウザー操作はWork設定で無効という応答が続いていた。その後、2026-10-31に所有者がブラウザー作業の保留を明示したため、以後のブラウザー操作を停止する。App Store Connectのbuild 4選択・App Privacy詳細・審査提出は未実施。提出済み/公開済みとは扱わない。
