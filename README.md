# Posture

PCのカメラで姿勢を測定するTauri / Reactアプリです。ブラウザ版はVercelへ公開でき、QRからiPhoneのWeb版Vibeと連携できます。

公開URLとRedis接続先の設定は、[Vercelへのデプロイ手順](docs/browser-deployment.md)を参照してください。

ローカルで画面を開くには `bun install` → `bun run dev` を実行します。ネイティブ版は `bun run tauri dev` です。

接続テスト: `bun run test:pairing`、サーバーの型チェック: `bun run typecheck:server`。

## 開発環境

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
