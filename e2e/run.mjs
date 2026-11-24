import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { seedDatabase } from "./seed.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const appDirectory = await mkdtemp(join(tmpdir(), "material-e2e-"));
const container = `material-e2e-${randomUUID()}`;
const session = randomUUID();
const fullSession = randomUUID();
let activeChild;
let interrupted = false;

function interrupt() {
  interrupted = true;
  activeChild?.kill("SIGTERM");
}
process.on("SIGINT", interrupt);
process.on("SIGTERM", interrupt);

function run(command, args, { env = process.env, capture = false, cleanup = false } = {}) {
  if (interrupted && !cleanup) throw new Error("E2Eを中断しました。");
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    });
    activeChild = child;
    let output = "";
    child.stdout?.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      activeChild = undefined;
      if (code === 0) resolve(output.trim());
      else reject(new Error(`${command} ${args[0]} が失敗しました（${signal ?? code}）。`));
    });
  });
}

async function waitForPostgres() {
  // 初期化用サーバーはTCPを受け付けないため、同じコンテナ内からTCPで待機する。
  await run("docker", ["exec", container, "sh", "-c",
    "i=0; until pg_isready -q -h 127.0.0.1 -U e2e -d material_e2e; do i=$((i + 1)); [ $i -lt 45 ] || exit 1; sleep 1; done"]);
}

let containerCreated = false;

try {
  // 通常の開発サーバーのビルド出力と.envをテスト環境から分離する。
  for (const entry of ["src", "public", "package.json", "tsconfig.json", "next.config.ts", "postcss.config.mjs"]) {
    await cp(join(root, entry), join(appDirectory, entry), { recursive: true });
  }
  await symlink(join(root, "node_modules"), join(appDirectory, "node_modules"), "dir");

  const password = randomUUID();
  await run("docker", ["create", "--name", container,
    "--publish", "127.0.0.1::5432", "--env", "POSTGRES_DB=material_e2e",
    "--env", "POSTGRES_USER=e2e", "--env", `POSTGRES_PASSWORD=${password}`, "postgres:18-alpine"], { capture: true });
  containerCreated = true;
  await run("docker", ["start", container], { capture: true });
  const endpoint = await run("docker", ["port", container, "5432/tcp"], { capture: true });
  if (!/^127\.0\.0\.1:\d+$/.test(endpoint)) throw new Error("E2E用PostgreSQLのポートを特定できません。");
  const databaseUrl = `postgresql://e2e:${password}@${endpoint}/material_e2e`;
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    AUTH_URL: "http://127.0.0.1:3100",
    AUTH_SECRET: randomUUID(),
    AUTH_GOOGLE_ID: "e2e",
    AUTH_GOOGLE_SECRET: "e2e",
    E2E_APP_DIRECTORY: appDirectory,
    E2E_SESSION: session,
    E2E_FULL_SESSION: fullSession,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  await waitForPostgres();
  await run("npm", ["run", "db:migrate:deploy", "--", "--config", "prisma7.config.ts"], { env });
  await seedDatabase(databaseUrl, session, fullSession);
  await run(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], { env });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    if (containerCreated) await run("docker", ["rm", "--force", "--volumes", container], { capture: true, cleanup: true });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await rm(appDirectory, { recursive: true, force: true });
  }
}
