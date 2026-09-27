# プロジェクト作業ガイド

このリポジトリは、研究室・ゼミ向けのタスク・資料管理Webアプリを作りながら、Next.jsを体系的に学び、就職活動で説明できる成果物にするためのプロジェクトです。完成速度だけでなく、設計理由を理解できる小さな変更を優先してください。

## 進め方

- 作業前に現在の構成を確認し、重要な変更では実装方針、変更予定ファイル、関係する技術概念、データやAPIへの影響を先に説明する。
- 一度に大量のコードを書かず、関係のないファイルを変更しない。
- 仕様が曖昧で設計に影響する場合は、既存コードやドキュメントを調べてから不明点を示す。影響が小さい既定値を置く場合は、その仮定を記録する。
- 新しいライブラリを提案・追加するときは、必要性、代替案、導入による負担を説明する。学習段階では理解しやすい実装を優先し、先回りした抽象化や依存を増やさない。
- 実装後は変更理由と結果をまとめ、認証・認可、型安全性、DB整合性、入力検証、エラー処理の観点からセルフレビューする。

## 想定する構成

- Next.js App Router、TypeScript、PostgreSQL、Prisma、Tailwind CSSを基本とする。
- MVPの認証はAuth.jsとGoogle OAuthを使う。ログインはGoogle経由で行い、アプリ独自のパスワード認証は実装しない。
- Auth.jsのPrisma Adapterとの互換性を確認したうえでORMのメジャーバージョンを選ぶ。初期計画では公式連携ガイドに合わせてPrisma ORM 7を使う。
- 単一のNext.jsアプリでは、読み取りにServer Components、更新にServer Actionsを使う。別のREST API層、状態管理ライブラリ、ファイル保存、通知などは必要性が出るまで追加しない。
- 当初の配置案は `src/app/`、`src/lib/`、`src/components/`、`prisma/schema.prisma`、`docs/`。

## 認証・認可

- 認証は「誰がログインしているか」、認可は「そのユーザーが対象のLabで何をできるか」として分けて扱う。
- UIでボタンやリンクを隠すだけでは不十分。Server Componentのデータ読み取り、すべてのServer Action、Route Handlerで、サーバー側のセッションと対象Labの所属を確認する。認証・認可をミドルウェアやレイアウトの確認だけに任せない。
- LabやTaskを読む・更新するクエリはLab IDで範囲を絞り、現在のユーザーがそのLabの `LabMember` であることを確認する。認証済みでも所属していないLabの存在やタスク内容を返さない。
- Labの作成者を `Lab.ownerId` とし、Ownerだけがメンバーを追加・削除できる。Lab作成時にはOwnerの `LabMember` も同じDBトランザクションで作る。Owner自身を外したり、Ownerが不在になる状態を許さない。
- タスクの担当者は、更新前に対象Taskと同じLabのメンバーであることをサーバー側で確認する。メンバーを外すときは、該当タスクの担当者を解除してから所属行を削除する処理を1トランザクションで行う。
- Server Actionに届く `FormData` 等は、HTMLのrequired属性に依存せずサーバー側で型と値を検証する。

## DB・機密情報

- LabとUserの多対多関係は、参加日時を持つ明示的な `LabMember` 中間モデルで表す。`[labId, userId]` の複合主キーで重複所属を防ぐ。
- 外部キーと削除時の参照動作は意図を明示する。Prismaスキーマ変更はPrisma Migrateで管理し、手動SQLによる本番スキーマ変更を前提にしない。
- DB制約で保証できることと、Lab所属などアプリケーション側で検証する認可ルールを区別して説明する。
- OAuthシークレット、DB接続情報などの秘密情報をソースやログに含めず、環境変数で扱う。公開環境変数には秘密を置かない。

## このプロジェクトの判断済み事項

詳細な要件は [`docs/requirements.md`](docs/requirements.md)、DB案は [`docs/database.md`](docs/database.md) を参照する。決定を変更する場合は、理由と影響する資料・モデル・認可ルールを明示する。

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
