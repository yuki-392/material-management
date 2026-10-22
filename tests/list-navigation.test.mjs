import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const taskPage = readFileSync(
  new URL("../src/app/(workspace)/labs/[labId]/tasks/page.tsx", import.meta.url),
  "utf8",
);
const materialPage = readFileSync(
  new URL("../src/app/(workspace)/labs/[labId]/materials/page.tsx", import.meta.url),
  "utf8",
);

function expectMatch(source, pattern, description) {
  assert.ok(pattern.test(source), description);
}

test("task search and clear navigation preserve scroll position", () => {
  expectMatch(taskPage, /import Form from "next\/form";/, "use Next Form");
  expectMatch(
    taskPage,
    /<Form(?=[^>]*action=\{tasksPath\})(?=[^>]*scroll=\{false\})[^>]*>[\s\S]*?<\/Form>/,
    "task search uses a GET navigation without scrolling",
  );
  expectMatch(
    taskPage,
    /<ButtonLink\s+href=\{tasksPath\}\s+scroll=\{false\}\s+variant="secondary">\s*条件をクリア/,
    "task filter clear preserves scroll position",
  );
  expectMatch(
    taskPage,
    /href=\{hasActiveFilters \? tasksPath : "#create-task"\}\s+scroll=\{!hasActiveFilters\}/,
    "task empty state preserves scroll only when clearing filters",
  );
});

test("material search and clear navigation preserve scroll position", () => {
  expectMatch(materialPage, /import Form from "next\/form";/, "use Next Form");
  expectMatch(
    materialPage,
    /<Form(?=[^>]*action=\{materialsPath\})(?=[^>]*scroll=\{false\})[^>]*>[\s\S]*?<\/Form>/,
    "material search uses a GET navigation without scrolling",
  );
  expectMatch(
    materialPage,
    /<ButtonLink\s+href=\{materialsPath\}\s+scroll=\{false\}\s+variant="secondary">\s*条件をクリア/,
    "material filter clear preserves scroll position",
  );
  expectMatch(
    materialPage,
    /href=\{\s*hasActiveFilters\s*\?\s*materialsPath\s*:\s*"#material-upload"\s*\}\s*scroll=\{!hasActiveFilters\}/,
    "material empty state preserves scroll only when clearing filters",
  );
});
