# 研究室タスク・資料管理アプリ

研究室やゼミのメンバーが、タスク・担当者・締切・進捗を共有するWebアプリです。Next.jsを学びながら開発し、設計理由を説明できるポートフォリオにすることを目指しています。

## 開発状況

現在はNext.jsの初期化まで完了しています。トップページは初期テンプレートのままで、タスク管理やログインなどの機能はこれから実装します。MVPの要件とDB設計案は [`docs/requirements.md`](docs/requirements.md) と [`docs/database.md`](docs/database.md) を参照してください。

## 開発環境の起動

Node.jsとnpmを用意したうえで、依存パッケージをインストールします。

```bash
npm install
npm run dev
```

ブラウザーで [http://localhost:3000](http://localhost:3000) を開くと、開発中のアプリを確認できます。ファイルを保存すると、開発サーバーが変更を反映します。

## まず見るファイル

- [`src/app/page.tsx`](src/app/page.tsx): トップページ
- [`src/app/layout.tsx`](src/app/layout.tsx): 全ページ共通のレイアウトとメタデータ
- [`src/app/globals.css`](src/app/globals.css): 全体に適用するCSSとTailwind CSSの読み込み
- [`package.json`](package.json): 使用するパッケージと開発コマンド

## コードの確認

ESLintを実行するには、次のコマンドを使います。

```bash
npm run lint
```

## Next.jsの学習資料

- [Next.js公式ドキュメント](https://nextjs.org/docs)
- [Learn Next.js](https://nextjs.org/learn)
