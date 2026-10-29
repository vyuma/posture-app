# グラフクリック時のコンフェッティ

確認日: 2026-10-29

- 対象: Web / desktop の `src/features/work/ResultCard.tsx`。
- 獲得結果カードのグラフをクリックした場合も、既存のクリック位置コンフェッティを呼び出す。グラフ上ではカードの押下アニメーションを開始せず、座標を維持する。
- グラフの pointer 操作、キーボード range、ボタンの処理は変更なし。非獲得カードと celebrate=false の既存動作も維持。データ・通信・キャラクター契約の変更なし、モバイル変更なし。
- Web 1280×720 / 1512×982 / 720×512 / 390×844 でクリック時に詳細情報とコンフェッティの同時表示を確認。`is-tapped=false`、グラフ上の tilt は0。canvas は `pointer-events:none`。横オーバーフローなし。
- キーボード ArrowRight で 67:00 / 59点 → 68:00 / 60点に移動。未獲得グラフのクリックは詳細表示のみ、canvas生成なし。
- 実際のmacOS Tauri QAアプリ（1200×752のコンテンツ）でグラフをクリックし、67:00 / 59点の詳細とクリック位置のコンフェッティを同時確認。
- Web / desktop `bun run build`、desktop `cargo check --manifest-path src-tauri/Cargo.toml`、両方の `git diff --check` 成功。従来のバンドルサイズ・Lottie eval・未使用Rustコードの警告あり。Impeccable detector の今回のファイル指摘なし。
- 見た目の寸法・色・文字・既存モーションのタイミングは変更していない。今回の変更はクリック受付条件のみ。Windows実機とタッチ実機は未確認。コミット・push未実施。
- 証跡: Web checkoutの `output/graph-confetti/web-click.jpg`, `web-narrow.jpg`, `macos-click.jpg`。
