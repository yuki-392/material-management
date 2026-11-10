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

test("task filters keep URL state and the task creation disclosure stays compact", () => {
  expectMatch(taskPage, /import Form from "next\/form";/, "use Next Form");
  expectMatch(
    taskPage,
    /<Form(?=[^>]*action=\{tasksPath\})(?=[^>]*scroll=\{false\})[^>]*>[\s\S]*?<\/Form>/,
    "task search uses a GET navigation without scrolling",
  );
  expectMatch(
    taskPage,
    /<ButtonLink\s+href=\{tasksPath\}\s+scroll=\{false\}\s+variant="secondary">\s*クリア/,
    "task filter clear resets URL state without scrolling",
  );
  expectMatch(
    taskPage,
    /id="create-task"[\s\S]*?<summary/,
    "task form is collapsed behind a clear add action",
  );
  expectMatch(
    taskPage,
    /TaskBoardResults[\s\S]*?TaskListResults/,
    "task view supports both list and board presentations",
  );
});

test("material filters include uploader and keep the upload form compact", () => {
  expectMatch(materialPage, /import Form from "next\/form";/, "use Next Form");
  expectMatch(
    materialPage,
    /<Form(?=[^>]*action=\{materialsPath\})(?=[^>]*scroll=\{false\})[^>]*>[\s\S]*?<\/Form>/,
    "material search uses a GET navigation without scrolling",
  );
  expectMatch(
    materialPage,
    /<ButtonLink\s+href=\{clearHref\}\s+scroll=\{false\}\s+variant="secondary">\s*クリア/,
    "material filter clear resets URL state without scrolling",
  );
  expectMatch(
    materialPage,
    /name="uploader"/,
    "material uploader can be used as a filter",
  );
  expectMatch(
    materialPage,
    /id="material-upload"[\s\S]*?<summary/,
    "material upload form is collapsed behind a clear add action",
  );
});
