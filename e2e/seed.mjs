import { Client } from "pg";

export async function seedDatabase(databaseUrl, session, fullSession) {
  const db = new Client({ connectionString: databaseUrl });
  await db.connect();
  try {
    // 実行ごとに作る空のDBへ、一覧表示に必要な資料のメタデータだけを登録する。
    await db.query(`
      INSERT INTO "User" (id, name, email, "userType") VALUES
        ('e2e-owner', 'テストOwner', 'owner@example.test', 'TEACHER'),
        ('e2e-uploader', '投稿者A', 'uploader@example.test', 'TEACHER'),
        ('e2e-full-owner', '容量上限LabのOwner', 'full@example.test', 'TEACHER');

      INSERT INTO "Lab" (id, name, "ownerId", "storageLimitBytes", "updatedAt") VALUES
        ('e2e-lab', 'テストLab', 'e2e-owner', 1000000000, now()),
        ('e2e-full-lab', '容量上限Lab', 'e2e-full-owner', 1000000000, now());

      INSERT INTO "LabMember" ("labId", "userId") VALUES
        ('e2e-lab', 'e2e-owner'),
        ('e2e-lab', 'e2e-uploader'),
        ('e2e-full-lab', 'e2e-full-owner');

      UPDATE "StorageQuotaControl" SET "labCount" = 2, "allocatedBytes" = 2000000000
        WHERE id = 'global';

      INSERT INTO "Task" (id, "labId", title, "createdAt", "updatedAt")
        SELECT 'e2e-task-' || n, 'e2e-lab', 'ゼミタスク ' || lpad(n::text, 2, '0'),
          now() + n * interval '1 second', now()
        FROM generate_series(1, 21) AS n;

      INSERT INTO "Task" (id, "labId", title, "updatedAt")
        VALUES ('e2e-other-task', 'e2e-lab', '対象外タスク', now());

      INSERT INTO "Material" (
        id, "labId", title, "originalFileName", "storageKey", "contentType",
        "sizeBytes", "uploaderId", "createdAt", "updatedAt"
      )
        SELECT 'e2e-material-' || n, 'e2e-lab', 'ゼミ資料 ' || lpad(n::text, 2, '0'),
          'seminar.pdf', 'e2e/seminar-' || n, 'application/pdf', 1024, 'e2e-uploader',
          now() + n * interval '1 second', now()
        FROM generate_series(1, 21) AS n;

      INSERT INTO "Material" (
        id, "labId", title, "originalFileName", "storageKey", "contentType",
        "sizeBytes", "uploaderId", "updatedAt"
      ) VALUES
        ('e2e-other-material', 'e2e-lab', 'ゼミ対象外資料', 'other.pdf', 'e2e/other',
          'application/pdf', 1024, 'e2e-owner', now()),
        ('e2e-full-material', 'e2e-full-lab', '保存済み資料', 'full.pdf', 'e2e/full',
          'application/pdf', 1000000000, 'e2e-full-owner', now());
    `);
    await db.query(`
      INSERT INTO "Session" (id, "sessionToken", "userId", expires) VALUES
        ('e2e-session', $1, 'e2e-owner', now() + interval '30 minutes'),
        ('e2e-full-session', $2, 'e2e-full-owner', now() + interval '30 minutes')
    `, [session, fullSession]);
  } finally {
    await db.end();
  }
}
