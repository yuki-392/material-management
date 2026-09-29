# 研究室タスク・資料管理アプリ

研究室やゼミのLabで、メンバー、タスク、締切、進捗、共有資料を管理するWebアプリです。Next.js App Router、TypeScript、Auth.js、Prisma、PostgreSQLを使用しています。資料ファイル本体はローカル開発環境のSeaweedFS（S3互換API）へ保存します。

## 現在のMVP

- Google OAuthログインとプロフィール設定（教員・学生、学生番号）
- Lab作成とOwnerによるメンバー管理
- Lab内Taskの作成・編集・削除、担当者と締切の設定
- PDF、Office文書、JPEG、PNGのアップロードと資料管理
- Labメンバーに限定した資料の表示・ダウンロード

認証・認可やDB設計の判断は [`docs/requirements.md`](docs/requirements.md) と [`docs/database.md`](docs/database.md) を参照してください。

## 必要なもの

- Node.js 24（バージョンは [`.nvmrc`](.nvmrc) を参照）とnpm
- Docker Compose
- Google OAuth Webクライアント

## 初回セットアップ

1. Node.js 24を選び、依存パッケージをインストールします。

   ```bash
   nvm install
   nvm use
   npm ci
   ```

2. ローカル環境変数ファイルを作成します。

   ```bash
   cp .env.example .env
   ```

3. `.env`を編集します。PostgreSQLの`POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_PASSWORD`と`DATABASE_URL`は同じ接続先になるよう設定します。`S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_BUCKET`、`S3_REGION`はローカルSeaweedFSの接続情報を使います。

   `AUTH_SECRET`には十分な長さのランダムな値を設定します。例えば`openssl rand -base64 32`で生成できます。生成値は`.env`だけに保存し、共有・コミットしないでください。

   Google CloudのOAuth Webクライアントには、次の承認済みリダイレクトURIを登録します。

   ```text
   http://localhost:3000/api/auth/callback/google
   ```

   `.env`の`AUTH_GOOGLE_ID`と`AUTH_GOOGLE_SECRET`に対応する値を設定します。開発時は`http://localhost:3000`を使ってください。`127.0.0.1`ではGoogle OAuthのcallback URIが一致しません。

4. PostgreSQLとSeaweedFSを起動し、Prisma Clientを生成して既存migrationを適用します。

   ```bash
   docker compose up -d
   npm run db:generate
   npx prisma migrate deploy
   ```

5. Next.js開発サーバーを起動します。

   ```bash
   npm run dev
   ```

   ブラウザーで <http://localhost:3000> を開きます。Googleログイン後、初回はプロフィールを設定します。学生は学生番号が必要です。

## 確認コマンド

```bash
npm run lint
npx tsc --noEmit
node --test
npx next build --webpack
git diff --check
```

## 停止

開発サーバーは起動中のターミナルで`Ctrl+C`を押して停止します。Dockerサービスは次のコマンドで停止できます。

```bash
docker compose down
```

`docker compose down -v`はPostgreSQLとSeaweedFSのデータボリュームも削除するため、通常の停止には使わないでください。

## 安全なブラウザE2E確認

既存DBを使うE2E確認は避け、作業ごとに専用PostgreSQL DBを作成してください。次の例のDB名は未使用の一意な名前に置き換えます。

```bash
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" material_management_e2e_YYYYMMDD'
```

アプリとmigration用に、`.env`の`DATABASE_URL`の接続情報を保ったまま、URL内のDB名だけを一時DBへ差し替えます。接続URLを画面共有・ログ・リポジトリへ出さないでください。一時DBを指定した状態でmigrationを適用してから開発サーバーを起動します。

```bash
export DATABASE_URL='<.envと同じ接続先で、DB名だけ一時DBにしたURL>'
npx prisma migrate deploy
npm run dev
```

実ブラウザーでは`http://localhost:3000`を使います。テストファイルには識別しやすい名前を付け、アップロード前後のSeaweedFSオブジェクト数または一覧を記録してください。確認したテスト用資料はアプリから削除し、SeaweedFSのテスト用オブジェクトだけが消えたことを確認します。既存オブジェクトは削除しません。

確認終了後は開発サーバーを停止し、一時DBだけを削除します。

```bash
docker compose exec -T db sh -c 'dropdb -U "$POSTGRES_USER" material_management_e2e_YYYYMMDD'
```

一時DBのURLを含むシェル設定を使った場合は、終了時にその設定も解除します。既存DBとSeaweedFSの開始時データ件数が変わっていないことを確認してください。

## 主なファイル

- [`src/app/`](src/app/): App Routerの画面、Server Actions、資料ファイルRoute Handler
- [`src/lib/`](src/lib/): 認可、入力検証、ドメイン処理、ストレージ連携
- [`prisma/schema.prisma`](prisma/schema.prisma): Prismaデータモデル
- [`prisma/migrations/`](prisma/migrations/): DB migration
- [`compose.yml`](compose.yml): ローカルPostgreSQLとSeaweedFS
- [`.env.example`](.env.example): 環境変数名とローカル用の例
