# PCとモバイルのコレクションリセット同期

## 問題と修正

従来のPCリセットはローカル配列のみを消し、モバイル削除送信関数は未使用だった。旧削除通知も一回限りでACKがなく、完了結果ジャーナルから報酬が再生される問題があった。

リセット時はPCの永続ストレージへ `sourceId` と累積 `measurementIds` を先に保存する。保存失敗時はリセットを中止し表示する。保存後にローカル表示を消し、既存の2秒間隔再送処理が `emit_acquired_characters_cleared({reset})` を呼ぶ。PCを途中で終了しても、起動時のコレクション読み込みが削除IDを除外し、リセット記録を再送する。測定履歴そのものは消さない。

WSには `collection_reset`（eventId/sequence/requiresAck）と `collectionReset: {sourceId, measurementIds}` を追加。snapshotとイベント再送にも最新記録を含め、ACK後も再接続で復元する。モバイルは削除IDの永続化→コレクション再構築・保存→ACK(status=stored)の順。保存途中の失敗はACKせず、次回配送・起動で修復する。新しい測定IDの報酬は古いリセットの再送で消えない。

モバイルは結果履歴からの復元にも同じ削除フィルターを適用する。新規データにはPC sourceIdを付け、別PCの記録を保持する。旧カードにsourceIdがない場合はPCが列挙した測定IDの一致だけで削除対象とする（他PCと同一IDを手動作成した旧データは区別できない）。削除IDは意図的に累積保持し、日時比較・端末時計には依存しない。

旧 `acquired_characters_cleared` は使用しない。旧モバイルが遅延再送を全件削除として扱うことを避けるため。新旧混在では旧モバイルのリセット同期は未対応であり、両方の更新が必要。

## 検証

- PC `bun run build`、Rust `cargo check`、Rustテスト4件（実HTTP/WebSocket接続、オフラインリセット→snapshot→再送→ACK→再接続を含む）通過。
- mobile lint、TypeScript、pairing 8件、contracts 3件通過。
- 保存失敗・部分保存からの復旧・プロセス再起動・結果再送・二重リセット・リセット後の新規獲得・別PCの報酬保持をメモリストレージで検証。実際のユーザーデータのリセットは未実施。
- ソケット試験はこのMac上。実iPhoneの同一LAN、ロック・アプリ強制終了・TestFlightインストールでの操作は未検証。

## 実機受け入れ手順

PC 0.1.4 と対応する新TestFlightビルドに更新し、Metroを停止した状態で行う。コレクションリセットは実データを消すため、消してよいテスト用の獲得で実施する。

1. PCとiPhoneをペアリングし獲得。PCでリセットし、前景のモバイル一覧と開いていた詳細が更新されること。
2. iPhoneをロックしてPCでリセット。PCはモバイルを待たず完了。解除・アプリ復帰で消去されること。
3. Wi-Fi切断中にもリセット。復旧・再接続、さらにモバイル強制終了後の起動でも古いカードが戻らないこと。
4. PCも終了・再起動し必要なら再ペアリング。リセットが保持されること。
5. 新しく測定して同じキャラクターを再獲得し、再接続しても1件だけ残ること。
6. 過去の測定時間・姿勢結果が履歴として残り、進行中の別測定が古い通知で終了しないこと。

画面ロック中の即時実行・通知は保証しない。復帰時のLAN同期によって反映する。公開/インストール完了と実機検証完了は分けて記録する。

## 配布結果（2026-09-19）

- PC 0.1.4: https://github.com/vyuma/posture-app/releases/tag/v0.1.4 — Universal app/DMGの署名、公証、staple、Gatekeeper、SHA-256検証成功。公開latest.jsonも0.1.4を返すことを確認。このMacで新パッケージを起動し既存コレクション1/111が保持されていることをUIで確認。コレクションリセット自体は実データ保護のため操作していない。
- Mobile 1.0.0 (5): https://expo.dev/accounts/kyoung9/projects/vibe-app/builds/a2197f80-ca56-4162-862b-1ec6582d7151 — EASビルド成功、Appleアップロード成功。App Store Connectで処理終了・Team (Expo)グループへの割当を確認。
- Submission: https://expo.dev/accounts/kyoung9/projects/vibe-app/submissions/59de10ae-7467-4882-bf89-11dea61816f5
- PCコード: https://github.com/vyuma/posture-app/pull/22 （配布コミット843ef2e）
- Mobileコード: https://github.com/vyuma/vibe-app/pull/9 （配布コミット2849163）
- iPhoneでの新ビルドのインストール、実際のリセット・ロック・再接続は未検証。PCを再起動したため、必要に応じ新しいQRで再ペアリングする。
