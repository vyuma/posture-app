# Windows ペット表示の検証（2026-11-01〜02）

対象は `origin/feat/mac-app-store` の `e8a1186` を基点にした `fix/windows-pet-transitions`。Windows の Tauri 0.1.9 開発ビルド、WebView2 156.0.4314.58、1366×768 / 作業領域1366×720、倍率100%で確認した。

## 結論と確認範囲

画面右端で good / bad を切り替えると、旧実装ではタイマーの画面上の基準点が横に50px移動した。300×324と400×720のウィンドウを切り替え、画面端に収める処理によって中心位置が変わることを再現した。修正後の2往復、1201フレームではウィンドウとタイマーの基準点の移動量は0pxだった。

申告された「上方向への一瞬の移動」「復帰時の点滅」は、Windowsコンポジターの連続映像による修正前後比較まではできていない。今回の変更は、実測した基準点移動を修正し、姿勢変化に伴うウィンドウの移動・リサイズを除去したもの。元の一瞬の症状については実機での継続確認が残る。

## 変更

- Windowsだけオーバーレイを400×870論理px（作業領域で制限）の固定キャンバスにする。good / bad / compactによるリサイズを止める。
- 描画・入力領域をキャラクターの影、吹き出し、タイマー、エラー表示の周辺に制限する。空き領域に重なった背後のボタンを実際にクリックできることを確認した。
- Windowsネイティブウィジェットだけ、Lottieの860×1280のレイアウトを固定し、ラッパーのCSS transformで拡縮する。通常UIと他OSの拡縮CSSは維持する。
- 既存Lottieのアート、区間、タイミングは変更しない。復帰時のサイズ変化600msとLottieの復帰区間は別々に維持する。
- オプトインの実機回帰テスト `scripts/windows-widget.test.ts` を追加する。

領域の所有権は[MicrosoftのSetWindowRgn仕様](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowrgn)に従い、成功後のHRGNはOSへ渡す。DPI変換、領域の制限、非有限値の除外をRustテストで確認する。

## 結果

|項目|結果|
|---|---|
|`bun run build`|成功。既存のLottie eval警告と大きなchunkの警告あり。|
|`bun run tauri build --debug --no-bundle`|成功。開発サーバーなしで単独EXEを起動し、通常ホームと既存コレクション3枚を確認した。|
|`cargo check --locked --offline --manifest-path src-tauri/Cargo.toml`|成功。既存のpairing未使用コード警告あり。|
|Rust `cargo test ... --lib`|8件成功。サンドボックス内では既存LANテストのソケット作成が拒否されたため、同じテストを権限付きで再実行して成功。|
|widget / recovery / timelapse-pet / timelapse-exportのBunテスト|13件、135アサーション成功。既存Lottieデータの保持も確認。|
|Windows WebView2実機テスト|1件、15アサーション成功。2往復、1201フレーム、固定SVGレイアウト、基準点維持、段階的縮小、goodへの復帰を確認。|
|背後へのクリック|good状態の固定キャンバス上部に重なったメイン画面のプロフィールボタンをクリックし、メニュー表示を確認。|
|実ウィンドウ表示|成長した赤いペットと復帰後の小さいペットをWindows画面で確認。連続映像の検証ではない。|
|Xボタン終了|実際のタイトルバーのXで終了。本体1プロセスと子孫WebView2 8プロセスが消え、オーバーレイを含む残存ウィンドウなし。|

テスト起動例（PowerShell）:

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9222'
bun run tauri dev --no-watch
# メインWebViewで開発用 /dev/work を開いた後、別のシェルで実行
$env:PIIIN_WINDOWS_WIDGET_CDP='9222'
bun test scripts/windows-widget.test.ts
```

このテストは開発用プレビューだけを操作し、実際の測定・カード獲得を発生させない。

## タイムラプス

Windows WebView2上の既存Canvasレンダラーで、6秒時点のbad→goodから段階的に縮小することを確認した。成長値は6.0秒で1、6.1秒で0.492、6.3秒で0.115、6.61秒で0。既存の600ms復帰処理は変更していない。

顔を含まない合成入力を隔離したQA領域に記録し、pet有無×カードscene有無の4通りを出力した。全て11.9957秒、音声なし、各5時点をデコードできた。カードなしは1280×720、ありは1108×720。実カメラから本番コレクション保存までの一連の操作を検証したという意味ではない。

## ローカル証跡

以下はGit管理外の `release-artifacts/windows-qa/` に保存した。

- `before-trace.json` / `after-trace.json` / `trace-summary.json`: 変更前1392フレーム、変更後1201フレーム。旧基準点の横移動50px→0px、縦移動は両方0px。
- `close-before.json` / `close-after.json`: 終了前9プロセス、終了後0。
- `timelapse-recording.json` / `timelapse-exports.json` / `timelapse-recovery.json` / `timelapse-recovery-filmstrip.png`: 隔離入力とCanvas描画の確認。
- `store-home-1366x768.png` / `store-collection-card-1366x768.png`: 通常ルートの実際の所持カード3枚を使った、顔なしの実アプリPNG。1366×768、倍率100%、拡大加工なし。開発用プレビューの20枚サンプルは掲載画像に使用していない。
- `PiiiN-0.1.9-windows-qa.exe`: 単独実行できるdebug検証ビルド。Store用MSIX・署名済み配布物ではない。SHA256: `0b811a143956c2ec9f69de332e7abe4e3b78383aa3fd93b19494e100b4376f4a`。

以前のCDPキャプチャで見えた約266msの間隔は、アプリの停止とは断定できない。対応するrequestAnimationFrameログは約16msで進んでいた。また、`final-frames.json` は不完全なので合否の根拠に使用していない。CDPの画像はWindowsコンポジターの瞬間的な描画乱れを保証するものでもない。

## 残る確認

- 元の瞬間的な上下移動・点滅を連続画面録画で再現し、同条件の修正後映像と比較する。
- 倍率125% / 150%、複数モニター間の移動、休憩・停止・ドラッグを含めた長時間操作。
- Storeの固定WebView2 / MSIXでの再検証。今回の確認は開発環境のランタイムで行った。
- 実カメラ測定から保存・再生・出力までの通し確認。

既存コレクション・動画の削除、Store下書きの公開、Apple審査・配布物の更新は行っていない。
