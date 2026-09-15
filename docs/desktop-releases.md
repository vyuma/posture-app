# デスクトップの署名・配布・更新

## 配布先

- macOS: Developer ID Application 署名 + Apple 公証。GitHub Releases の署名付き Universal アーカイブで更新する。
- Windows: Microsoft Store に MSIX を提出する。Store の署名・配信・更新を使うため、有料 Authenticode 証明書は購入しない。Store 審査完了までは未公開。
- Web / Expo: このリリース手順の対象外。

## macOS

初回だけ `node scripts/setup-updater-key.mjs` を実行する。秘密鍵は `~/.tauri/piiin/updater.key`、公開鍵だけが `tauri.conf.json` に入る。秘密鍵は権限 600 のファイルとして保存される。鍵を失うと既存インストールへの更新を継続できないため、所有者の安全なバックアップに保管する。GitHub や第三者のリポジトリへは送信しない。

キーチェーンに秘密鍵付きの Developer ID Application 証明書と、同じチームの `notarytool` 資格情報プロファイルが必要。既存の有効な資格情報を利用でき、新規発行や既存証明書の失効は不要。

```sh
APPLE_SIGNING_IDENTITY='Developer ID Application: <名前> (<TEAM_ID>)' \
PIIIN_NOTARY_PROFILE='<キーチェーンのプロファイル名>' \
bun run release:macos
```

事前に `rustup target add aarch64-apple-darwin x86_64-apple-darwin` を実行する。`package.json`、`src-tauri/Cargo.toml`、`tauri.conf.json` のバージョンをそろえ、`Cargo.lock` も更新する。

スクリプトは Universal app をビルドして署名を検査し、アプリを公証→staple→Gatekeeper 検査する。その後更新アーカイブを作成・署名し、DMG も公証・staple する。`release-artifacts/v<version>/` に DMG、更新用 tar.gz / sig、latest.json、SHA256SUMS、Apple の公証結果を出力する。途中で失敗した場合は前回の出力を移動して再実行する。公開済みバージョンの内容を差し替えない。

GitHub Release のタグは `v<version>`。DMG、tar.gz、sig、latest.json、SHA256SUMS を同じ Release にアップロードする。まず draft で揃え、署名と起動確認の後に公開する。エンドポイントは `https://github.com/vyuma/posture-app/releases/latest/download/latest.json`。下書きは未認証クライアントから見えないため、公開前は更新確認が失敗する。

アプリは起動時に確認し、Mac の PiiiN メニュー「アップデートを確認…」から再確認できる。登録中・測定中は更新ダイアログを出さず、ホームに戻ってから表示する。ユーザーが「更新して再起動」を選択するまでダウンロード・インストールしない。更新中はモーダルで操作を制限する。署名検証とインストールが成功した場合のみ再起動する。既存の更新機能がない 0.1.0 は最初の一度だけ新しい DMG からインストールする。

## Windows MSIX

2026-09-14 に Partner Center で `PiiiN` を予約済み。Store ID は `9NC4NF85BTNT`、製品は提出前の draft。`src-tauri/store-identity.json` に実際に割り当てられた公開識別子を保存してあり、パッケージスクリプトは既定でこれを利用する。予約画面によると 3 か月以内の提出が必要。別のアカウントへ配布先を変更するときは次の値を Partner Center で再確認する。

- Package/Identity/Name
- Package/Identity/Publisher
- PublisherDisplayName

WebView2 は Microsoft 公式サイトから x64 Fixed Version を取得し、ライセンスへの同意後に展開する。展開時は `expand.exe <cab> -F:* <展開先>` を使う。ランタイム全体（第三者ライセンス通知を含む）を同梱する。新しい Store リリースごとにサポート中のランタイムへ更新する。

Windows SDK、Rust MSVC、Bun のある Windows 環境で実行する。
Windows PC がない場合は、main へ取り込んだ後に GitHub Actions の `Windows Store package` を手動実行する。既定値は所有者がライセンスへ同意して取得した x64 WebView2 `153.0.4234.32`。更新する場合は同意済みの Microsoft 公式 CAB URL と SHA256 の両方を指定する。チェックサム・Microsoft 署名・x64 アーキテクチャを検査し、MSIX を検証用 Artifact として出力する。Store への申請・公開は自動実行しない。

```powershell
./scripts/package-windows-store.ps1 `
  -WebView2Directory '<msedgewebview2.exe が入った展開先>'
```

スクリプトは Microsoft の署名を検査し、WebView2 の場所をアプリへ組み込み、Tauri exe とランタイム・アイコン・manifest を MSIX にする。最低 OS は Windows 10 2004。`release-artifacts/windows-<version>/` の unsigned MSIX を Store に提出する。Store 配信署名の代わりに自己署名証明書を一般利用者へインストールさせない。Windows には Tauri Updater プラグインを組み込まない。

Store の先頭バージョンは 0 にできないため、MSIX バージョンはアプリの `major+1.minor.patch.0` に変換する。アプリ `0.1.1` は Store `1.1.1.0`。Tauri がビルド時に参照する `src-tauri/WebView2` はスクリプトが一時作成し、ビルド後に削除する。既存の同名ディレクトリがあれば上書きせず停止する。

2026-09-14 に [Windows Store package の実行](https://github.com/vyuma/posture-app/actions/runs/34844361772)で MSIX 生成・MakeAppx 検証まで成功した。Store 登録状況と公開前の残件は [申請メモ](store-submission-notes.md)を参照する。

`runFullTrust` は既存のデスクトップアプリを動かすために必要。審査にはカメラによる端末内の姿勢検出、デスクトップオーバーレイ、同じ LAN 上のモバイル連携を説明する。WebView2 のライセンス/データ収集告知、アプリのプライバシーポリシー、スクリーンショット、年齢区分を実際の処理に合わせて用意し、公開前に確認する。

## 検証ゲート

`bun run test:updates` は測定中の更新禁止、ダウンロード/署名エラーで再起動しないこと、二重実行と閉じる操作の防止、ブラウザーからネイティブ更新を呼ばないことをモックで検証する。実際の暗号署名の検証や OS の置き換えテストとは区別する。

`bun run build` / `cargo check --locked --manifest-path src-tauri/Cargo.toml` を実行する。GitHub の Desktop checks は Mac と Windows で静的検査し、Windows exe もコンパイルする。CI exe は検証用で Store 提出物ではない。

実機では以下を確認してから公開する。

- Mac: Gatekeeper、公証チケット、arm64/x86_64、初回起動、更新メニュー、0.1.x → 次版への署名検証・置き換え・再起動、コレクション保持。
- Windows: 実際の Store identity を使った MSIX、クリーンな Windows 10/11 での起動、カメラ許可、オーバーレイ、LAN ペアリング、更新後の保存データ維持。
- Store の本人確認・審査、実機のカメラ/LAN、実際の版間更新はビルド成功だけで完了扱いにしない。

公式資料: [Tauri Updater](https://v2.tauri.app/plugin/updater/)、[macOS 署名](https://v2.tauri.app/distribute/sign/macos/)、[MSIX 生成](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-manual-conversion)、[WebView2 配布](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution)。
