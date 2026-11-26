# 関連リポジトリ（統合後）

2026-11-08に合意した統合方針では `vyuma/posture-app` がウェブ・macOS・Windowsの基準となる。`Kyoung9/PiiiN` は既存Vercel配信の復旧先として移行期間中保持し、新機能を二重実装しない。`vyuma/vibe-app` は別のExpo同伴アプリとして維持する。

今回確認した基準: PiiiN main `0b1e90e`、PR #31 `af8e477`、保存用PR #32 `c997009`、posture-app main `c3c1dc1`、PR #34 `e8a1186`、vibe-app main `b99b79b`。これらは確認時点であり次回作業ではリモート状態を再確認する。

LANのディープリンク `vibeapp://pair?host=<host>&port=<port>&token=<token>`、`/health`・`/pair`・`/disconnect`・`/ws` とイベント/ACK契約は今回変更しない。キャラクターID・資産の内容変更ではvibe-app側も確認する。分析用APIはLANペアリングや動画・コレクション復元APIとは別である。

移行手順と未設定の外部設定は [運用文書](cloudflare-analytics.md) を参照。
