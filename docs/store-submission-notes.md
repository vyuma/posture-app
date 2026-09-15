# PiiiN Store 申請の確認メモ

この文書は申請準備用。公開済みのプライバシーポリシーや審査合格の証明ではない。

## 登録済み

- Store ID: `9NC4NF85BTNT`
- Identity: `Kyoung.PiiiN`
- Publisher: `CN=227AFB3D-612C-4C58-9896-3524159B2EF4`
- 表示名: `PiiiN` / 発行元: `Kyoung`
- 提出先: Submission 1（下書き、2026-09-14 作成）
- 配布方式: Microsoft Store が MSIX を再署名する方式。有料コード署名証明書は購入していない。

## パッケージ

アプリのバージョンは `0.1.1`。Store は先頭が 0 のバージョンを認めないため、MSIX のみ `major+1.minor.patch.0` に変換する（今回は `1.1.1.0`）。将来の `1.0.0` も `2.0.0.0` になり、更新順序が逆転しない。

所有者が 2026-09-14 にライセンスへ同意し、Microsoft から取得した x64 WebView2 `153.0.4234.32` を同梱する。CAB の SHA256 は `2cb653a74426f0aa802c2396775c6bc674fd662d5396bd677f47bfa6e12eba9c`。Windows CI はこの値、Microsoft の Authenticode 署名、x64 アーキテクチャを検証する。

コミット `164303c` の [MSIX 作成](https://github.com/vyuma/posture-app/actions/runs/34844361772)が成功。固定ランタイムのビルド時配置を修正し、Tauri の Windows release ビルドと Windows SDK MakeAppx の形式検証を通過。`piiin-store-submission` Artifact に MSIX とハッシュを保存した。同じコミットの [Mac/Windows 検証](https://github.com/vyuma/posture-app/actions/runs/34844365688)も成功。

MSIX の SHA256 は `34473eb1223ce741a7631d1e0bf32ce80938e745ebdd9e2da0950d772c4182d9`（323,548,976 bytes）。ダウンロード後に CI のハッシュ、Store identity、バージョン、アプリ・ランタイムの x64 PE ヘッダー、44/150/50px のアイコン、ランタイムのライセンス通知を確認した。

## コードで確認した処理

|項目|確認した処理・根拠|
|---|---|
|カメラ|`usePostureTracking.ts` の `getUserMedia` で映像を取得し姿勢推定に使う。`audio: false` でマイクを要求しない。|
|推論モデル|`posture/constants.ts` の Google Storage と jsDelivr URL からモデル・WASM を取得する。WebView2 同梱後も初回の姿勢推定には通信が必要。|
|コレクション|`characterStorage.ts`、`favoriteCharacterStorage.ts`、`profileCharacterStorage.ts` により端末の localStorage に保存する。|
|スマホ連携|LAN の HTTP/WebSocket サーバーとペアリングトークンを使用。`pairing/types.rs` にホスト・ポート・トークン・端末名・最終接続時刻が定義されている。|
|Windows 更新|Tauri Updater は組み込まず、Store の配信更新を利用する。|

プライバシーの判断では「開発者のサーバーに映像を送らない」だけを理由に「個人情報へアクセスしない」と申告しない。カメラへのアクセスと外部モデル取得、WebView2 のデータ取扱いを公開ポリシーで説明する必要がある。

## Store に保存済み

- 所有者の承認に基づきカテゴリを「ヘルスケア & フィットネス」、個人情報の使用を「はい」で保存。
- プライバシーポリシーは Store のテキスト入力方式で登録。原稿は `privacy-policy.ja.draft.md`。別の公開 URL は不要。
- 所有者指定の問い合わせ先 `gwakkyoungpin@gmail.com` をサポート欄とポリシーへ登録。
- カメラを最小ハードウェア要件として指定。
- 2026-09-14 に Submission 1 の「プロパティ」が「完了」になったことを確認。まだ Store の公開・審査は行っていない。
- MSIX をアップロードし、Store が `v1.1.1.0 / X64 / Windows.Desktop / min 10.0.19041.0` と認識。「パッケージ」が「完了」になったことを確認。
- 配布対象は Windows 10/11 Desktop のみ。将来のデバイスファミリーへの自動拡張は選択していない。
- `runFullTrust` の用途（Tauri デスクトッププロセス、WebView2、オーバーレイ、LAN 連携）を申請オプションに記載し、同セクションが「完了」になったことを確認。承認済みという意味ではない。
- 認定後も「今すぐ公開」を選ぶまで公開しない手動公開を指定。
- 日本語の説明・短い説明を Store 登録情報へ入力。Windows の実スクリーンショットが必要なため、このセクションは未完了。原稿は `store-listing.ja.draft.md`。

## 公開前に残る確認

- 実際の Windows 画面の Store スクリーンショット、年齢レーティング、配信地域・価格。
- Store が提示した `runFullTrust` 制限付き機能の審査承認。

カテゴリとプライバシー申告は自動承認レビューの確認要求後、所有者の明示承認を得て適用した。アクセシビリティ試験合格など、未検証の認証にチェックを入れない。

Windows 実機でのカメラ許可・姿勢測定・オーバーレイ・LAN ペアリング・更新後データ維持は、CI のコンパイルや Store のパッケージ形式検証とは区別して確認する。

資料: [Microsoft の MSIX 要件・バージョン規則](https://learn.microsoft.com/en-us/windows/apps/publish/publish-your-app/msix/app-package-requirements)。
