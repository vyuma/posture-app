# PiiiN

Web・macOS・Windowsで共通の姿勢測定、キャラクター、画面を管理する。iPhone用の同伴アプリは別リポジトリの [vibe-app](https://github.com/vyuma/vibe-app) で管理する。

ログインなしで利用できる。任意のアカウント・分析参加はプロフィール → 設定の末尾に配置し、ログインだけでは測定データを送信しない。

## 開発

Node 24.22.1、Bun 1.3.13 と Rust/Tauri の各OS用ツールを使う。

```sh
bun install --frozen-lockfile
bun run dev:web  # Cloudflare Worker + browser, localhost:5173
bun run tauri dev  # desktop
```

`bun run build:web` はCloudflareのprebuilt出力、`bun run build` はデスクトップのフロントエンド、`bun run build:store` はMac App Store向けのオフライン姿勢推定資産を含む出力を作成する。

- [移行・認証・分析・リリースの設定と検証](docs/cloudflare-analytics.md)
- [関連リポジトリと取り込み元](docs/related-repositories.md)
- [用語](CONTEXT.md)、[設計判断](docs/adr/)
- [既存デスクトップ署名・更新](docs/desktop-releases.md)

Cloudflare、OAuth、署名・ストアの資格情報はリポジトリに保存しない。本番ドメイン切替と実ログイン・署名付きアプリの検証は、コードのビルド検証とは別に行う。
