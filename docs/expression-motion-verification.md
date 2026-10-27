# 休憩・怒りポーズの実装と検証（2026-10-27）

## 変更範囲

PiiiN / posture-app の両方に、提供された SVG を `public/characters/anago/normal-nago/expressions/rest.svg` と `angry.svg` として原本のまま保存した。`paused` は休憩、`bad` は怒りに割り当てる。キャラクター ID・カタログ・取得ペイロード・モバイル画像は変更しない。vibe-app はこれらの表情 SVG / Lottie を参照していないため変更なし。

`expression-states.json` は既存の 408 フレーム / 30fps の状態タイムラインを引き継ぐ。体を曲げる動作、まばたき、背骨に追従する縞、休憩時の Z の順次表示、怒りから happy を経由して good に戻る動作を共通リグから生成する。状態更新中は現在の動作を終えて最新の要求へ接続する。Reduce Motion は完成ポーズへ移動し、沈み込みも無効化する。

ストーリーは `story-poses.json` の intro → happy → angry を同じ Lottie インスタンスで再生。再生区間をリセットしてから絶対フレームへ移動するため、2 番目の区間の終了後にキャラが消えない。怒りの揺れはモーフ後に 680ms × 4 回。

## 数値と原本

- SVG 原本 SHA-256: rest `c2a1627a32bab5892e9641cb9b199ed7a84bb8eefcc435814749c21cff6ca2c5`、angry `17c64babc286b6a50b466eaf3787788b0606b959bc07544d17494dce655755ba`。Downloads の提供ファイルとバイト一致。
- 元の体幅 56.69 を 226 に一様拡大。休憩の 1 本の cubic は de Casteljau 分割で 4 区間へ変換し、輪郭を近似しない。回転した縞と目は元の SVG transform を反映。
- オーバーレイの 860×1022 内で全ポーズを x+260 移動し、休憩の左側の Z が切れないようにする。状態間で移動基準は共通。
- 怒りの色は SVG と同じ `#F70000`、目の回転は ±35.73°。
- ストーリーの 1512×982 基準: 頭の中心 (541.0035, 432.2771)、体幅 146.064。実行 DOM のパス終点 (541.003479, 432.277100) / stroke-width 146.064、座標の丸め差 <0.0001px。元 Figma の配置基準を保持し、目の形状は今回の提供 SVG を優先。

## 実行した検証

- PiiiN: `bun run build` 成功。既存の Tauri event 静的/動的 import 警告のみ。
- posture-app: `bun run build`、`cargo check --manifest-path src-tauri/Cargo.toml`、macOS debug app バンドル作成成功。
- テスト: web 11 件 / desktop 9 件成功。既存モーション、原本ハッシュ、全状態の接続点、途中の縞の凸性・有限値、再生範囲、ストーリーの目の非交差を確認。
- 共有実装・生成アセット 10 ファイルが両リポジトリでバイト一致。`git diff --check` 成功。Impeccable 検査の指摘なし。
- 公式 Diffusion Studio Skottie: `/tmp/piiin-story-skottie/public/projects/piiin-expressions/scene-1/lottie.json` と `scene-2/lottie.json`。`/__context` で登録を確認。状態フレーム 0 / 1 / 2 / 204 / 303 / 407、ストーリー 0 / 30 / 46 / 61 と再生を確認。
- ブラウザの実アプリ: 1512×982、844×390、390×844。intro / happy / angry、戻る、連続クリック、横 overflow 0。844×390 は縦スクロールで両ボタンへ到達可能。390×844 はボタン・文言が画面内。
- 既存の状態プレビュー（ローカル QA モード、127.0.0.1:1451/dev/anago）で good → rest → angry → happy → good、連続要求の最終 rest を確認。コンソール警告・エラー 0。
- 実際の macOS debug app（1200×780pt / Retina 2400×1560）で happy と angry の最終画面を確認。バックグラウンドでは WebKit の再生が止まることがあり、状態反映に時間を要した。

## 限界・残差

- 原本の SVG フィルターは保存しているが、Lottie では既存のプラットフォーム CSS の影を使用する。影まで原本とピクセル一致とはしていない。macOS ではベクター境界に細いラスタライズ線が見える箇所があり、描画エンジン差を含むピクセル単位の評価は未完了。
- macOS の実カメラ検出 → デスクトップペットの全状態切り替え、OS の Reduce Motion 設定切り替え、Windows は未実行。休憩の描画と全状態接続はブラウザ / Skottie / 自動検査で確認した。
- ローカル変更のみ。デプロイ、コミット、PR は作成していない。
- 最新 origin/main を確認: PiiiN `98f094280d136a06a4c157582b9831d7ce225b7b`、posture-app `46fb478b273e3b0a458d76fb127440462dea1a94`、vibe-app `053104b4c8348ed0f6cec5406cf87e066001f628`。
