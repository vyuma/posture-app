# デスクトップペットの位置保持

右下基準のオフセットを姿勢変更のたびに再適用していたため、モニターの判定や作業領域が変わると位置がずれていた。JSのclient座標差分を物理pxとして渡すドラッグと、JS/Rust双方の±520px制限も撤去した。

- OSのネイティブウィンドウドラッグを使用。権限はcat_overlayのみ。
- 移動イベントの物理座標をアプリデータのpet-position-v2.jsonに保存し、再起動時に復元する。
- 古いlocalStorageの位置はv2ファイルがないときだけ移行する。
- 姿勢変更、停止、非表示・再表示では位置を再計算しない。表示済みの窓へshowを繰り返さない。
- 明示的な「位置リセット」は右下へ戻して保存する。
- macOSはCanJoinAllSpacesとFullScreenAuxiliaryを指定する。

検証: bun run test:overlay-position、bun run test:updates、bun run build、cargo check。回帰テストは旧座標(-2800,-1200)が制限されないこと、状態通知で位置命令が発行されないこと、ドラッグがネイティブAPIに委譲されることを確認する。別bundle identifierのMacテストアプリの起動とネイティブ座標保存ファイル生成を確認した。

未確認: 自動操作ツールがペット窓のドラッグでnoWindowsAvailableとなり、実際のドラッグ・Spaces往復・混在DPIモニター移動の手動確認は未完了。Windowsの仮想デスクトップへの固定はTauriのvisible_on_all_workspacesでは未サポート。外したモニター上に保存した座標は自動変更せず、戻せない場合は既存の位置リセット操作を使用する。
