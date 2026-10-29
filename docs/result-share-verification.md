# 結果画像のコピー・角丸・キャラクター色

確認日: 2026-10-28 JST

## 変更

- Desktop ブラウザの共有操作は画像 PNG 1 item / 1 representation のコピーを優先。Tauri は既存のネイティブ clipboard adapter を利用する。コピー登録はキャプチャ完了を待つ前に行い、クリックの user activation を維持する。
- モバイル（iPad の desktop user agent を含む）は共有シートを維持し、ファイル1件だけを渡す。タイトル・本文・URL・HTML を別 representation として加えない。キャンセル後にはコピーも保存もしない。
- キャプチャ時の白い canvas 全面塗りを削除。カード自身の白い背景と角丸を残し、角の外側のみ透明にする。
- グラフの線・塗り・端点、ピーン率の文字色は既存 characterPresentation の色を参照。基準線は既定の #F78000、未獲得は #939393 を維持。カタログ・保存・通信・画像アセットは変更なし。vibe-app 変更不要。
- 注意の目安は前回のローカル変更ですでに削除済み。現行の DOM と両リポジトリのソースに存在しないことを再確認した。
- 既存のアニメーション・タイミングは変更していない。

## 実行検証

- Web の共有ボタンをクリック → clipboard は image/png 1件 → Discord macOS の空の入力欄で1回ペースト → image.png の添付が1件のみ。送信せず削除した。
- macOS Tauri QA アプリ（現行 desktop frontend と既存 Rust clipboard command）でも共有ボタン → 成功通知 → Discord に image.png 1件のみ。送信せず削除した。
- 両経路の PNG は1822×1062。四隅の alpha はすべて0、カード上辺中央の内側は RGBA(255,255,255,255)。実際の画像を再表示し、キャラクター欠落なし・白いカード・角丸を確認した。
- ヨゾラナゴ: キャラクター色、ピーン率、graph stroke、gradient stop がすべて rgb(4,45,104) = #042D68。基準線は rgb(247,128,0) = #F78000。
- Web 1512×982 / 720×512 / 390×844 の横オーバーフロー0。カードは各幅911.383 / 666 / 336px。CSSのレイアウト寸法は今回変更していない。
- bun run build: Web / Desktop 成功。bun test scripts/work-session.test.ts scripts/result-image-delivery.test.ts: 各28件成功、114 assertions。cargo check --manifest-path src-tauri/Cargo.toml 成功。git diff --check 両方成功。
- 配送分岐の回帰テスト7件: desktop単一PNG、キャプチャ前のコピー登録、モバイル単一ファイル、iPad判定、共有キャンセル、clipboard失敗時の1回保存、Tauri adapter、保存経路。

## 限界と基準

- 旧 OS 共有シートの「コピー」で複数形式ができる内部原因までは未確定。旧経路の操作はホストアプリへのツール制限で完了できなかった。修正後の Web / Tauri → Discord 1件のペーストは実行確認済み。
- Windows / iOS / Android 実機の実行は未検証。モバイル共有分岐は回帰テストで検証。
- 元のビルド警告（Lottie eval、chunk size、Rust の未使用 pairing code）は継続。今回のエラーなし。
- リモート main 確認: Web d3c75b7e8b357e12ded0627b7a128a8a86e400cd / Desktop 7c0f7f865f45abdacdf039c3c3ce1d7279742bef / Mobile 053104b4c8348ed0f6cec5406cf87e066001f628。
- ローカル変更のみ。push / merge 未実施。

証跡: Web checkout の output/share-fix/ に clipboard-yozora.png、native-clipboard-yozora.png、alpha-verification.json、measurements.json、mobile-card.png。

## 追加: 基準線のキャラクター色（2026-10-28）

- 先の検証後、基準線と「基準」ラベルも既存 --graph-color を参照するよう変更。上記の「基準線は #F78000 を維持」はこの追加変更で置き換えられる。
- Web / Desktop 各 result-card.css の2宣言と ScoreGraph.tsx の aria-label のみ変更。100点の位置、stroke-width: 1、レイアウト、アニメーション、データと API は変更なし。
- Web DOM: ヨゾラナゴは rgb(4,45,104)、オトアナゴは rgb(80,80,80)、未獲得は rgb(147,147,147)。基準線・ラベル・折れ線が一致。1512×982 / 720×512 / 390×844 の横オーバーフロー0、線幅1px。
- macOS Tauri QA: 1200×752 のコレクション詳細でヨゾラナゴ・オトアナゴ、結果画面で未獲得の色をスクリーンショット確認。
- Web コピー PNG と Chrome の保存ボタンでダウンロードした PNG は1822×1062。四隅 alpha 0。基準線の画素はコピー (4,45,104)、保存 (3,45,105) で、ブラウザ出力間に最大1のRGB差がある。未獲得のコピー PNG も灰色を確認。
- Web / Desktop の bun run build、Desktop cargo check、両 git diff --check 成功。今回追加したテストはなし（色宣言・読み上げ文の小規模変更）。
- 未完了の検証: macOS QA の共有操作は処理中のままで完了通知が得られず、今回の native clipboard PNG は確認できなかった。原因は未確定。保存 PNG は Web 経路で確認済み。Windows 実機は未検証。
- 証跡: Web checkout output/baseline-color/ の web-copied.png、web-saved.png、web-no-reward.png、native-*-screen.png、measurements.json。コードの push / merge は未実施。
