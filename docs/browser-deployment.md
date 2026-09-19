# PostureとVibeをVercelに公開する

PCではPosture、iPhoneではExpo / React Native Web版のVibeを開きます。Posture側のVercel FunctionがHTTPSとWebSocketを受け持ち、Redisで端末間・Function間の状態を共有します。カメラ映像・姿勢推定はPC内で処理し、中継APIには測定中かどうかと姿勢の良否を送ります。

```mermaid
flowchart LR
  PC[PCブラウザ / Posture] -->|HTTPS| API[Vercel / api/relay.ts]
  API <--> Redis[(Redis)]
  API <-->|WSS| Phone[iPhoneブラウザ / Vibe]
```

## 必要なもの

- PostureとVibe用のVercelプロジェクトを1つずつ。
- Redis 6以上。Vercel MarketplaceのUpstash Redisなど、TLS接続の`rediss://` URLを利用できます。
- Posture側のFluid computeを有効にします。`vercel.json`で`fluid: true`を指定済みです。

VercelのWebSocket対応はPublic Betaとして提供されています。接続はFunctionの最大実行時間に制限されるため、この実装は4分ごとに再接続し、Redisから最新状態を読み直します。

## 1. Vibeを公開する

Vercelで`vibe-app`リポジトリをインポートします。共通のモノレポを使う場合だけ、Root Directoryを`vibe-app`に設定してください。

同梱の`vercel.json`が次の設定を適用します。

| 項目 | 設定 |
| --- | --- |
| Framework | Other |
| Install Command | `npm ci` |
| Build Command | `npm run build:web` |
| Output Directory | `dist` |
| URL | `.html`なしの静的ルート |

Expoの`web.output`は`static`です。`/pairing-test`には対応するHTMLが生成されるので、すべてのURLを`/`へ転送するSPA用rewriteは不要です。

デプロイ後の安定した公開URLを控えます。例: `https://your-vibe.vercel.app`。VibeにはRedisの認証情報を設定しません。

## 2. PostureとRedisを設定する

Vercelで`posture-app`をインポートします。共通のモノレポならRoot Directoryを`posture-app`にします。FrameworkはViteで、ビルドとAPIのルーティングは同梱の`vercel.json`に定義済みです。

Posture側のEnvironment Variablesに以下を設定します。

| 変数 | 設定する値 | 例 |
| --- | --- | --- |
| `REDIS_URL` | Redisの直接接続用URL。パスワードを含むサーバー専用の秘密情報 | `rediss://default:PASSWORD@HOST:6379` |
| `POSTURE_PUBLIC_URL` | PCで開くPostureの公開origin | `https://your-posture.vercel.app` |
| `VIBE_PUBLIC_URL` | スマートフォンで開くVibeの公開origin | `https://your-vibe.vercel.app` |

URLにはパス・クエリ・フラグメントを付けず、実際にブラウザで開くドメインと一致させてください。Postureの環境変数を設定してから再デプロイします。

UpstashのREST用URL・REST用トークンではなく、Redis互換接続の`rediss://...`を使用します。秘密情報に`VITE_`や`EXPO_PUBLIC_`を付けないでください。[.env.example](../.env.example)は値の見本で、Vercelの設定の代わりにはなりません。

Postureのビルドは`bun run typecheck:server && bun run build`です。`/api/pairing/:action`を`api/relay.ts`へrewriteし、HTMLとAPIを同じoriginで提供します。

Productionの安定したURLで接続してください。Previewでも試す場合は、Preview専用のURL設定とRedisを用意します。PreviewのURLからProduction用のorigin設定を流用すると、接続元の検証で拒否されます。

## 3. PCとiPhoneを接続する

1. PCでPostureの公開URLを開き、カメラを許可します。
2. Postureの接続画面に表示されるQRをiPhoneのカメラで読み取ります。
3. SafariでVibeが開いたら「通知を有効にして接続」を押します。この操作で通知音を有効にします。
4. PCで姿勢登録と測定を開始します。測定状態・姿勢の良否がVibeへ届きます。

同じWi-Fiは不要です。iPhoneのSafariでは任意の振動を発生させるVibration APIが使えないため、音と画面で通知します。測定中はVibeを前面に表示してください。画面ロック中・バックグラウンドでの継続通知は対象外です。

## 接続の動作

- PCごとにランダムな部屋を作ります。部屋・QR・接続の有効期限は作成から6時間です。期限が切れたらPCに表示される新しいQRで接続します。
- PCの送信権限は`HttpOnly`・`SameSite=Strict`・本番では`Secure`なCookieで管理します。QRに入るスマートフォン用トークンでは、PCの姿勢状態を書き換えられません。
- Cookieは同一ブラウザ内で共有されるため、同じブラウザの複数タブでは同じ部屋を使います。測定用Postureは1タブで開いてください。
- PCは5秒ごとに測定・姿勢状態を同期します。PCからの通信が20秒以上途切れると測定中表示と姿勢警告を停止します。
- Vibeは25秒ごとに生存確認を送ります。PCの接続表示は、スマートフォンの最終通信から最大60秒で未接続になります。
- 公開接続ではVibe側でも通信を監視し、40秒間メッセージが届かなければ次の5秒周期の確認で通知を停止して再接続します。
- Function間の変更はRedis Pub/Subで通知します。再接続時は保存した最新状態を取得するため、再接続先のFunctionが変わっても復旧できます。
- QRは接続権限を含むため共有しないでください。両アプリに`Referrer-Policy: no-referrer`を設定しています。

## ローカルで確認する

### LAN接続を使う

Postureで`bun run dev`、Vibeで`npm run web -- --host lan`を起動し、PCとスマートフォンを同じWi-Fiへ接続します。ローカルのPostureは従来どおり、Viteプラグインが中継を起動します。Vibeのポートは既定で8081です。

Wi-Fiのアドレスが自動取得できない場合は`POSTURE_PAIRING_HOST`、Vibeが別ポートの場合は`POSTURE_VIBE_WEB_PORT`をPostureの起動時に環境変数として指定してください。

### 公開用Redis中継を使う

テスト用Redisを用意し、Postureの`.env.local`に次を設定します。

```dotenv
REDIS_URL=redis://127.0.0.1:6379
POSTURE_PUBLIC_URL=http://localhost:1420
VIBE_PUBLIC_URL=http://localhost:8081
POSTURE_CLOUD_RELAY_URL=http://127.0.0.1:1422
```

Postureで`bun run dev:relay`と`bun run dev`を別のターミナルで起動します。Vibeで`npm run web`を起動し、Postureの「このPCでWeb版Vibeを開く」から接続できます。`localhost`のため、この設定はPC内の確認用です。

## 検証コマンド

```bash
# posture-app
bun run typecheck:server
bun run test:pairing
bun run build

# vibe-app
bun run test:pairing
npx tsc --noEmit
npm run build:web
```

接続テストは127.0.0.1にテスト用HTTP/WebSocketサーバーを起動します。標準ではメモリの共有ストアを使い、公開APIの部屋分離、認証、CORS、別インスタンス間の通信、再接続、通信断時の警告停止、ローカル連携、ネイティブブリッジの互換性を検証します。

実Redisのアトミック更新とPub/Subも検証する場合は、専用のテスト用Redisを指定します。

```bash
TEST_REDIS_URL=redis://127.0.0.1:6379 bun run test:pairing
```

テストキーは専用のランダムな名前空間で作られ、6時間で失効します。ProductionのRedisは指定しないでください。

## 公開後の動作確認

- QRでVibeの`/pairing-test`を開ける。
- iPhoneの接続操作後、PC側の表示が接続済みになる。
- 姿勢登録・測定・一時停止がVibeへ反映される。
- 姿勢が悪いときだけ通知され、回復すると止まる。
- PCのタブを閉じると20秒以内を目安に通知が止まる。
- 5分以上測定してもFunctionの再接続後に状態が復元される。

## 参考

- [Vercel WebSockets](https://vercel.com/docs/functions/websockets)
- [VercelでFunction間の状態をRedisで共有する公式例](https://vercel.com/kb/guide/real-time-chat-websockets)
- [ExpoのVercel公開手順](https://docs.expo.dev/guides/publishing-websites/)
- [Vibration APIの対応状況](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate#browser_compatibility)
