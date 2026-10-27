# ストーリー5のカードドラッグ（2026-10-27）

## 変更

- カード列をマウス・ポインターで左右へドラッグ可能にする。LPの速度サンプリング（上限3px/ms、重み0.35/0.65）と指数減衰520msを参考にした慣性を適用。
- 既存の72秒CSSループの時刻を直接移動し、独立したtransformを重ねない。ドラッグ前後の位置を維持し、ループ端を両方向に越えても同じ並びが続く。
- ウィンドウのCSS縮小率を含めたカードグループ幅で、ポインター移動量を補正する。
- 操作中はgrab/grabbingカーソルを表示。ドラッグ・慣性中はカードのホバー浮上を止める。通常のホバー停止とキーボードフォーカス停止は維持。
- 左右キーは1カード単位、横ホイール／Shift+ホイールも操作可能。縦スクロールとピンチ操作を奪わない。
- Reduce Motionでは自動移動・慣性を止め、通常スクロールのカード列を手動操作する。

対象: `src/features/onboarding/useStoryCardDrag.ts`、`components/OnboardingStoryScreen.tsx`、`src/styles/onboarding.css`。LP自体、カードデータ、モバイル契約は変更なし。

## 実行検証

- Web 853×893で左・右ドラッグ、リリース後の`is-coasting`、ループ境界をまたぐ移動を確認。
- 左右キー操作でストーリー5を維持。右キーでtransformが -3470.99 → -3695.19px（224.20px＝1カード＋間隔）に移動。
- 1512×982 / 960×800 / 390×844でも実際にドラッグ。全サイズで横はみ出し0px。960×800のグループ実幅1138.77pxを使用し、縮小率を考慮する。
- Web `bun run build` 成功。Impeccable変更対象チェック、`git diff --check` 成功。
- 自動移動の再開を実測: `running`状態でtransformが -2863.75 → -3219.14px に進行。
- desktop `bun run tauri build --debug --bundles app`、`cargo check --manifest-path src-tauri/Cargo.toml`、`git diff --check` 成功。共有3ソースは両リポジトリでバイト一致。
- 新しいmacOSアプリを起動し、プロフィール → ストーリー → 5まで進行。実マウスの左ドラッグでカード列が移動することを前後のスクリーンショットで確認。WebKitでもCSSアニメーションの時刻操作が動作する。
- ビルドにはLottieライブラリのeval、500kB超のチャンク、Rust未使用コード32件の警告が残る。
- 証跡はタスクの `story-card-drag/measurements.json` と各サイズの画像。

## 未検証

- 実機タッチ、OSのReduce Motion切り替え、Windowsは未実施。
- 最新main確認: Web `98f0942` / desktop `46fb478` / mobile `053104b`。
- コミット、PR、本番配布なし。
