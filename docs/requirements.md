# MVP要件

更新日: 2026-09-29
状態: MVP実装中

## 目的

研究室・ゼミのメンバーが、Lab内のタスクと担当者・締切・進捗を共有できるWebアプリを作る。実装を通じてNext.js、TypeScript、PostgreSQL、Prismaを学び、設計理由を説明できるポートフォリオにする。

## MVPに含めるもの

### 利用者とログイン

- 登録とログインはGoogle OAuthを使う。同じログイン導線で、初回ログイン時にアプリのUserとOAuth Accountを作成する。
- メールアドレスとパスワードによるアプリ独自認証は作らない。
- `UserType` で教員（`TEACHER`）または学生（`STUDENT`）をプロフィール分類として記録する。この分類でLabやTaskの権限は変えない。
- 初回OAuthログイン時はプロフィール項目未設定のUserを作成できる。ログイン後にプロフィールを完了するまではLab機能を利用できない。
- 学生は学生番号を必須入力し、学生番号はアプリ内で一意にする。教員に学生番号は設定しない。プロフィール保存時にサーバー側で条件を検証する。
- Googleログインはユーザーの本人識別を行うだけで、Labへのアクセス権は付与しない。Labへの所属は別途 `LabMember` で管理する。
- 1 Userが所属できるLabは最大1つ。Labに所属していないUserは、Labを作成するか、Ownerから既存Labへ追加されることで所属できる。
- MVPではGoogleアカウントを持つユーザーがログインできる。LabデータはそのLabの所属メンバーだけが利用できる。

### Labとメンバー

- Lab未所属のログイン済みUserだけがLabを作成できる。作成者がそのLabの唯一のOwnerとなり、同時にメンバーになる。LabとOwnerの所属行は同じDBトランザクションで作成する。
- すでにLabに所属しているUserは別Labを作成できず、別Labにも所属できない。Labから所属を削除されたUserは未所属となり、その後は新しいLabを作成するか別Labに追加されることができる。
- Ownerは、すでにGoogleログインを済ませ、かつどのLabにも所属していないユーザーをメールアドレスで追加・削除できる。招待メール、参加コード、自由参加は作らない。
- Owner以外のメンバーはメンバー一覧を閲覧できるが、追加・削除はできない。
- Owner自身の削除とOwner移譲はMVP対象外。Ownerが不在になる操作を許可しない。
- 未所属ユーザーはLab情報とタスクの読み取り・作成・更新・削除ができない。非所属Labへのアクセスは、存在の有無を区別できない応答（404相当）とする。

### タスク

- タスクは必ず1つのLabに属し、必須タイトル、任意説明、任意担当者、任意締切日時、ステータスを持つ。
- ステータスは `TODO`、`IN_PROGRESS`、`DONE`。初期値は `TODO`。メンバーはその3値の間で更新でき、決まった遷移順は設けない。
- 担当者は同じLabに所属するユーザーのみ設定できる。担当なしも許可する。
- 締切は日付だけでなく時刻を含む日時として保存する。MVPの入力・表示タイムゾーンは `Asia/Tokyo` とする。
- Labメンバー全員が、同じLab内のすべてのタスクを閲覧・作成・編集・完全削除できる。作成者や担当者だけに編集権限を絞らない。
- メンバーをLabから削除すると、そのユーザーが担当するタスクは残し、担当者だけを解除する。所属削除と担当解除は同一トランザクションで行う。

### 資料

- Labメンバー全員が、そのLab専用の資料をアップロード・一覧・表示・ダウンロード・削除できる。Owner限定にはしない。
- ファイル本体はPostgreSQLに保存せず、ローカル開発ではSeaweedFSのprivateなS3互換ストレージに保存する。PostgreSQLにはタイトル、説明、元ファイル名、storage key、形式、サイズ、登録者、日時を保存する。
- 1ファイルは20MiB以下とし、PDF、DOCX、PPTX、XLSX、JPEG、PNGだけを受け付ける。サーバーで拡張子とMIME typeを照合する。これはファイル内容の安全性を完全に証明する検査ではない。
- Server Actionの既定本文上限はファイル上限より小さいため、Next.jsの `serverActions.bodySizeLimit` を21MiBにする。これは20MiBのファイルとmultipart本文の小さなオーバーヘッドを受けるための設定。
- PDFとJPEG/PNGはLabメンバー認可済みRoute Handlerからinline配信し、Office形式は添付ダウンロードにする。S3 endpointをブラウザーへ公開しない。
- ストレージキーはサーバーで生成する。削除時はストレージ削除後にDBメタデータを削除し、ストレージ削除に失敗した場合はDB行を残す。DB登録失敗時はアップロード済みオブジェクトの補償削除を試す。
- Lab削除と本番用ストレージ構成、ウイルススキャン、ファイル検索、Officeプレビュー、版管理はMVPに含めない。

## 認証・認可の境界

| 操作 | 必要な条件 |
| --- | --- |
| プロフィール完了 | ログイン済み。学生なら学生番号が必須 |
| Lab作成 | ログイン済み、プロフィール完了、かつLab未所属 |
| Lab・Taskの閲覧 | プロフィール完了、対象Labの `LabMember` |
| Taskの作成・更新・削除 | プロフィール完了、対象Labの `LabMember` |
| Taskの担当者設定 | 対象Labの `LabMember`。担当者も同じLabの `LabMember` |
| メンバー追加・削除 | 対象LabのOwner |
| Materialの一覧・アップロード・取得・削除 | 対象Labの `LabMember` |

すべての条件はサーバー側の読み取り・更新処理で確認する。UIでの表示制御は操作しやすさのための補助であり、認可の代わりにはならない。Server ActionsとRoute Handlersも公開リクエストの入口として扱い、それぞれで認証・認可を確認する。

## MVP対象外

- コメント、通知、検索
- 招待メール、招待コード、自由参加
- Google以外のOAuthプロバイダー、アプリ独自パスワード認証
- 教員・学生による権限差、複数の操作ロール、Owner移譲
- Lab削除、アカウント削除、削除済みタスクの復元・監査履歴
- 本番デプロイとOAuthクライアントの発行・運用手順

## 初期ディレクトリ案

```text
AGENTS.md
docs/
  requirements.md
  database.md
prisma/
  schema.prisma
  migrations/
src/
  app/
    (auth)/login/page.tsx
    (workspace)/labs/page.tsx
    (workspace)/labs/[labId]/page.tsx
    (workspace)/labs/[labId]/tasks/page.tsx
    (workspace)/labs/[labId]/materials/page.tsx
    api/auth/[...nextauth]/route.ts
    api/labs/[labId]/materials/[materialId]/file/route.ts
    layout.tsx
  components/
  lib/
    auth.ts
    db.ts
    authorization.ts
```

グループ名 `(auth)` と `(workspace)` はURLに含まれない。読み取りは主にServer Components、フォーム更新はServer Actions、Auth.jsのOAuthコールバックはRoute Handlerに置く案。MVPでは独立したREST APIやクライアント側データ取得ライブラリを増やさない。

## 技術選定と依存の考え方

- **Next.js App Router**：新規アプリでServer ComponentsとServer Actionsを学ぶ。Pages Routerも選択肢だが、今回はApp Routerで統一する。
- **Auth.js + Google Provider + Prisma Adapter**：Next.js内でOAuthセッションとUser/Accountを扱い、Lab等のアプリデータとPostgreSQLを共有する。代替のマネージド認証よりアプリ内の認証フローを学べる一方、OAuthクライアント設定とセッション設定が必要。
- **Prisma ORM 7 + PostgreSQL**：現行のPrisma公式Auth.js連携ガイドがORM 7を使い、ORM 8向けガイドは未提供と説明しているため、Adapter互換手順が整うまではORM 7を初期値とする。PostgreSQL接続のドライバーアダプター依存はORMガイドに沿って設定する。
- **パスワードハッシュライブラリなし**：Google OAuthのみなので、アプリがパスワードを受け取ったり保存したりしない。
- **Zodなし（初期段階）**：入力項目が少ない間は、FormDataをサーバー側の小さな検証関数で検証する。型の実行時検証が複数画面で重複し始めたらZodを再検討する。
- **状態管理、tRPC、メール、通知ライブラリなし**：対応するMVP機能がないため、必要性が出るまで追加しない。資料のローカル保存にはSeaweedFSを使い、アプリからのS3互換接続には `@aws-sdk/client-s3` を使う。Presigned URLや本番ストレージ用ライブラリは追加しない。

関連資料: [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication)、[Prisma Auth.js + Next.js](https://www.prisma.io/docs/guides/authentication/authjs/nextjs)。

## 今後のIssue案（実装順）

1. App Router、TypeScript、Tailwind、ESLintでNext.jsを初期化する。
2. Docker ComposeでローカルPostgreSQLと環境変数例を用意する。
3. Prisma ORM 7とPostgreSQLドライバーアダプターを設定する。
4. Auth.js AdapterとドメインモデルのPrismaスキーマを作り、初回マイグレーションを作成する。
5. Prisma Adapter、Google OAuth、DBセッションを設定する。
6. ログイン・ログアウト画面とログイン後の基本レイアウトを作る。
7. 初回ログイン後のプロフィール入力（教員／学生、学生なら学生番号）と、未完了時のLab機能制限を実装する。
8. セッション、プロフィール完了、Lab所属、Ownerを確認するサーバー側認可処理を作る。
9. Lab未所属Userだけが作成できるよう確認し、Lab作成とOwnerの初期所属行作成を同一トランザクションで実装する。
10. Owner限定のメンバー追加・削除を実装する。追加対象が未所属であることを確認し、削除時は担当解除と所属削除を同一トランザクションで行う。
11. Labとタスク一覧の読み取り・表示を実装する。
12. タスク作成・編集・状態変更・担当・締切設定を実装する。
13. 全メンバー向けタスク完全削除、サーバー側入力検証、エラー表示を実装する。
14. 認証・プロフィール・Lab境界・Owner権限・担当者制約・削除動作のテストを追加・実行する。
15. Labメンバー向け資料アップロード、一覧、認可付き取得、削除をSeaweedFSで実装する。

## 受け入れ確認シナリオ

- 未ログイン利用者は認証を求められ、LabやTaskのデータを受け取らない。
- プロフィール未完了Userはプロフィール入力以外のLab機能を使えない。学生は学生番号なしではプロフィールを完了できず、教員は学生番号を設定しない。
- 同じ非NULL学生番号を複数Userに登録できない。Auth.js初回ログイン時のプロフィール未設定Userは作成できる。
- ログイン済みでもLab非所属なら、URLや送信内容にLab IDを指定しても読み取り・作成・更新・削除が拒否される。
- Labメンバーはタスク操作ができるが、別Labのタスクにはアクセスできない。
- 非Ownerによるメンバー追加・削除は拒否される。
- Lab所属中のUserによるLab作成と別Labへの追加は拒否され、所属削除後は未所属として扱われる。
- 同じLabに所属していないユーザーを担当者に指定する入力は拒否される。
- メンバー削除後も担当タスクは残り、担当者だけが未設定になる。
- 同一の `(labId, userId)` を持つLabMemberをDBに二重登録できない。
- 同一Userを別LabのLabMemberに登録できない一方、別Userは同じLabに所属できる。
- タスク削除後、対象タスクは存在しない。Lab削除はUI対象外だが、DBの参照動作は `docs/database.md` に記載された通りである。
- Labメンバーは自Labの資料だけを扱え、別LabのMaterial IDを指定しても資料の有無を確認できない。ストレージ削除失敗時はMaterial行が残る。

## 設計理解の確認質問

1. Google OAuthでログインできても、LabMemberでなければタスクを見られないのはなぜですか？
2. `LabMember` の複合主キーと `userId` unique制約は、それぞれ何を防ぎますか？
3. LabMemberを残してUserの所属を最大1 Labに制限するのはなぜですか？
4. メンバー追加ボタンをUIで隠すだけでは、認可として不十分なのはなぜですか？
5. Lab削除の `Cascade` と担当者削除の `SetNull` は、それぞれどんなデータ結果になりますか？

## 仮定・保留事項

- 締切と説明は任意。締切時刻は `Asia/Tokyo` 入力として解釈し、タイムゾーン付き日時として保存する。
- GoogleログインできることとLabに所属することは別。メールアドレスで追加するには対象Userが先にログインを済ませている必要がある。
- Lab削除・アカウント削除・Owner移譲・デプロイ先・OAuthクライアント発行手順はMVP後に決める。
- OAuth設定値やDB接続情報は環境変数で渡し、実値をリポジトリにコミットしない。
