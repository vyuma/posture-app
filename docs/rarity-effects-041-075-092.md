# 041・075・092 ランク別演出

2026-10-29。ユーザーが既存提案の実装を承認。Webとdesktopのコレクション・詳細・獲得に適用。既存17種の演出、獲得確率、星数、計測データは変更しない。

## Motion thesis

- サクラ: 桜とだんごを楽しむ短い動き。花びら5枚と原本のだんご・頬。hover 0.9秒、詳細1.2秒、獲得1.2秒。
- ミイラ: 目を覚まし包帯がほどける登場。原本の包帯3か所・目を動かす。hover1.2秒、詳細1.5秒、獲得1.7秒。詳細の帯は外周、獲得のマスクは画像領域だけ。
- キング: ゆったりとした登場と金の縁。原本のマント・杖の玉・胸の宝石。hover1.5秒、詳細1.9秒、獲得2.2秒。4個の星を100ms間隔で点灯し金色コンフェティ。
- 新3種は専用の獲得シーケンスを使う。既存のクリックコンフェティは維持。閉じる/保存/グラフの操作をブロックしない。
- 終了後にループしない。Reduced Motionは動きと紙吹雪を止め、静的な背景模様・縁・星を保持。

## 構成

`characterAdditions.json` の `presentation.effect` がプリセットID。時間・紙吹雪の色は `rarityEffects.json`。2ファイルはWeb/desktop/mobileで同一。電話連携は無効のままであり、mobileには任意メタデータだけ同期する。今回の演出UIの対象はWebとTauri desktop。

`scripts/build-character-motion.py` が原本 `public/characters/anago/*/portrait.svg` から意味のあるパーツをグループ化する。path・polygonの輪郭座標を変更していないことを生成時に検証。IllustratorクラスはSVG属性へ展開、SVG IDは描画インスタンスごとに別名として衝突を防ぐ。未同梱のキング頭上装飾は依然追加しない。

`RarityArt` は背景・静止時の枠・一時的な粒子と原本パーツを表示。`ResultCard` の新3種だけ専用獲得時間を使用。新規依存パッケージなし。原本PNG/SVGは維持。

保存/共有は元PNGへ戻し、アニメーション途中の変形・閉じた目・包帯マスク・紙吹雪を除去する。背景模様と金縁は静止装飾として保存する。過去の獲得カードレイアウトと日時位置は維持。

## 検証記録

- Web/desktopとも `bun run build` 成功。カタログ/セッションテストは各23件・119 assertions成功。desktop `cargo check --manifest-path src-tauri/Cargo.toml` 成功（既存unused警告32件）。mobile `npm run lint` と `npx tsc --noEmit` 成功。
- Web実行: 3種の獲得CSS durationは1.2/1.7/2.2秒、iterationは1。だんご、頬、包帯、目、マントの実際のtransform変化を取得。紙吹雪の余韻はカード登場より長く、専用canvasは終了時に破棄。画面をすぐ閉じた場合もcanvasが0に戻る。DOM内SVG ID重複なし。
- hoverとキーボードfocus-visibleで同じパーツの有限アニメーションが実行。既存シマアナゴにはdata-rarity-effectが付かない。タッチ相当のクリックでは詳細を開く際に一度再生。
- Webの実コレクション詳細を1512×982 / 720×512 / 390×844の3解像度×3種で確認。横方向overflowなし。大画面カード911.3828×516.9609px、既存Figma基準911.39×517との差は0.04px以内。絵枠334.4375×337.4453、portrait271.0078×435.9063。原本viewBox・輪郭は維持し、それぞれの花・団子・包帯・杖が見えることを確認。小画面は既存の縦スクロールに沿って表示。
- 3種の保存PNGを実生成、1822×1034。原本PNGと静的模様・縁のみが残り、目やマントの途中形状、包帯マスク、紙吹雪は入らない。追加でキング獲得直後の保存も成功し、白地・4つの星・原本キャラクターが不透明な静止状態になることを確認。
- Web共有ボタンは「画像をクリップボードにコピーしました」まで到達。今回のツールのclipboard読取は空配列となり、貼り付け内容/枚数・Discordへの貼り付けは再確認していない。
- Web/desktopの演出ファイル・元SVG/PNGは同期。共通のcharacterAdditions.json/rarityEffects.jsonは3repoでバイト一致。Web main gzipは今回約218.59kB（変更前約208.35kB、約10kB増）。新規依存なし。
- Reduced MotionはCSS/JSの抑制分岐を確認。OS設定を切り替えた実行検証は未実施。

### macOS確認の制限

実アプリの1200×752で3種の静的装飾・SVG表示は確認。獲得画面への切替後、アクセシビリティツリーには結果内容が存在する一方、画面は背景だけで更新が進まなくなった。ネイティブクリック/スクロールも `noWindowsAvailable` となるため、ロック/非表示状態による停止の可能性があるが原因は未確定。ユーザーのロック解除・ウィンドウクリック後、キング獲得結果が正しく表示されることは確認できた。ただしその後のAX操作による画面遷移は再び途中で止まり、座標クリックは引き続き `noWindowsAvailable`。ロックが継続しているとは断定しない。macOSでの獲得アニメーション全体と今回の保存/共有の実行確認は未完了として扱う。既存画面遷移を変更してこの検証制限を回避してはいない。

新しい動的演出のFigmaフレームはなく、ユーザー承認済みの提案と原本SVGが基準。新装飾をFigmaとの完全一致とは扱わない。証跡はWebの `output/rarity-effects/`、座標とCSS実行値は同ディレクトリの `measurements.json`。

今回コミット/プッシュなし。mobileは任意メタデータのみで、LAN契約/アプリ内UI演出は変更していない。


## サクラのhover点滅修正（2026-10-29）

カード自体がhoverで3px上がるため、静止時の下端3pxにポインターを置くとhoverが解除されて戻り、再びhoverになる。1512×982で18回の連続取得によりhover true/falseと`rarity-dango`/noneの交互切替を再現した。中央では本体opacityは1で安定しており、透明度アニメーションが原因とは判断していない。

Web/desktopの`rarity-effects.css`で、新3種のカードの下端に透明な3pxのヒット領域を追加。カードの3px浮上、portraitの7px移動、花びら・だんご等のキーフレーム/時間は変更しない。絵枠と装飾枠自身の角丸クリップは維持。

修正後、同じ下端位置で18回すべてhover=true、カードy=77pxで安定。だんごは1回動いて元の形状に戻り、再スタートしない。1512×982、720×512、390×844で横overflowなし、絵枠overflow:hiddenを確認。Sakuraのキーボードfocus-visibleによる再生と実コレクションからの詳細表示も成功。実行証跡はWebの`output/sakura-hover/`。

両方の`bun run build`とdesktopの`cargo check --manifest-path src-tauri/Cargo.toml`成功。既存のbundle/eval警告・Rust unused警告あり。macOS実アプリの静的画面は取得できたが、ポインター操作は再び`noWindowsAvailable`となり、今回のネイティブhover実行は未検証。Webでの実行確認とdesktopのビルド確認を区別する。共有カタログ/モバイル/通信/保存形式は変更なし。
