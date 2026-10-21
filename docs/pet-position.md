# デスクトップペットの位置保持

## macOS Spaces / フルスクリーン

通常のTauriウィンドウにSpaces関連フラグを設定したv0.1.7でも、他アプリのフルスクリーンSpaceへ移動するとペットが消えた。実機比較では、既存NSWindowのNSPanelへのクラス変換でも再現が残り、初期化時からNonactivatingPanelを指定した新規NSPanelでは表示が維持された。

macOSでは `overlay/native_macos.rs` がこの新規NSPanelを管理する。Tauriのホストウィンドウとルートビューは非表示のまま保持し、その子WebViewだけをパネルに移す。既存のIPC・イベント・フロントエンドを維持し、表示、非表示、位置、ドラッグをパネルに対して実行する。

- `CanJoinAllSpaces | FullScreenAuxiliary` と floating レベルを設定する。
- 表示には `orderFrontRegardless` を使い、作業中のアプリをアクティブ化しない。
- ユーザーの指定位置をメモリ上で保持する。OS由来の移動・Spaces変更では指定位置へ復元し、保存ファイルを上書きしない。
- 明示的なドラッグ、初回復元、位置リセットだけが保存位置を更新する。
- AppKit操作と通知処理はメインスレッドで行い、通知オブザーバーは所有者と共に解除する。

### ドラッグの完了判定

`performWindowDragWithEvent` はWindowServerへ処理を渡した直後に戻り、mouse-upがWebViewへ届く保証もない（[Appleの説明](https://developer.apple.com/documentation/appkit/nswindow/performdrag(with:))）。IPCの終了をドラッグ終了として扱うと、移動中に位置復元が働き元へ戻ってしまう。

そのためドラッグ中だけ20ms間隔で実際のマウスボタン状態を確認する。押されている間は位置復元を停止し、離した後の最終座標を保存して `overlay:dragged` を通知する。ポーリングはジェスチャーが終了すると停止する。`overlay_start_drag` はペットWebViewからのみ受け付ける。

## 共通動作

- 物理座標をアプリデータの `pet-position-v2.json` に保存し、再起動時に復元する。既存の保存形式を維持する。
- 古いlocalStorageのオフセットはv2ファイルがないときだけ移行する。
- 姿勢変更、停止、非表示・再表示では位置を再計算しない。
- 明示的な位置リセットは現在の画面の右下へ戻して保存する。
- クリック（移動4px未満）はメインアプリを開き、4px以上の移動はネイティブドラッグへ渡す。キャンセルとドラッグはアプリを開かない。
- macOS以外は既存のTauriウィンドウ・ドラッグ処理を使用する。

## 検証

2026-10-21、macOS 26.5.1で、利用者が新規NSPanelでのフルスクリーン表示を確認。ドラッグ完了判定の修正後、実際のトラックパッドによるSpaces往復とドラッグした位置の維持も確認した。最終ハーネスは終了コード0で完了し、再起動後の保存座標 (2980, 1698) の復元、OS変位の復元、保存ファイルの不変、ドラッグ継続中の移動通知、非表示・再表示を通過した。`bun run tauri build --debug --bundles app` でローカル検証用アプリも生成済み。

- `bun run test:overlay-position`: 旧座標の復元、状態通知で再配置しないこと、クリック・ドラッグ・キャンセル・Enter、ドラッグ完了通知でヒントを消すこと。
- `bun run build` と `cargo check --manifest-path src-tauri/Cargo.toml`。
- `src-tauri/examples/overlay_spaces_probe.rs`: 本番のオーバーレイ実装をそのまま使うネイティブ回帰ハーネス。カメラとペアリングサーバーは起動せず、保存先も別identifierに分離する。

ハーネスは別ターミナルで `bun run dev` を起動した後、`cargo run --manifest-path src-tauri/Cargo.toml --example overlay_spaces_probe` で実行する。macOSでは通常の `.app` バンドルから起動すると自動操作ツールからも選択できる。標準入力へ `verify` を送ると、OS由来の変位の復元、保存ファイルの不変、非表示・再表示、WindowServerがドラッグを継続中の移動通知、離した後の新しい基準位置を実際のNSPanelで検証する。`quit` で終了する。自動検証は `cargo run --manifest-path src-tauri/Cargo.toml --example overlay_spaces_probe -- --verify-and-exit` で実行でき、成功時は終了コード0、失敗時は非0を返す。Spaces往復は実際に行い、ログの `active_space` と目視を併せて確認する。

未確認: 混在DPIの複数モニター、モニター切断後の復帰、Windows実機。Windows仮想デスクトップへの固定はTauriの `visible_on_all_workspaces` では未サポート。保存先の画面が外れた場合は既存の位置リセットを使用する。
