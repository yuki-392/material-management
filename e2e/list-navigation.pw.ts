import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, full = false) {
  const token = full ? process.env.E2E_FULL_SESSION : process.env.E2E_SESSION;
  if (!token) throw new Error("npm run test:e2e でテスト環境を起動してください。");
  await page.context().addCookies([{
    name: "authjs.session-token",
    value: token,
    url: "http://127.0.0.1:3100/",
    httpOnly: true,
    sameSite: "Lax",
  }]);
}

async function openAddDialog(page: Page, title: string) {
  await page.getByRole("button", { name: `＋ ${title}`, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

for (const screen of [
  { path: "tasks", label: "タスク", selection: "taskId", addTitle: "タスクを追加" },
  { path: "materials", label: "資料", selection: "materialId", addTitle: "資料を追加" },
]) {
  test(`${screen.label}は絞り込んだ2ページ目から詳細を開き、再読み込み後も一覧に戻れる`, async ({ page, isMobile }) => {
    await signIn(page);
    await page.goto(`/labs/e2e-lab/${screen.path}`);
    const listHeading = page.getByRole("heading", { name: `${screen.label}一覧`, exact: true });
    await expect(listHeading).toBeVisible();

    const search = page.getByRole("searchbox", { name: "キーワード" });
    await search.fill("ゼミ");
    if (screen.path === "materials") {
      await page.getByLabel("投稿者", { exact: true }).selectOption({ label: "投稿者A" });
    }
    await page.getByRole("button", { name: "検索", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === "ゼミ");
    await expect(page.getByRole("link", { name: /対象外/ })).toHaveCount(0);

    await page.getByRole("link", { name: "次へ", exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get("page") === "2");
    await expect(page.getByRole("link", { name: /対象外/ })).toHaveCount(0);
    const title = `ゼミ${screen.label} 01`;
    const item = page.getByRole("link", {
      name: screen.path === "materials" ? `${title} PDF` : new RegExp(`^${title}`),
      exact: true,
    });
    await item.click();

    const detail = page.getByRole("region", { name: "項目の詳細" });
    const heading = detail.getByRole("heading", { name: title, exact: true });
    await expect(heading).toBeVisible();
    await expect(heading).toBeFocused();
    const detailUrl = new URL(page.url());
    expect(detailUrl.searchParams.get(screen.selection)).toBeTruthy();
    expect(detailUrl.searchParams.get("page")).toBe("2");
    expect(detailUrl.searchParams.get("q")).toBe("ゼミ");
    if (isMobile) {
      await expect(listHeading).toBeHidden();
    } else {
      await expect(listHeading).toBeVisible();
      await expect(item).toHaveAttribute("aria-current", "true");
    }

    await page.reload();
    await expect(heading).toBeVisible();
    await detail.getByRole("link", { name: "一覧へ戻る" }).click();
    await expect(page).toHaveURL((url) =>
      url.searchParams.get("q") === "ゼミ" &&
      url.searchParams.get("page") === "2" &&
      !url.searchParams.has(screen.selection) &&
      (screen.path !== "materials" || url.searchParams.get("uploader") === "e2e-uploader"),
    );
    await expect(item).toBeFocused();
    await expect(search).toHaveValue("ゼミ");

    const dialog = await openAddDialog(page, screen.addTitle);
    const submitLabel = screen.path === "materials" ? "資料をアップロード" : screen.addTitle;
    await expect(dialog.getByRole("button", { name: submitLabel, exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).toBeHidden();
  });
}

test("タスク詳細からボードに切り替えると選択が解除され、一覧に戻れる", { tag: "@desktop" }, async ({ page }) => {
  await signIn(page);
  await page.goto("/labs/e2e-lab/tasks");
  await page.getByRole("link", { name: /ゼミタスク 21/ }).click();
  await expect(page.getByRole("region", { name: "項目の詳細" }).getByRole("heading", { name: "ゼミタスク 21" })).toBeVisible();
  const boardLink = page.getByRole("link", { name: "ボード", exact: true });
  await boardLink.click();
  await expect(page).toHaveURL((url) => url.searchParams.get("view") === "board" && !url.searchParams.has("taskId"));
  await expect(boardLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("region", { name: "項目の詳細" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "完了", exact: true })).toBeVisible();

  const listLink = page.getByRole("link", { name: "一覧", exact: true });
  await listLink.click();
  await expect(listLink).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("heading", { name: "一覧から項目を選択" })).toBeVisible();
});

test("資料の保存容量が上限に達すると、理由を表示してアップロードを無効にする", async ({ page }) => {
  await signIn(page, true);
  await page.goto("/labs/e2e-full-lab/materials");
  const dialog = await openAddDialog(page, "資料を追加");
  await expect(dialog.getByText(/保存容量に達したため、資料を追加できません/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "資料をアップロード", exact: true })).toBeDisabled();
});
