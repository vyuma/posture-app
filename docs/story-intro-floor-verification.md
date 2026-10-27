# 初登場時の下端と反動の修正（2026-10-27）

## 同日追補: 元の飛び出す感覚を復元

- ユーザーのフィードバックに合わせ、縦伸縮による反動を廃止。元の560ms、上方向28pxのオーバーシュート → 下方向10px → 0pxの移動とイージングを復元した。倍率は常に1。
- 固定クリップとy=4000まで延長した胴体は維持。初期移動量は通常720px、縦長画面では画面下から確実に登場できる量に拡張する。変更対象は `src/styles/onboarding.css` の登場モーションのみ。
- Web実再生30サンプルで移動量 −27.9983px → +9.94192px → 0px付近を確認。全サンプルで縦横倍率1、下端982px、横はみ出し0px。反動ピークと着地前の画像で胴体の切断面が出ないことを確認。
- 1512×982 / 960×800 / 798×893 / 390×844 / 320×1400で下端差・横はみ出しとも0px。本文は基準画面で x662 / y491 / 640×148px、前回からの配置差0px。Figma静的配置は今回変更していない。
- 証跡: このタスクの `story-pop-restored/motion.json`、`sizes.json`、登場中4枚と上記5サイズのスクリーンショット。
- Web `bun run build`、Impeccable変更対象検査、`git diff --check`: 成功。既存のLottie eval、Tauri import、chunk size警告あり。
- desktop `bun run tauri build --debug --bundles app`（frontend build含む）、`cargo check --manifest-path src-tauri/Cargo.toml`、`git diff --check`: 成功。既存のRust警告32件。Web / desktopのCSSはバイト一致。
- 最新macOS debug bundleを再起動して実再生し、6連続画像で上昇後の反動と着地、下端が画面下まで続くことを確認（`native-pop-0.png`〜`native-pop-5.png`）。前回のnative再生停止は今回再現しなかった。Windows・OS Reduce Motion設定の切替は今回も未検証。
- 以下は初回修正時の記録。縦伸縮の説明・実測は旧版に限る。

## 変更

- Web / desktop のストーリー1で、固定クリップ領域と動くリグを分離。クリップ下端を実ウィンドウの床に一致させる。
- 560ms の登場は下から一度だけ上がり、床を変形原点として縦倍率 1.035 → 0.98 → 1 で反動を付ける。上方向の translate による下端の浮きを廃止。
- Lottie の各ポーズに y=4000 までの下部延長を追加。既存カーブ・顔・縞・ポーズタイミングは変更しない。全244個のボディ形状キーを生成前後で比較し、延長部以外の完全一致を確認。
- 読み込み前・失敗時の短いPNGを、同じ初期ポーズから生成する `intro-story.svg` に置換。Lottieと同じ座標・寸法の長い胴体を使う。
- ストーリー4・5、矢印、本文、カタログ、モバイル通信、キャラクターIDは変更しない。モバイルは今回のストーリー専用素材を使用していないため変更なし。

最新main確認: Web `98f094280d136a06a4c157582b9831d7ce225b7b` / desktop `46fb478b273e3b0a458d76fb127440462dea1a94` / mobile `053104b4c8348ed0f6cec5406cf87e066001f628`。

## Webでの実測

| viewport | クリップ下端と画面下端の差 | 横はみ出し |
| --- | --- | --- |
| 1512×982 | 0px | 0px |
| 960×800 | 0px | 0px |
| 844×390 | 0px | 0px |
| 853×893 | 0px | 0px |
| 390×844 | 0px | 0px |
| 320×568 | 0px | 0px |
| 320×1400 | 0px | 0px |

1512×982で登場中28サンプルを記録。縦倍率1.035から0.983を経て1へ戻る実再生中も、クリップ下端は982pxで固定。静止後の本文は x662 / y491 / 640×148px で、既存のFigma基準値からの配置差0px。顔・縞のSVG境界も元の数値を維持する。新しいFigmaの取得は行わず、前回比較済みの基準値と現在の実測を比較した。

証跡: このタスクの `story-intro/measurements.json`、登場中4枚と上記7サイズのスクリーンショット。

## 検査

- Web `bun run build`: 成功。既存のTauri event静的/動的import警告のみ。
- `node --test scripts/anago-lottie.test.mjs scripts/anago-expressions.test.mjs scripts/story-assets.test.mjs`: 12件成功。
- Impeccable変更対象検査: 指摘なし。
- `git diff --check`: 成功。
- desktop `bun run tauri build --debug --bundles app`（frontend build含む）、`cargo check --manifest-path src-tauri/Cargo.toml`、story-assets 4件、`git diff --check`: 成功。Rustの未使用コード等の警告32件あり。
- 両リポジトリの変更対象7ソース／生成ファイルがバイト一致。
- 公式Diffusion Studio / Skottie の `piiin-expressions/scene-2` に登録し、frame 0 / 30 / 61の描画を確認。コンソールerror/warnなし。

## 制限

- Reduce Motionの既存CSSは登場アニメーションを無効にする。OS設定を切り替えた検証は未実施。
- Windows実行・実機タッチ操作は未検証。極端に縦長な無制限サイズでの保証はしていない。
- macOS debug appを実行し、ホーム → ストーリー → はじめるの遷移は確認したが、自動操作中に文字とキャラクターのCSSアニメーションが開始状態に留まった。ウィンドウをRaiseしても改善せず、nativeの動的な見た目を検証済みとはしない。上記の登場・反動の実再生検証はWebでの結果。
- ローディング失敗の強制注入は未実施。SVGの同一初期形状と読み込みフォールバックのコードを確認した。
- コミット・PR・本番配布は行っていない。
