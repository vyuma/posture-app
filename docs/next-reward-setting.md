# 次の未獲得アナゴの指定

2026-10-29。ユーザー承認: プロフィール→設定で未獲得キャラクターだけ選択し、既存獲得条件を満たす次の1回に適用する。未獲得なら指定は残り、獲得に成功したら通常の選択に戻る。

## 実装

- 設定の先頭に「次に獲得するピンアナゴ」。既存OptionMenu・設定の色/フォント/角丸を利用。番号＋名前で選択。「指定しない」で解除。全実装キャラクター獲得済みなら選択不可と説明。111個の未実装スロットは選択肢に入れない。
- 任意の`Collection.nextRewardId`で後方互換。WebのIndexedDB、desktopの既存SQLite JSON保存に含める。新規APIや別のlocalStorageキーは増やさない。
- 設定時と獲得時に存在・未獲得を検証。結果・カード・指定解除を既存CASトランザクションでまとめて保存。保存失敗/重複実行/競合時にも指定消失や重複獲得を防ぐ。
- 条件未達、認識時間なし、中断復旧、初期化前の古いセッションでは指定を消費しない。初期化は指定も解除。指定なし時の既存選択規則（空コレクションの初回はシマアナゴ）と判定基準は維持。
- WorkAppは保存が成功したCollectionを表示。失敗時は最新Collectionを再取得し設定欄にエラーを出す。保存中もフォーカスを維持するためOptionMenuに既定falseのaria-disabled制御を追加。既存ソート/効果音の挙動・アニメーションは変更しない。
- WorkPreviewの変更はメモリー内サンプルのみ。実データは触らない。

## 検証

- Web/desktopそれぞれ`bun test scripts/work-session.test.ts`: 27 pass、115 assertions。追加6ケースで再起動、1回消費、条件未達/認識不可/中断、保存失敗と再試行、同時確定、重複/未知ID拒否、解除/初期化、古いセッション、古い指定を確認。
- Web/desktop `bun run build`成功。desktop `cargo check --manifest-path src-tauri/Cargo.toml`成功。既存bundle/evalとunused警告あり。
- 実Web WorkAppを別originのテストデータで操作。設定でキングナゴを指定→ページreload→設定に残る→キーボードで解除。指定後のtriggerフォーカス維持、完了ボタンで閉じることを確認。カメラを使う実測定完了は今回実行せず、獲得経路はRepository＋IndexedDBテストで検証。
- Previewでシマ/オト獲得済みの2枚状態: 両者がメニューから除かれ、未獲得18種＋解除が選択可能。全20種獲得時の無効状態も確認。
- 1512×982 / 720×512 / 390×844。設定内横overflowなし、選択ボタン高さ48px、幅696 / 618 / 304px。見出し20px・行高30px、既存設定と同じ色。390pxではメニュー幅304px・高さ264px・縦スクロール848px、各選択肢44px以上。全設定は縦スクロールで到達可能。新Figmaフレームは未指定のため既存設定画面を基準とする。スクリーンショット/測定値はWebの`output/next-reward/`。
- React best-practicesでhook順序、派生候補一覧、保存エラー、キーボードとdisabled状態を確認。新規依存なし。
- macOS実アプリは既存QA画面を読み取れたが、更新/要素操作が進まず実際の設定操作は未検証。desktopコード・ビルド・共通保存ロジックのテスト成功とネイティブ実行検証は区別する。

## 範囲

Web/desktopのmodel、repository、設定UI、WorkApp、WorkPreview、共通OptionMenu、検証テストを更新。キャラクターID・カタログ・画像・星数・取得ペイロード・LAN契約は変更なし。vibe-appは受信済み結果を扱うため変更不要。最新main確認: PiiiN d3c75b7、posture-app 7c0f7f8、vibe-app 053104b。コミット/プッシュなし。
