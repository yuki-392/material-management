# 研究室・ゼミ向け タスク・資料管理アプリ

研究室やゼミのメンバーが、Lab単位でタスクと資料を共有するWebアプリです。

## 概要

タスク、担当者、締切、進捗、共有資料をLabごとにまとめて管理します。研究室やゼミでは、作業内容や資料が複数の場所に分かれると、担当や期限を追いにくくなります。このアプリではGoogleアカウントでログインしたメンバーが、同じLabの情報を共有できます。

## 背景

研究室・ゼミの共同作業では、タスク、担当、締切、資料を一か所で確認できると、メンバー間で状況を共有しやすくなります。タスク管理と資料共有をLab単位にまとめ、メンバーの所属に沿ったアクセス制御も学べる題材として制作しました。

## 使用技術

| 分類 | 技術 |
| --- | --- |
| Runtime | Node.js 24（`.nvmrc`） |
| Web | Next.js 16.3.6、React 19、TypeScript 5 |
| UI | Tailwind CSS 4 |
| 認証 | Auth.js（`next-auth` v5 beta）、Google OAuth、Prisma Adapter |
| DB | Prisma ORM 7、PostgreSQL 18（ローカル）、Neon（本番） |
| ファイルストレージ | AWS SDK for JavaScript v3（S3 Client）、SeaweedFS 4.48（ローカル）、S3互換オブジェクトストレージ（本番） |
| 開発環境 | Docker Compose、npm |

## 工夫

アプリの要件と設計に、次の境界を設けています。

- **認証と認可を分ける** — Googleログインは本人確認に使い、LabのデータはそのLabのメンバーだけが扱えます。メンバー管理はOwnerに限定します。
- **所属とデータの整合性を保つ** — `LabMember.userId` の一意制約で1人1Labを表し、LabとOwnerの所属行は同じトランザクションで作成します。メンバー削除時は担当Taskの解除と所属削除を一緒に行います。
- **DBとファイルストレージを分ける** — PostgreSQLにはMaterialのメタデータを保存し、ファイル本体はprivateなS3互換ストレージに保存します。ストレージキーはサーバーで生成します。
- **更新内容をサーバーで検証する** — Server Actionで入力を検証し、対象Labの所属やOwner権限をサーバー側で確認します。

## 苦労（実装上の課題）

PostgreSQLとS3互換ストレージは別々のサービスなので、両方をまとめて1つのトランザクションにできません。アップロードでは、ファイル保存後にDB登録が失敗するとファイルだけが残る可能性があります。このアプリではDB登録に失敗した際にファイル削除を試みます。削除時にストレージ操作が失敗した場合はDB行を残し、再試行できるようにしています。

これはアプリの技術上の課題と対応です。個人の実装経験として説明する場合は、自分が決めた要件とCodexが生成した実装を分けて話します。

## 改善案

- ブラウザーE2Eテストを自動化し、Googleログイン後のプロフィール設定からTask・Material操作まで継続確認する。
- マジックバイト検査やウイルススキャンを追加し、アップロードファイルの内容を確認する。
- Task・Materialの検索や絞り込みを追加する。

## AIを使った開発と自分の担当

私はアプリの目的と要件を考え、Codexに実装を指示しました。コードの実装は大部分でCodexを活用しています。機能や設計の説明では、アプリに実装されている内容と、自分が実際に担当した作業を区別しています。

## 主な機能

- **ログインとプロフィール** — Google OAuthでログインし、教員・学生の区分を設定します。学生は学生番号が必要です。ログアウトもできます。
- **Labとメンバー** — Lab未所属のユーザーがLabを作成します。作成者はOwner兼Memberになります。Ownerは、アプリに登録済みのユーザーをメールアドレスで追加・削除できます。
- **Task管理** — Lab内のメンバーがTaskを作成・編集・削除できます。タイトル、説明、`TODO`・`IN_PROGRESS`・`DONE`のstatus、担当者、締切を設定します。
- **Material管理** — PDF、DOCX、PPTX、XLSX、JPEG、PNGをアップロードし、Lab内の資料一覧から管理できます。PDFと画像はブラウザーで開き、Officeファイルはダウンロードします。アップロード上限は1ファイル20MiBです。

## 画面イメージ

### Login

![Googleログイン画面](docs/screenshots/login.png)

### Lab

![Lab詳細とTask・資料・メンバーへの導線](docs/screenshots/lab.png)

### Member

![Labメンバー一覧と追加フォーム](docs/screenshots/member.png)

### Task

![Task作成フォーム](docs/screenshots/task1.png)

![登録済みTaskと締切表示](docs/screenshots/task2.png)

### Material

![Materialアップロードフォーム](docs/screenshots/materials1.png)

![登録済みMaterial一覧](docs/screenshots/materials2.png)

## アーキテクチャ

```text
Browser
  ↓
Vercel / Next.js App Router
  ├─ Auth.js ── Google OAuth
  ├─ Server Components / Server Actions
  │      └─ Prisma ── PostgreSQL（ローカル: Docker Compose / 本番: Neon）
  └─ Material Route Handler
         └─ AWS SDK for JavaScript (S3)
                ├─ ローカル: SeaweedFS
                └─ 本番: privateなS3互換オブジェクトストレージ
```

画面の読み取りは主にServer Components、更新はServer Actionsで行います。Materialのファイル取得は認可を確認するRoute Handlerを通します。

## 本番環境

- **公開URL** — [https://material-management-orpin.vercel.app/](https://material-management-orpin.vercel.app/)
- **Webアプリ** — VercelでNext.jsアプリを実行します。
- **データベース** — NeonのPostgreSQLを使い、Prisma Migrateでスキーマを管理します。
- **ファイル** — ファイル本体はprivateなS3互換オブジェクトストレージに保存します。アプリはサーバー側のAWS SDKから接続し、PostgreSQLにはMaterialのメタデータとストレージキーを保存します。接続先・認証情報は`S3_ENDPOINT`、`S3_ACCESS_KEY_ID`、`S3_SECRET_ACCESS_KEY`、`S3_BUCKET`、`S3_REGION`で設定します。
- **環境変数** — 本番用のDB・OAuth・ストレージ設定はVercelの環境変数として管理します。値をリポジトリに保存しません。

ローカル開発ではDocker ComposeのPostgreSQLとSeaweedFSを使います。本番ストレージも同じS3互換APIで接続し、SeaweedFSはローカル開発用です。

## DB設計

```mermaid
erDiagram
    User ||--o{ Lab : owns
    User ||--o| LabMember : membership
    Lab ||--o{ LabMember : includes
    Lab ||--o{ Task : contains
    User o|--o{ Task : assigned_to
    Lab ||--o{ Material : contains
    User o|--o{ Material : uploaded_by
```

- `LabMember`は所属日時を持つ明示的な関係モデルです。`userId`の一意制約により、1 Userが所属できるLabは最大1つです。
- Lab作成時は、LabとOwnerの`LabMember`を同じトランザクションで作成します。アプリ上のOwnerはLabのMemberでもあります。
- TaskとMaterialはそれぞれ必ず1つのLabに属します。担当者とMaterial登録者は任意です。
- Auth.js Adapter用の`Account`と`Session`もDBに保存します。図では主要な業務モデルを優先しています。

詳細は[`docs/database.md`](docs/database.md)を参照してください。

## 認証と認可

Google OAuthはユーザーの認証に使い、Labへのアクセス権はLab所属とOwner情報から別に判定します。Auth.jsのDB Sessionを利用し、プロフィール完了前はLab機能へ進めません。

Labの読み取り・更新、Server Action、Material Route Handlerでは、サーバー側で対象Labへの所属を確認します。メンバーの追加・削除はOwnerに限定し、Taskの担当者も同じLabのメンバーに限ります。ボタンの表示制御だけを認可として扱いません。非所属Labは存在の有無を区別しない404相当の応答にします。

## Materialの検証範囲

アップロードでは20MiB上限と、拡張子・ブラウザー提供MIME typeの組み合わせを確認します。ファイル内容のマジックバイト検査やウイルススキャンは行っていません。この形式確認だけでファイルの安全性を完全に保証するものではありません。

## セットアップ

### 必要なもの

- Node.js 24とnpm
- Docker Compose
- Google CloudのOAuth Webクライアント

GitHubのClone URLでリポジトリをcloneし、プロジェクトディレクトリで次を実行します。

```bash
nvm install
nvm use
npm ci
cp .env.example .env
```

`.env`にPostgreSQL、SeaweedFS、Auth.js、Google OAuthの設定を行います。環境変数名と用途は後述の表を参照してください。`.env.example`の認証・接続値はローカル開発用であり、本番用として使わないでください。`AUTH_SECRET`はローカルで生成し、`.env`の外へ出したりコミットしたりしないでください（例: `openssl rand -base64 32`）。

Google Cloud ConsoleでOAuth Client IDの種類にWeb applicationを選び、次のoriginとredirect URIを登録します。

```text
Authorized JavaScript origin: http://localhost:3000
Authorized redirect URI:      http://localhost:3000/api/auth/callback/google
```

開発時は`http://localhost:3000`を使用してください。`127.0.0.1`ではcallback URIが一致せず、`redirect_uri_mismatch`になります。

PostgreSQLとSeaweedFSを起動し、Prisma Clientを生成してmigrationを適用します。

```bash
docker compose up -d
npm run db:generate
npx prisma migrate deploy
npm run dev
```

ブラウザーで<http://localhost:3000>を開きます。停止時は開発サーバーのターミナルで`Ctrl+C`を押し、必要に応じて次でDockerサービスを停止します。

```bash
docker compose down
```

`docker compose down -v`はDBとSeaweedFSのデータボリュームも削除するため、通常の停止には使わないでください。

## 環境変数

値はREADMEに記載せず、用途だけを示します。設定例は[`.env.example`](.env.example)を参照してください。

| 変数 | 用途 |
| --- | --- |
| `POSTGRES_DB` | ローカルPostgreSQLのDB名 |
| `POSTGRES_USER` | ローカルPostgreSQL接続ユーザー |
| `POSTGRES_PASSWORD` | ローカルPostgreSQL接続パスワード |
| `POSTGRES_PORT` | ローカルPostgreSQLのホスト側ポート |
| `DATABASE_URL` | PrismaのPostgreSQL接続URL（ローカルまたは本番Neon） |
| `S3_ENDPOINT` | S3互換ストレージのendpoint（ローカルはSeaweedFS） |
| `S3_ACCESS_KEY_ID` | S3互換ストレージ接続用Access Key ID |
| `S3_SECRET_ACCESS_KEY` | S3互換ストレージ接続用Secret Access Key |
| `S3_BUCKET` | Materialファイル保存先bucket |
| `S3_REGION` | S3互換ストレージのregion設定 |
| `AUTH_SECRET` | Auth.jsのセッション署名・暗号化用secret |
| `AUTH_GOOGLE_ID` | Google OAuth Client ID |
| `AUTH_GOOGLE_SECRET` | Google OAuth Client Secret |

## テスト・動作確認

自動検証ではNode.js標準の`node:test`によるテスト、ESLint、TypeScript確認、Next.js buildを使います。実ブラウザーのE2Eは手動確認であり、自動ブラウザーE2Eテストは導入していません。

| 確認方法 | コマンド・範囲 | 結果 |
| --- | --- | --- |
| Lint | `npm run lint` | PASS |
| TypeScript | `npx tsc --noEmit` | PASS |
| Unit / logic tests | `node --test` | PASS（82件） |
| Production build | `npx next build --webpack` | PASS |
| Patch whitespace | `git diff --check` | PASS |
| 手動ブラウザーE2E（主要導線） | Google OAuth、Profile、Lab、Member、Task、Material、Logout | PASS |
| 認可境界（ユーザー手動確認） | 別Lab URL、Task / Material ID指定、Owner限定操作、Server Action相当の送信値改変 | PASS |

主要導線は実ブラウザーで確認しました。認可境界は、前回BLOCKEDだった項目をユーザーが手動で確認しPASSと報告した結果です。自動ブラウザーE2Eテストは導入していません。

本番環境では2026-09-29に公開URLへアクセスし、HTTPSで表示されること、未ログイン時に`/login`へ遷移すること、ログイン画面とGoogleログインボタンが表示されることを確認しました。

## 関連ドキュメント

- [MVP要件](docs/requirements.md)
- [DB設計](docs/database.md)
