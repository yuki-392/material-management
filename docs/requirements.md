# MVP要件

更新日: 2026-09-27  
状態: 初期設計案

## 目的

研究室・ゼミのメンバーが、Lab内のタスクと担当者・締切・進捗を共有できるWebアプリを作る。実装を通じてNext.js、TypeScript、PostgreSQL、Prismaを学び、設計理由を説明できるポートフォリオにする。

## MVPに含めるもの

### 利用者とログイン

- 登録とログインはGoogle OAuthを使う。同じログイン導線で、初回ログイン時にアプリのUserとOAuth Accountを作成する。
- メールアドレスとパスワードによるアプリ独自認証は作らない。
- Googleログインはユーザーの本人識別を行うだけで、Labへのアクセス権は付与しない。Labへの所属は別途 `LabMember` で管理する。
- MVPではGoogleアカウントを持つユーザーがログインできる。LabデータはそのLabの所属メンバーだけが利用できる。

### Labとメンバー

- ログイン済みユーザーは複数のLabを作成できる。作成者がそのLabの唯一のOwnerとなり、同時にメンバーになる。
- Ownerは、すでにGoogleログインを済ませたユーザーをメールアドレスでLabに追加・削除できる。招待メール、参加コード、自由参加は作らない。
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

## 認証・認可の境界

| 操作 | 必要な条件 |
| --- | --- |
| Lab作成 | ログイン済み |
| Lab・Taskの閲覧 | 対象Labの `LabMember` |
| Taskの作成・更新・削除 | 対象Labの `LabMember` |
| Taskの担当者設定 | 対象Labの `LabMember`。担当者も同じLabの `LabMember` |
| メンバー追加・削除 | 対象LabのOwner |

すべての条件はサーバー側の読み取り・更新処理で確認する。UIでの表示制御は操作しやすさのための補助であり、認可の代わりにはならない。Server ActionsとRoute Handlersも公開リクエストの入口として扱い、それぞれで認証・認可を確認する。

## MVP対象外

- 資料アップロード・共有、コメント、通知、検索
- 招待メール、招待コード、自由参加
- Google以外のOAuthプロバイダー、アプリ独自パスワード認証
- 複数ロールによる細かいタスク権限、Owner移譲
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
    api/auth/[...nextauth]/route.ts
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
- **状態管理、tRPC、ファイル保存、メール、通知ライブラリなし**：対応するMVP機能がないため、必要性が出るまで追加しない。

関連資料: [Next.js Authentication](https://nextjs.org/docs/app/guides/authentication)、[Prisma Auth.js + Next.js](https://www.prisma.io/docs/guides/authentication/authjs/nextjs)。

## 今後のIssue案（実装順）

1. App Router、TypeScript、Tailwind、ESLintでNext.jsを初期化する。
2. Docker ComposeでローカルPostgreSQLと環境変数例を用意する。
3. Prisma ORM 7とPostgreSQLドライバーアダプターを設定する。
4. Auth.js AdapterとドメインモデルのPrismaスキーマを作り、初回マイグレーションを作成する。
5. Prisma Adapter、Google OAuth、DBセッションを設定する。
6. ログイン・ログアウト画面とログイン後の基本レイアウトを作る。
7. セッション、Lab所属、Ownerを確認するサーバー側認可処理を作る。
8. Lab作成とOwnerの初期所属行作成をトランザクションで実装する。
9. Owner限定のメンバー追加・削除を実装する。削除時は担当解除と所属削除を同一トランザクションで行う。
10. Labとタスク一覧の読み取り・表示を実装する。
11. タスク作成・編集・状態変更・担当・締切設定を実装する。
12. 全メンバー向けタスク完全削除、サーバー側入力検証、エラー表示を実装する。
13. 認証・Lab境界・Owner権限・担当者制約・削除動作のテストを追加・実行する。

## 受け入れ確認シナリオ

- 未ログイン利用者は認証を求められ、LabやTaskのデータを受け取らない。
- ログイン済みでもLab非所属なら、URLや送信内容にLab IDを指定しても読み取り・作成・更新・削除が拒否される。
- Labメンバーはタスク操作ができるが、別Labのタスクにはアクセスできない。
- 非Ownerによるメンバー追加・削除は拒否される。
- 同じLabに所属していないユーザーを担当者に指定する入力は拒否される。
- メンバー削除後も担当タスクは残り、担当者だけが未設定になる。
- 同一の `(labId, userId)` を持つLabMemberをDBに二重登録できない。
- タスク削除後、対象タスクは存在しない。Lab削除はUI対象外だが、DBの参照動作は `docs/database.md` に記載された通りである。

## 設計理解の確認質問

1. Google OAuthでログインできても、LabMemberでなければタスクを見られないのはなぜですか？
2. UserとLabの関係を多対多にする理由と、LabMemberが中間テーブルである理由は何ですか？
3. `[labId, userId]` の複合主キーは、どのデータ不整合を防ぎますか？
4. メンバー追加ボタンをUIで隠すだけでは、認可として不十分なのはなぜですか？
5. Lab削除の `Cascade` と担当者削除の `SetNull` は、それぞれどんなデータ結果になりますか？

## 仮定・保留事項

- 締切と説明は任意。締切時刻は `Asia/Tokyo` 入力として解釈し、タイムゾーン付き日時として保存する。
- GoogleログインできることとLabに所属することは別。メールアドレスで追加するには対象Userが先にログインを済ませている必要がある。
- Lab削除・アカウント削除・Owner移譲・デプロイ先・OAuthクライアント発行手順はMVP後に決める。
- OAuth設定値やDB接続情報は環境変数で渡し、実値をリポジトリにコミットしない。
