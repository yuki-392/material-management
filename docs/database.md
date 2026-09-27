# DB設計案

更新日: 2026-09-27  
状態: 初期設計案

## 設計方針

- PostgreSQLを使い、Prisma ORM 7でモデルとマイグレーションを管理する。
- 認証ユーザーとアプリの権限データを同じDBに置く。Google OAuthのUser/Account/SessionはAuth.js Prisma Adapterのモデルに合わせる。
- LabとUserの多対多関係は、参加日時を持つ明示的な中間テーブル `LabMember` で表す。
- 外部キーで存在する行を保証し、複合主キー・一意制約で重複を防ぐ。Lab所属やOwner確認は、すべてのサーバー側読み書きでも検証する。
- 不要な履歴テーブル、ロール階層、ソフト削除、資料メタデータはMVPに追加しない。

## ER図

```mermaid
erDiagram
    User ||--o{ Lab : owns
    User ||--o{ LabMember : joins
    Lab ||--o{ LabMember : includes
    Lab ||--o{ Task : contains
    User o|--o{ Task : assigned_to
    User ||--o{ Account : authenticates_with
    User ||--o{ Session : has
```

`VerificationToken` はAuth.js Adapter互換のモデルとして用意するが、Google OAuthのみのMVPではログイン導線から使わない。

## モデル案

### User とAuth.js Adapterモデル

`User` はAuth.js Adapterのユーザー情報を持ち、少なくとも `id`、`name?`、`email?`、`emailVerified?`、`image?` を含む。Adapter互換のためメール欄はnullableにできるが、Labメンバーをメールで追加する機能ではメールアドレスがあるUserだけを対象にする。メールアドレスには一意制約を置く。

Adapterモデルは公式のPrisma Adapterスキーマに合わせる。

- `Account`：OAuth ProviderとProvider側アカウントIDを保持する。`[provider, providerAccountId]` を一意にする。
- `Session`：一意な `sessionToken`、Userへの外部キー、有効期限を持つ。Adapter利用時のDBセッションを保存する。
- `VerificationToken`：Adapterスキーマとの互換性のために定義する。Google OAuthのMVPフローでは使用しない。

### Lab

- `id`、`name`、`ownerId`、`createdAt`、`updatedAt`
- `ownerId` はUserへの必須外部キーで、Ownerの削除は `Restrict` する。
- Userは複数のLabを所有できるため、`ownerId` に一意制約は置かない。
- Ownerは独立したロール表ではなく `Lab.ownerId` で表す。Lab作成時に同じUserを `LabMember` にも登録する。

### LabMember

- `labId`、`userId`、`joinedAt`
- `@@id([labId, userId])` を複合主キーとして、同一Userの同一Labへの二重所属を防ぐ。
- Userが複数Labに所属でき、Labに複数Userが所属できる。これはUserとLabの多対多関係であり、`LabMember` が関係そのものと参加日時を保存する。
- `userId` 単独のインデックスを置き、ユーザーから所属Labを探すクエリを支援する。
- MVPに複数ロールは設けない。Ownerは `Lab.ownerId` と一致するメンバー1人とし、作成・メンバー管理処理で整合性を保つ。

### Task

- `id`、`labId`、`title`、`description?`、`assigneeId?`、`dueAt?`、`status`、`createdAt`、`updatedAt`
- `labId` は必須。タスクは必ず1つのLabに属する。
- `title` は必須、`description`・担当者・締切日時は任意。
- `status` は `TODO`、`IN_PROGRESS`、`DONE` のEnumで、初期値は `TODO`。
- `dueAt` は `DateTime? @db.Timestamptz(3)`。入力時刻をISO形式の日時として受け、MVPでは `Asia/Tokyo` で入力・表示する。
- Labのタスク一覧をLab・状態・締切で絞り込めるよう、`[labId, status, dueAt]` の複合インデックスを置く。
- `assigneeId` はUserへの任意外部キー。担当者候補がそのLabの `LabMember` であることは、タスクの作成・更新処理で確認する。

## 関係・制約の整理

| 関係 | 多重度 | DB上の表現 |
| --- | --- | --- |
| User → 所有Lab | 1対多 | `Lab.ownerId` 外部キー |
| User ↔ Lab | 多対多 | `LabMember` 中間モデルと複合主キー |
| Lab → Task | 1対多 | `Task.labId` 外部キー |
| User → 担当Task | 1対多（Task側は任意） | `Task.assigneeId` nullable外部キー |
| User → OAuth Account / Session | 1対多 | Auth.js Adapterの外部キー |

主な一意制約は `User.email`、`LabMember[labId, userId]`、`Account[provider, providerAccountId]`、`Session.sessionToken`。Prismaの複合主キーは一意制約も兼ねるので、LabMemberに同じ値の別 `@@unique` を重ねない。

## 外部キーと削除時の挙動

| 参照元 → 参照先 | 削除時 | 理由・アプリ側の扱い |
| --- | --- | --- |
| `Lab.ownerId` → `User.id` | `Restrict` | Ownerが所有するLabを残したままOwner Userを削除させない。アカウント削除機能はMVP対象外。 |
| `LabMember.labId` → `Lab.id` | `Cascade` | LabをDBから削除する場合、そのLabの所属行も残さない。Lab削除UIはMVP対象外。 |
| `LabMember.userId` → `User.id` | `Cascade` | User削除時に所属行を残さない。ただしOwnerの削除は上記FKで拒否される。 |
| `Task.labId` → `Lab.id` | `Cascade` | Lab削除時に属するTaskを孤立させない。 |
| `Task.assigneeId` → `User.id` | `SetNull` | 担当Userを削除してもTaskは保持し、担当だけ解除する。 |
| Auth.js `Account.userId` / `Session.userId` → `User.id` | `Cascade` | User削除時にOAuth連携・セッションを残さない。 |

TaskからLabMemberへの外部キーは設けず、Taskの担当者はUserを参照する。したがってDB外部キーだけでは「担当者が当該Labのメンバーであること」までは表現しない。タスク作成・更新時に、サーバーが `LabMember(labId, assigneeId)` を照会して保証する。これは単純なMVPモデルを保ちつつ、認可ルールをすべての更新処理で明示する設計。

Labメンバーを外す操作は、次を1つのDBトランザクションで行う。

1. 対象Lab内でそのUserが担当しているTaskの `assigneeId` を `NULL` にする。
2. 対象の `LabMember` 行を削除する。

Owner本人またはOwnerの所属を削除する操作は拒否する。Owner移譲はMVPに含めない。Taskの完全削除は、対象Labのメンバーなら実行できる。

## 認証・認可との関係

- Auth.jsセッションから、現在のUser IDをサーバーで取得する。
- 認証済みかどうかだけでLabデータを返さない。読み取りクエリは対象Labの `LabMember` を条件に含める。
- Taskの作成・更新・削除ごとに対象Taskの `labId` と現在のUserの所属を確認する。クライアントから送られた `labId` やUser IDを信用しない。
- メンバー追加・削除処理では、対象Labの `ownerId` とセッションUser IDをサーバー側で比較する。
- UIのボタン制御はUX向けに行ってもよいが、認可の根拠にはしない。
- PostgreSQL外部キーは参照先が存在することを保証し、所属に基づく権限はサーバー側の認可処理が保証する。

## 実装時の依存メモ

Auth.js Prisma AdapterのモデルはAdapter公式スキーマと揃える。初期計画ではPrisma ORM 7のPostgreSQLドライバーアダプターを使い、ドキュメントどおりの `@prisma/adapter-pg` と `pg` の接続方式を確認する。ORMメジャーを上げる際はAuth.js Adapterとの互換性とマイグレーションを先に確認する。

参考資料:

- [Prisma: Auth.jsとNext.js](https://www.prisma.io/docs/guides/authentication/authjs/nextjs)
- [Prisma: 複合ID・複合一意制約](https://docs.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-composite-ids-and-constraints)
- [Prisma: Referential actions](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/relations/referential-actions)
- [PostgreSQL: Date/Time Types](https://www.postgresql.org/docs/current/datatype-datetime.html)
