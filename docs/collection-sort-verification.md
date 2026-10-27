# コレクション並び順メニューの検証（2026-10-27）

## 対象と変更

- Web: Kyoung9/PiiiN。確認した origin/main: `9decfa8613bb721da835afcab11f25e42b06978d`。
- Desktop: vyuma/posture-app。確認した origin/main: `b11eaf5fabc40b507808bd474e601ecf338f9672`。
- Mobile: origin/main `053104b4c8348ed0f6cec5406cf87e066001f628`。通信・カタログ契約は変更せず、今回は対象外。
- `Home.tsx` のネイティブ select を `CollectionSort.tsx` に置換。並び順の計算・保存データは変更しない。
- 白い角丸メニュー、選択済みチェック、淡い青のホバー、キーボードフォーカスを追加。マウス選択後の青いアウトラインは表示しない。
- 画面下に余裕がない場合は上に開く。開いたままのリサイズとスクロールにも追従する。
- 既存のアニメーション・transition 宣言は HEAD と一致することを確認。

## デザインの基準と実測

Figma: `IeFQalpaKriMC94IW7S2Mc`, ホーム画面_all `4006:1440`、Group 37 `4057:4890`、Polygon 4 `4057:4893`。
MCP は Starter プランの上限で取得不可。提供された Home all CSS とブラウザーの Design パネルを照合。100% 表示のボタンと実装を並べて比較した。

| 項目 | Figma / 提供 CSS | 実装（1512×982） |
| --- | --- | --- |
| ボタン寸法 | 168×51px | 168×51px |
| コレクション内位置 | x=1296, y=30px | x=1296, y=30.5px |
| 三角形のボックス | 18×18px | 18×18px |
| 三角形のボタン内位置 | x=40, y=15px | x=40, y=15px |
| 文字の左端 | 約66px（100%画像で確認） | 66px |
| 文字 | SF Pro, 18.7774px / 22px, 700, 字間1px | 同値。日本語はOSのフォールバック |
| 通常の文字・三角形の色 | #13A2D7 | #13A2D7 |
| 背景・角丸 | #FFFFFF / 63.4291px | 同値 |
| 枠線 | 1.11043px #F5F5F5 | CSS同値、ブラウザー実測1px |
| 影 | 0 2.22086px 2.77607px rgba(0,0,0,.25) | 同値 |

三角形はFigmaの3頂点・18pxボックスを確認し、同じ正三角形の比率に修正。旧実装は14pxの縦長の三角形だった。新しいメニューはFigmaにない追加デザインで、幅168px、高さ116px、角丸24px、項目高さ48px。項目の文字色 #087DA9 は白背景で4.65:1、選択背景で4.25:1、ホバー背景で3.95:1（18.7774px・太字の大きな文字）を確認。

残る数値差はコレクション見出しの中央揃えによる y=0.5px、枠線の描画丸め約0.11px。フォントのラスタライズはブラウザー・OSで変わる。ホーム全体の既存レイアウト差はこの変更の対象外。

## 実行検証

- Web `bun run build`: 成功。
- Desktop `bun run build`: 成功。
- Desktop `cargo check --manifest-path src-tauri/Cargo.toml`: 成功。既存の未使用ペアリングコード警告あり。
- 既存の Lottie eval / バンドルサイズ等のビルド警告は残る。
- Web（IAB）: 1512×982、720×512、390×844、320×640。横方向のはみ出しなし。720×512と320×640では上側に開き、メニュー全体が画面内に収まる。
- macOS Tauri 実機の開発プレビュー: 1200×752、720×512。選択後のアウトライン、メニュー表示、上方向への配置、方向キー・Enter・Escを確認。
- マウス選択後 `:focus-visible=false` / outlineなし。キーボードでは2pxのフォーカス表示を確認。
- Space・上下キー・Home・End・Enter・Esc・Tab・Shift+Tab・外側クリックを確認。Tabは次のカード、Shift+Tabは前の変更ボタンに移動し、フォーカスを閉じ込めない。
- 2枚の検証用コレクションで、番号順は「シマアナゴ→未獲得2番」、獲得順は「シマアナゴ→オトアナゴ」と実際の並び替えを確認。0枚・17枚でも表示と選択が動作。
- ブラウザーのコンソールエラーなし。
- 検証用fixtureを使用し、ユーザーの獲得データは変更していない。
- Windows実機、VoiceOver読み上げ、実際のタッチ端末は未検証。Webのモバイル幅と44px以上の操作領域は確認済み。

## 証拠と作業状態

Web checkout の `output/collection-sort-verification/` に `comparison.html`, `comparison.png`, `dropdown-detail.png`, 各幅のスクリーンショット、ネイティブ画面、`metrics.json`, `interaction-checks.json` を保存。
この記録は実装検証時点のもの。後続依頼により `fix/home-timer-sound-fidelity` ブランチにまとめて公開する。配布用アプリの再パッケージングは対象外。
既存の未コミットのタイマー変更と、別作業の Desktop MeasureScreen.tsx はそのまま保持。
