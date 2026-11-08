# 統合・分析の運用

## 基準と移行

この変更はデスクトップ PR #34 の `e8a1186` を基準に、ウェブ PR #31 の `af8e477` と保存用 PR #32 の `c997009` から選別した現行ファイルを取り込んだ。非公開リポジトリのGit履歴や内部監査資料は公開リポジトリへ取り込んでいない。ストア審査状況はコード統合の完了条件とは別であり、PR #34 自体を承認・マージしたわけではない。

| 責任 | 場所 |
| --- | --- |
| 共通測定・キャラクター・設定 | `src/features/` |
| ウェブ入口・プラットフォーム差し替え | `web/`, `vite.web.config.ts`, `*.web.ts` |
| デスクトップ入口・OS保存・通信 | `src/main.tsx`, `src-tauri/` |
| 分析契約とサーバー | `shared/telemetry.ts`, `server/` |
| モバイル同伴アプリ | 別リポジトリ `vyuma/vibe-app`。今回変更なし |

## ローカル開発と検査

Node 24.22.1、Bun 1.3.13 を使う。Bun のパッケージ管理は維持し、cf はNodeで実行する。Cloudflareの設定APIとVite v2はベータのため、`bun.lock` の版を固定して更新時にWorkerの実行検査を行う。

```
bun install --frozen-lockfile
bun run build
bun run build:web
bun run test:accounts
npm run test:server
bun run test:work
bun run test:updates
bun run test:overlay-position
cargo check --locked --manifest-path src-tauri/Cargo.toml
cargo check --locked --manifest-path src-tauri/Cargo.toml --no-default-features --features mac-app-store
bun run dev:web
```

UIテスト用の認証モックと、実際のGoogle/Apple OAuth・署名付きアプリ・ストア審査は別の検証である。既存のBunモジュールモックを使うUIテストはコマンドを分ける（同じプロセスにまとめるとモックが漏れる）。

## Cloudflare の初期設定

1. 管理者が `cf auth login` で対象アカウントにログインし、Workers有料プランと非公開R2を用意する。D1は本番・プレビューで分離する。R2の公開URLとカスタムドメイン公開を有効にしない。
2. D1のUUIDを `PIIIN_D1_ID` に設定。`node node_modules/cf/bin/cf d1 migrations apply "$PIIIN_D1_ID" --dir server/migrations` を実行する。新規デプロイ前に適用し、既存スキーマの破壊的ロールバックはしない。
3. GitHub environments `cloudflare-production`, `cloudflare-staging`, `cloudflare-preview` に限定した `CLOUDFLARE_API_TOKEN` を登録し、変数 `CLOUDFLARE_ACCOUNT_ID`, `PIIIN_D1_ID`、staging/preview用 `WORKERS_SUBDOMAIN` を登録する。3環境のD1を分離する。fork PRには秘密を渡さない。既存環境の変数登録と、新規環境作成の権限は別であり、後者はリポジトリ管理者が必要。
4. Google OAuth Web clientに正規URLと `/api/auth/callback/google` を登録。Apple Services IDに `/api/auth/callback/apple` を登録し、Apple Team/Key/秘密鍵を用意する。People追加権限は初期状態で無効。
5. Worker Secretsに `BETTER_AUTH_SECRET`（32文字以上の無作為値）、Google client ID/secret、`EXPORT_TOKEN` を登録し、ビルド変数 `PIIIN_AUTH_ENABLED=true` を有効にする。Appleを使う場合は `PIIIN_APPLE_ENABLED=true` と `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` を登録する。キー更新時はApple失効・削除処理も確認する。
6. 既存開発者ログインは `PIIIN_DEVELOPER_ENABLED=true` と `PIIIN_DEV_USERNAME`, `PIIIN_DEV_PASSWORD`, `PIIIN_DEV_SESSION_SECRET` で引き継ぐ。値をGitやPRに書かない。
7. Workers/D1/R2使用量と請求通知をCloudflareアカウントで設定する。月5〜10米ドルは運用目標であり上限ではない。サンプル数・D1行読み取り/書き込み・R2容量/操作・Worker CPUを監視する。アプリ側は圧縮・分割・入力上限・レート制限を設ける。

認証未設定でもゲスト利用は可能で、ログインボタンは準備中のエラーを表示する。Mac App Storeへの提出前にはAppleをGoogleと同等に有効化し、サンドボックス署名後のKeychainとシステムブラウザーを実機確認する。

Google OAuthにはGoogle CloudプロジェクトとWeb clientが必要だが、Cloudflareの課金者と同一の所有者である必要はない。Google設定が完了するまでは`PIIIN_AUTH_ENABLED=false`、追加プロフィール権限も無効のままにする。Googleログインを確認済みとは扱わない。

初回の秘密値投入は、対応する`PIIIN_*_ENABLED=true`でビルドし、`cf deploy --prebuilt --mode preview --secrets-file <private.json>`（本番は`--mode production`）でバージョンと一緒に適用する。JSONは名前→文字列値の対応とし、Git外・所有者のみ読み書き可能なファイルを使って、投入後に削除する。秘密値をコマンド引数やログへ記載しない。無効時の空文字バインディングと同名のsecretを`workers secrets bulk`で先に作ると、`Binding name already in use`になるため注意する。

## 配布と切り戻し

PRは共通・サーバー・macOS・Windowsの検査後、`piiin-pr-N` Workerにプレビューを出す。本番と共有しないD1・R2を使い、テスターの実データは入れない。PRプレビューにはOAuth・開発者ログイン資格情報を渡さない。mainは検査成功後 `piiin` を更新する。ドメイン切替前は `PIIIN_DOMAIN_ENABLED` を無効のままにする。

固定の`piiin-staging`を実OAuth検証に使う。workflow_dispatchの`deploy=staging`で配布し、`checks`では配布しない。`production`の手動配布はmainに限定する。新規ワークフローがデフォルトブランチへ入る前はローカルCLIで同じビルド・配布を行う。preview/stagingはビルドと配布の両方に`--mode preview`を渡す。モードを省略した配布で本番設定を混ぜない。

リポジトリ変数`PIIIN_CLOUDFLARE_CI_ENABLED=true`のときだけGitHubから配布する。2026-11-08にCI接続を保留する指示があったため、現在は無効。共通・サーバー・macOS・Windowsの検査は継続する。管理者が3環境の資格情報を登録した後に有効化する。配布のskipを実デプロイ成功と扱わない。

`scripts/cloudflare-preflight.mjs <preview|staging|production>`は未設定値・Worker名・正確なHTTPS origin・UUID・誤った公開ドメイン/認証フラグを検査する。ローカルOAuth認証なら`--local-auth`を加える。`PIIIN_PRODUCTION_D1_ID`も渡すと、本番DBとの取り違えを拒否する。

配布後に`node scripts/check-web-deployment.mjs <origin>`で公開経路、最新Macインストーラー、匿名セッション、開発者認証設定を検査する。`PIIIN_AUTH_ENABLED=true`の場合はGoogle認証開始とcallback originも検査するが、プロバイダーへの実ログインは別途ブラウザーで行う。診断はOAuth URL/state・Cookie・秘密値を出力しない。

プレビューでLP、`/app`、`/privacy`、`/support`、`/login`、開発者API、`/api/download-mac`を確認する。実OAuthは登録済みの専用検証URLで行う。本番デプロイ確認後、管理者が既存DNS/Vercel設定を保存して `www.piiin.app` をWorkerへ切り替える。同じHTTPS originとパスを保つことで既存ブラウザー保存先を維持する。Vercelプロジェクトは初期移行期間中に削除しない。切り戻しはDNS/ドメインを保存済みのVercel構成へ戻し、新規送信はローカル待機にする。D1・R2を巻き戻したり消したりしない。

実際の切替はCustom Domainではなく、既存Vercel CNAMEを残すHTTPS Worker routeを採用した。`www`のDNSをプロキシ有効にし、`PIIIN_DOMAIN_ENABLED=true`で`https://www.piiin.app/*`を`piiin`へ接続する。既存CNAMEがある場合、Custom Domain APIは100117で拒否する。route方式ではCNAME削除による空白期間を作らない。切り戻しは`PIIIN_DOMAIN_ENABLED=false`で再ビルドしてtriggerを配布し、`www`を元の`proxied=false`に戻す。apexの既存Vercel 308転送も維持する。バージョン単位のPreview URLsは無効にし、固定staging/PR Workerを検証に使う。

Cloudflareから匿名GitHub APIが403になることを実環境で確認した。Macダウンロードはこの場合、GitHubの公開`releases/latest`のリダイレクトから同じ最新タグを確認し、そのタグのuniversal DMGが存在することをHEADで検証してから案内する。過去のインストーラーや任意の外部URLにはフォールバックしない。公開APIにも公開リリースにも到達できなければ503と再試行案内を維持する。

## リリース

`vMAJOR.MINOR.PATCH` タグで各チャネルを独立実行する。現在のMac Store版が1.0.0のため全チャネル共通タグは1.0.0以上とする。既存版からの増加を確認してタグを作る。識別子・アップデート公開鍵・ダウンロードURLは変更しない。Store build番号は既存値とGitHub run番号から増加する。

`direct`, `mac-app-store`, `microsoft-store` GitHub environmentsに専用の資格情報を設定する。Macは署名証明書（StoreはApplicationとInstallerの両方）、パスワード、署名ID、ASC API key/issuer/private keyを必要とする。直接配布は既存の updater private/public keyも必要。Storeは配布用provision profileを必要とする。Macは署名・公証後にReleaseを公開し、StoreはFastlaneで審査提出・承認後自動公開を指定する。Windowsは既存MSIX identityで作成し、Partner Centerに提出して承認後自動公開を指定する。

Microsoft APIには初回の年齢区分を含む提出とAzureアプリの関連付けが必要。`MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` を環境に設定する。既存の未完了提出を自動で破棄しない。チャネル失敗は同じタグを `workflow_dispatch` の `channel` で選び再試行する。公開済みGitHub Releaseは上書きしない。Store処理中の再試行は提出状況を確認してから行う。

## 分析の読み方・内訳の保管

`measurements.completed_at` がある記録だけを完了測定として集計する。部分アップロードもエクスポートには `complete=false` で残す。初回受信日時は別のreceiptで固定し、同意世代が変わっても同じ測定を重複集計しない。過去記録の取得環境が不明な場合は `metadataBasis=reconstructed` と `appVersion=unknown` を明示する。

良い姿勢率は `ratioBasis` とセットで扱う。`observableRatio=validMs/focusMs`、判定版、基準区間数、手動/自動送信を併記する。サーバーに来ていないローカル記録の存在は分からないため、未送信日を不使用日と断定しない。顔・肩の認識不能を悪い姿勢の実測値として扱わない。部位別原因や医学的な改善は分析対象外。

```
PIIIN_EXPORT_TOKEN=... node scripts/export-analysis.mjs output=/private/analysis.json from=2026-11-01T00:00:00Z to=2026-12-01T00:00:00Z
```

トークンはシェル履歴に直接入力せず安全な環境から渡す。`format=csv`、`user=<analysisId>`、`platform=web|macos|windows`で絞る。`view=series` は点数・偏差・認識状態とイベントをJSON/CSVで返し、`recordType` で区別する。各ページは最大10分割分で、未完了記録には `complete=false` が付く。任意プロフィールは `view=profiles` のJSONで取得する。エクスポート先は公開Gitリポジトリ外にする。

観測時間がゼロならアプリの良い姿勢率と観測中の良い姿勢率は `null` であり、0%とは区別する。同一測定の手動再試行では最初に保存された送信区分・受信日時を維持する。エクスポートは逐次ページ取得であり、更新中のデータベースの固定スナップショットではない。

## 削除・保持・復旧

最大24か月は最初の受信を基準とし、APIとエクスポートは期限切れを即座に除外する。15分ごとの処理で期限切れデータを削除する。R2削除ジョブは遅れて到着するアップロードを清掃するため24時間残る。削除済みIDをreceiptに残して古い端末からの自動復活を防ぐ。

D1 Time Travelなどのバックアップは最大30日までとし、別の長期バックアップを作らない。R2 `deletions/` の最小限の削除台帳はD1の復元で戻さない。復旧時は `PIIIN_RESTORE_LOCK=true` でデプロイして送信・エクスポートを止める。D1復元後、運営者トークンで `POST /api/operator/reconcile` を呼び、返された `nextCursor` がある間は `?cursor=...` で繰り返す。台帳に基づく分析データ・プロフィール・セッションの削除を適用し、アカウント削除も反映したことを確認してからロックを解除する。復旧直後に無条件でCronやアップロードを再開しない。

公式資料: [Cloudflare設定](https://developers.cloudflare.com/cf/projects/cloudflare-config/)、[Workers Vite v2](https://developers.cloudflare.com/workers/vite-plugin/v2-beta/)、[Better Auth Drizzle](https://better-auth.com/docs/adapters/drizzle)、[Google People API](https://developers.google.com/people/api/rest/v1/people/get)、[Tauri App Store](https://v2.tauri.app/distribute/app-store/)、[Microsoft提出API](https://learn.microsoft.com/en-us/windows/uwp/monetize/manage-app-submissions)。

## 2026-11-08 の検証記録

- 共通フロントエンド、Cloudflare Web/Worker、Mac Storeフロントエンドのビルドを実行。Storeの姿勢推定用7資産（40,476,641 bytes）の同梱検査も成功。
- ブラウザー保存・送信待ち7テスト、実MiniflareのD1/R2サーバー9テストが成功。A/B隔離、オフライン、認証切れ、応答消失、ゲスト選択中の中断、同一測定の再送、部分アップロード、詳細エクスポート、24か月期限の清掃、削除台帳による復元拒否を検査。
- 測定・追跡・タイムラプス配置・ウィジェット53、更新4、オーバーレイ1、MacダウンロードAPI2テストが成功。
- Rustの通常/Store `cargo check --locked`、Rustライブラリ7テスト、XcodeのSwift 5テストが成功。Command Line ToolsではSwiftUIマクロが見つからなかったため、Swiftは `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcrun swift test --package-path src-tauri/native-pet` で実行した。
- Chromiumで1512×982・1024×640・390×844の設定を確認。アカウント領域はタイムラプスの案内より後、完了ボタンの直前。SSOボタンは高さ48px、幅360px（390px画面では272px）、フォーカス輪郭3px。文書幅は各画面幅と一致し、長い日本語/韓国語の名前・空の記録一覧・削除確認・Escapeで閉じる操作を確認した。認証応答はモックであり、Google/Appleとの実通信ではない。
- `actionlint 1.7.12` で変更した4ワークフローを検査し、Nodeスクリプト/Fastlaneの構文と `git diff --check` を検査。依存性の修正版を固定し、`bun audit --json` の検出は0件。Bunモジュールモックを使うテストは別プロセスで実行した。

残る検証: Cloudflareアカウント接続、実D1/R2作成と使用量通知、Google/Apple OAuthと追加権限審査、署名付きMac/StoreでのOS安全保管・実機UI、Windows実機、ストア提出/承認後公開、実ドメイン切替/切り戻し。既存カメラ・LAN・タイムラプスの実機全行程は今回再実行していない。Viteの大きなチャンク警告と既存の未使用ペアリングRust警告は残る。Cloudflare cf/Vite v2ベータは版を固定している。

追加のブラウザー操作検証では、初回ログインの記録引き継ぎダイアログが設定ダイアログに隠れる問題を再現し、アカウント選択中は設定ダイアログを開かないよう修正した。修正後はゲスト引き継ぎ→個別の参加同意→通信失敗時の収集停止→通信失敗時の明示ログアウト→Bアカウントで別領域を開く→測定ロック中の切替拒否まで成功し、ログインだけでアップロードが発生しないことを確認した。OAuth/収集APIはブラウザーでモックしている。

## 2026-11-08 ログイン後の参加確認

ログイン直後に既存の同意をサーバーから読み込み、有効な同意がなければ「同意して続ける / ログアウト」を表示する。同意は明示操作で保存し、成功後はホームへ戻る。有効な同意は再ログイン・別端末でも引き継ぎ、同じ内容を毎回確認しない。撤回・削除後や同意版の変更時は再確認する。通常のログアウトは同意を撤回しない。オフライン・認証切れは元の記録の所属を維持する。

ゲスト記録の一括移管ダイアログを廃止し、ログイン時に専用の保存領域を自動選択する。既存ゲストの記録は変更せず、過去記録は設定の「ローカル記録を選んで送信」で明示選択した場合だけ所属を移す。設定のアカウント操作はログアウト・選択送信・再試行の3つとする。

同意撤回・分析削除・アカウント削除はプロフィールの「プライバシー・データ管理」に残す。未同意のログイン直後にも参加確認からアクセスでき、削除のために分析への同意を要求しない。Apple 5.1.1(ii)/(v) の撤回・アカウント削除要件に対応するための経路であり、審査通過を保証するものではない。

今回の検証: アカウント/送信待ち14テスト、測定27テスト、Web/Worker・desktopビルド、Rust検査、macOSデバッグappの生成に成功。Chromiumの実際の表示領域1512×982・1024×640・390×844で横あふれなし、同意モーダルは水平中央（幅620px/620px/352px、誤差1px未満）、選択ボタンは高さ48px以上。小画面のスクロール・キーボード到達、Escapeで閉じないこと、同意前の削除経路、同意後のホーム、再ログイン時の省略、設定の3操作と空の記録一覧をモック認証で確認した。実アカウントの分析同意・測定送信は行っていない。macOS実アプリでは起動・設定・新しいプロフィール項目の表示を確認。ネイティブ操作ツールのスクロールエラーにより下部の視覚確認は未完了。今回のWindows実画面とデスクトップOAuth往復も未検証。
