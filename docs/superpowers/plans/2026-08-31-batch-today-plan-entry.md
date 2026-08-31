# Batch Today Plan Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an atomic batch-entry flow that lets users group multiple independent today-plan tasks under multiple active topics, keep per-task optional details collapsed by default, and save every valid task through the existing plan storage and relationship model.

**Architecture:** Keep the existing single-plan form and plan schema. Add pure batch validation/record-building functions to `LearningDataModel`, then add a DOM-backed batch draft form beside the existing form; page code collects the draft, validates all rows, creates independent plan records, and performs one synchronous write to the existing plan storage key.

**Tech Stack:** Static HTML, vanilla JavaScript, CSS, Local Storage, Node.js test runner, Playwright with local Microsoft Edge.

**Spec:** `docs/batch-today-plan-entry-requirements.md`

## Global Constraints

- Start implementation only after the historical-backfill date stage has passed manual acceptance, updated `docs/project-status.md`, and been saved in Git.
- Create a fresh isolated worktree/branch from that accepted baseline; do not implement on `master` or in the still-dirty date-validation worktree.
- Batch entry creates today-only ordinary plans: `date === getToday()` and `isBackfilled === false`.
- Each task becomes one existing-format plan with its own unique `id` and `topicId`.
- Do not add a batch record, `batchId`, storage key, Local Storage migration, dependency, backend, API, MCP, Connector, or secret configuration.
- Validate all draft rows before building or saving any plan; one invalid row means zero saved plans.
- The existing single-plan today/future and historical-backfill flows must remain unchanged.
- More settings are per task, default collapsed, and retain values while collapsed.
- Do not update `docs/project-status.md` or commit until automated verification and user manual acceptance pass.

---

### Task 1: Pure batch validation and plan construction

**Files:**
- Modify: `src/data-model.js:362-450`
- Modify: `tests/data-model.test.cjs`

**Interfaces:**
- Consumes:
  - `groups: Array<{ clientId: string, topicId: string, tasks: Array<{ clientId: string, task: string, resourceId: string, estimatedMinutes: string, priority: string }> }>`
  - existing topic and resource arrays;
  - `createBatchPlanRecords(entries, { date, createdAt, batchToken })` metadata supplied by the page.
- Produces:
  - `validateBatchPlanGroups(groups, topics, resources) -> { entries, errors }`
  - `createBatchPlanRecords(entries, metadata) -> Plan[]`
  - errors shaped as `{ groupId: string, taskId: string | null, field: string, message: string }`.

- [ ] **Step 1: Write failing tests for a valid multi-topic draft**

Add a literal fixture and assert normalization without mutating inputs:

```js
test("批量计划校验保留主题关联并标准化每条任务字段", () => {
  const topics = [
    { id: "topic-ai", isArchived: false },
    { id: "topic-ielts", isArchived: false },
  ];
  const resources = [
    { id: "resource-ai", topicId: "topic-ai" },
    { id: "resource-ielts", topicId: "topic-ielts" },
  ];
  const groups = [
    {
      clientId: "group-ai",
      topicId: "topic-ai",
      tasks: [
        { clientId: "task-system", task: "  测试学习系统  ", resourceId: "resource-ai", estimatedMinutes: "45", priority: "高" },
        { clientId: "task-rag", task: "学 RAG", resourceId: "", estimatedMinutes: "", priority: "中" },
      ],
    },
    {
      clientId: "group-ielts",
      topicId: "topic-ielts",
      tasks: [
        { clientId: "task-words", task: "背单词", resourceId: "resource-ielts", estimatedMinutes: "20", priority: "低" },
      ],
    },
  ];
  const snapshot = structuredClone(groups);

  const result = model.validateBatchPlanGroups(groups, topics, resources);

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries, [
    { groupId: "group-ai", taskId: "task-system", topicId: "topic-ai", task: "测试学习系统", resourceId: "resource-ai", estimatedMinutes: 45, priority: "高" },
    { groupId: "group-ai", taskId: "task-rag", topicId: "topic-ai", task: "学 RAG", resourceId: null, estimatedMinutes: null, priority: "中" },
    { groupId: "group-ielts", taskId: "task-words", topicId: "topic-ielts", task: "背单词", resourceId: "resource-ielts", estimatedMinutes: 20, priority: "低" },
  ]);
  assert.deepEqual(groups, snapshot);
});
```

- [ ] **Step 2: Run the data-model test and verify RED**

Run:

```powershell
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$env:NODE_PATH = "<workspace-node_modules>"
& $nodeExe --test tests/data-model.test.cjs
```

Expected: FAIL because `validateBatchPlanGroups` does not exist.

- [ ] **Step 3: Add failing validation-boundary tests**

Use table-driven literal cases for:

```js
const invalidCases = [
  { name: "未选择主题", mutate: (groups) => { groups[0].topicId = ""; }, field: "topicId" },
  { name: "主题已归档", mutate: (_groups, topics) => { topics[0].isArchived = true; }, field: "topicId" },
  { name: "重复主题组", mutate: (groups) => { groups[1].topicId = groups[0].topicId; }, field: "topicId" },
  { name: "任务为空", mutate: (groups) => { groups[0].tasks[0].task = "   "; }, field: "task" },
  { name: "资料属于其他主题", mutate: (groups) => { groups[0].tasks[0].resourceId = "resource-ielts"; }, field: "resourceId" },
  { name: "预计时长为零", mutate: (groups) => { groups[0].tasks[0].estimatedMinutes = "0"; }, field: "estimatedMinutes" },
  { name: "预计时长为小数", mutate: (groups) => { groups[0].tasks[0].estimatedMinutes = "1.5"; }, field: "estimatedMinutes" },
  { name: "优先级非法", mutate: (groups) => { groups[0].tasks[0].priority = "紧急"; }, field: "priority" },
];
```

For every case assert `result.entries` is exactly `[]`, at least one error has the expected `field`, and all source arrays remain unchanged. Add separate cases for a non-array group input, an empty groups array, and a group with zero task rows.

- [ ] **Step 4: Implement `validateBatchPlanGroups` minimally**

Add the function near existing plan helpers. Its algorithm must be:

```js
function validateBatchPlanGroups(groups, topics, resources) {
  const errors = [];
  const entries = [];
  const activeTopicIds = new Set(getActiveTopics(topics).map((topic) => topic.id));
  const resourcesById = new Map((Array.isArray(resources) ? resources : []).map((resource) => [resource.id, resource]));
  const usedTopicIds = new Set();

  if (!Array.isArray(groups) || groups.length === 0) {
    return { entries: [], errors: [{ groupId: "", taskId: null, field: "groups", message: "请至少添加一个主题。" }] };
  }

  groups.forEach((group) => {
    const groupId = typeof group?.clientId === "string" ? group.clientId : "";
    const topicId = typeof group?.topicId === "string" ? group.topicId : "";
    const tasks = Array.isArray(group?.tasks) ? group.tasks : [];

    if (!activeTopicIds.has(topicId)) {
      errors.push({ groupId, taskId: null, field: "topicId", message: "请选择未归档的学习主题。" });
    } else if (usedTopicIds.has(topicId)) {
      errors.push({ groupId, taskId: null, field: "topicId", message: "同一主题只能添加一个主题组。" });
    } else {
      usedTopicIds.add(topicId);
    }

    if (tasks.length === 0) {
      errors.push({ groupId, taskId: null, field: "tasks", message: "请至少添加一条任务。" });
    }

    tasks.forEach((row) => {
      const taskId = typeof row?.clientId === "string" ? row.clientId : "";
      const task = typeof row?.task === "string" ? row.task.trim() : "";
      const resourceId = typeof row?.resourceId === "string" && row.resourceId ? row.resourceId : null;
      const estimatedText = typeof row?.estimatedMinutes === "string" ? row.estimatedMinutes.trim() : "";
      const estimatedMinutes = estimatedText === "" ? null : Number(estimatedText);
      const priority = typeof row?.priority === "string" ? row.priority : "";

      if (!task) errors.push({ groupId, taskId, field: "task", message: "请填写任务名称。" });
      if (resourceId && resourcesById.get(resourceId)?.topicId !== topicId) {
        errors.push({ groupId, taskId, field: "resourceId", message: "所选资料不属于当前主题或已不存在。" });
      }
      if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) {
        errors.push({ groupId, taskId, field: "estimatedMinutes", message: "预计时长只能填写正整数分钟，或留空。" });
      }
      if (!["高", "中", "低"].includes(priority)) {
        errors.push({ groupId, taskId, field: "priority", message: "请选择有效优先级。" });
      }

      entries.push({ groupId, taskId, topicId, task, resourceId, estimatedMinutes, priority });
    });
  });

  return errors.length ? { entries: [], errors } : { entries, errors: [] };
}
```

Do not mutate `groups`, `topics`, or `resources`. Export the function through the existing `api` object.

- [ ] **Step 5: Write failing deterministic record-building tests**

```js
test("批量条目按原顺序生成唯一的普通今日计划", () => {
  const entries = [
    { topicId: "topic-ai", task: "测试学习系统", resourceId: null, estimatedMinutes: 45, priority: "高" },
    { topicId: "topic-ai", task: "学 RAG", resourceId: null, estimatedMinutes: null, priority: "中" },
    { topicId: "topic-ielts", task: "背单词", resourceId: null, estimatedMinutes: 20, priority: "低" },
  ];

  const plans = model.createBatchPlanRecords(entries, {
    date: "2026-08-31",
    createdAt: "2026-08-31T02:00:00.000Z",
    batchToken: "1725070000000",
  });

  assert.deepEqual(plans.map((plan) => plan.id), [
    "plan-1725070000000-1",
    "plan-1725070000000-2",
    "plan-1725070000000-3",
  ]);
  assert.deepEqual(plans.map((plan) => [plan.topicId, plan.task]), [
    ["topic-ai", "测试学习系统"],
    ["topic-ai", "学 RAG"],
    ["topic-ielts", "背单词"],
  ]);
  assert.ok(plans.every((plan) => plan.date === "2026-08-31" && plan.isCompleted === false && plan.isBackfilled === false));
});
```

- [ ] **Step 6: Implement `createBatchPlanRecords` and verify GREEN**

Implement a pure map that uses the supplied metadata and does not call the clock:

```js
function createBatchPlanRecords(entries, { date, createdAt, batchToken } = {}) {
  if (!Array.isArray(entries) || !isValidPlanDate(date) || typeof createdAt !== "string" || !String(batchToken || "")) {
    return [];
  }

  return entries.map((entry, index) => ({
    id: `plan-${batchToken}-${index + 1}`,
    date,
    topicId: entry.topicId,
    resourceId: entry.resourceId,
    task: entry.task,
    priority: entry.priority,
    estimatedMinutes: entry.estimatedMinutes,
    isCompleted: false,
    isBackfilled: false,
    createdAt,
  }));
}
```

Export it and run the data-model suite. Expected: all data-model tests pass.

### Task 2: Batch draft form and collapsed per-task details

**Files:**
- Modify: `index.html:182-240`
- Modify: `src/styles.css:145-230,470-620,590-660`
- Modify: `src/app.js:160-260,395-430,740-780,1870-1940,2080-2180`
- Create: `tests/batch-today-plans-page.test.cjs`

**Interfaces:**
- Consumes: active topics, topic-filtered resources, `getToday()`, and the existing plan panel.
- Produces:
  - `setPlanEntryFormMode(mode: "single" | "batch")`
  - `resetBatchPlanForm()`
  - `addBatchPlanGroup(topicId = "")`
  - `addBatchTaskRow(groupElement)`
  - `refreshBatchPlanOptions()`
  - `collectBatchPlanGroups()`
  - `syncBatchPlanDate()`
  - DOM contracts using `data-batch-group`, `data-batch-task-row`, `data-batch-topic`, `data-batch-task`, `data-batch-resource`, `data-batch-minutes`, and `data-batch-priority`.

- [ ] **Step 1: Write the page fixture and failing default-state test**

Create a real static-server Playwright test following `tests/plan-date-validation-page.test.cjs`. The fixture must contain two active topics, one archived topic, and one resource for each active topic. Assert:

```js
assert.equal(await page.getByRole("tab", { name: "单条录入" }).getAttribute("aria-selected"), "true");
await page.getByRole("tab", { name: "批量今日计划" }).click();
assert.equal(await page.locator("#batchPlanForm").isVisible(), true);
assert.equal(await page.locator("[data-batch-group]").count(), 1);
assert.equal(await page.locator("[data-batch-task-row]").count(), 1);
assert.equal(await page.locator("[data-batch-task-details]").isHidden(), true);
assert.equal(await page.getByText(/今天的计划日期/).isVisible(), true);
```

- [ ] **Step 2: Run the page test and verify RED**

Run outside the sandbox because local Edge requires browser-process access:

```powershell
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$env:NODE_PATH = "<workspace-node_modules>"
$env:EDGE_EXE = "<path-to-supported-edge-or-chromium-executable>"
& $nodeExe --test tests/batch-today-plans-page.test.cjs
```

Expected: FAIL because the mode tabs and batch form do not exist.

- [ ] **Step 3: Add accessible single/batch mode controls and form shell**

Add controls inside the existing plan entry panel without changing `#planForm`:

```html
<div class="plan-entry-tabs" role="tablist" aria-label="计划录入方式">
  <button type="button" role="tab" aria-selected="true" aria-controls="planForm" data-plan-entry-mode="single">单条录入</button>
  <button type="button" role="tab" aria-selected="false" aria-controls="batchPlanForm" data-plan-entry-mode="batch">批量今日计划</button>
</div>

<form id="batchPlanForm" class="batch-plan-form hidden" aria-label="批量录入今日计划">
  <p id="batchPlanDate" class="batch-plan-date"></p>
  <div id="batchPlanGroups"></div>
  <div class="form-actions">
    <button id="addBatchPlanGroupButton" type="button">添加主题</button>
    <button id="saveBatchPlansButton" type="submit">统一保存今日计划</button>
  </div>
  <p id="batchPlanSaveMessage" class="form-message" aria-live="polite"></p>
</form>
```

Use the project's existing button classes. `setPlanEntryFormMode` must update `hidden`, `aria-selected`, and keyboard focus without resetting either form.

- [ ] **Step 4: Implement dynamic theme groups and task rows**

Use DOM-backed draft state. Generate stable page-only client IDs from monotonic counters such as `batch-group-1` and `batch-task-1`; these IDs are not persisted.

Each group must render:

- an explicit topic label/select;
- remove-theme button, disabled when it is the only group;
- a task container;
- “添加同主题任务”.

Each task row must render:

- required task text input;
- “更多设置” button with `aria-expanded="false"` and `aria-controls`;
- hidden details containing resource, estimated minutes and priority;
- remove-task button, disabled when it is the group's only task;
- field error elements connected with `aria-describedby`.

Use one event listener on `#batchPlanForm` for add/remove/expand actions. Do not rerender the whole form while the user types. Removing a row/group must update remove-button availability, selected-topic availability, summary count, and resource options.

- [ ] **Step 5: Write and run interaction tests**

Add tests that:

1. add a second AI task and a second topic group;
2. verify the AI topic is unavailable in the second group;
3. select IELTS and verify only IELTS resources appear there;
4. expand AI task details, fill all fields, collapse and reopen, and assert every value remains;
5. remove a non-last task and non-last group;
6. verify the last group/task remove buttons are disabled;
7. toggle back to Single and return to Batch without losing the draft.

Expected before implementation: FAIL on missing controls. Expected after Steps 3–4: PASS.

- [ ] **Step 6: Refresh batch options during normal renders and midnight changes**

Call `refreshBatchPlanOptions()` from the existing `render()` after active topics/resources may have changed. Preserve valid selections; clear resource selections that no longer belong to the selected topic. Extend the existing visibility/date synchronization so `syncBatchPlanDate()` runs when the page becomes visible and when the batch form receives focus. The displayed date and later submit date must both use fresh `getToday()` values.

- [ ] **Step 7: Add responsive styling and verify 390px**

Use a stacked layout at `max-width: 820px`; task rows, details and actions must use `min-width: 0`, wrapping action rows and full-width inputs. Add a 390px test that expands details, adds two themes and two tasks, and asserts:

```js
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
assert.deepEqual(pageErrors, []);
```

### Task 3: Atomic validation, save, and independent plan behavior

**Files:**
- Modify: `src/app.js:420-490,740-780,1070-1140,1870-1940,2080-2200`
- Modify: `tests/batch-today-plans-page.test.cjs`

**Interfaces:**
- Consumes: Task 1 model functions and Task 2 `collectBatchPlanGroups()`.
- Produces:
  - `submitBatchPlans(event)`
  - `clearBatchPlanErrors()`
  - `showBatchPlanErrors(errors)`
  - exactly one write to `PLAN_STORAGE_KEY` on successful validation.

- [ ] **Step 1: Write the failing four-plan save test**

Through the real UI create:

- AI / 测试学习系统 / AI resource / 45 / 高;
- AI / 学 RAG / no resource / blank minutes / 中;
- IELTS / 背单词 / IELTS resource / 20 / 低;
- IELTS / 做阅读 / no resource / 30 / 中.

Click “统一保存今日计划” and assert the stored plan array contains four records in that exact order. Assert literal field values, `date === today`, `isCompleted === false`, `isBackfilled === false`, and `new Set(ids).size === 4`. Reload and assert the same four records remain.

- [ ] **Step 2: Run the save test and verify RED**

Run the focused page file. Expected: FAIL because batch submit does not create plans.

- [ ] **Step 3: Implement atomic submit**

The submit handler must follow this order:

```js
function submitBatchPlans(event) {
  event.preventDefault();
  clearBatchPlanErrors();

  const groups = collectBatchPlanGroups();
  const result = window.LearningDataModel.validateBatchPlanGroups(groups, topics, resources);
  if (result.errors.length) {
    showBatchPlanErrors(result.errors);
    batchPlanSaveMessage.textContent = "存在未完成或无效内容，尚未保存任何计划。";
    return;
  }

  const now = new Date();
  const createdAt = now.toISOString();
  const newPlans = window.LearningDataModel.createBatchPlanRecords(result.entries, {
    date: getToday(),
    createdAt,
    batchToken: String(now.getTime()),
  });
  const nextPlans = [...newPlans, ...plans];

  try {
    saveItems(PLAN_STORAGE_KEY, nextPlans);
  } catch {
    batchPlanSaveMessage.textContent = "批量计划保存失败，草稿已保留，请检查浏览器存储后重试。";
    return;
  }

  plans = nextPlans;
  selectedPlanView = "today";
  resetBatchPlanForm();
  render();
  batchPlanSaveMessage.textContent = `已保存 ${newPlans.length} 条今日计划。`;
}
```

Assign `plans` only after `saveItems` succeeds. Keep batch mode active and retain the success message after `render()`.

- [ ] **Step 4: Write failing all-or-nothing error tests**

For each scenario start with a known existing plan array, fill at least two otherwise valid tasks, introduce one error, submit, and deep-compare Local Storage before/after:

- blank visible task;
- invalid duration in collapsed details;
- resource changed programmatically to another topic;
- duplicated topic group;
- selected topic archived via the real topic UI before submit.

Assert no plan is added, all draft inputs remain, the first error receives focus, the relevant details panel expands, and the message contains “尚未保存任何计划”.

- [ ] **Step 5: Implement error projection and verify atomicity**

`showBatchPlanErrors` must locate a field by `groupId`, `taskId`, and `field`; set `aria-invalid="true"`, write the linked error element, expand details for `resourceId`, `estimatedMinutes`, or `priority`, and focus only the first error. Unknown/stale error IDs fall back to the form-level live region without throwing.

Run the focused page tests. Expected: all atomic-validation scenarios pass.

- [ ] **Step 6: Write and pass a storage-failure regression**

Temporarily replace `Storage.prototype.setItem` in the page so it throws only for `personal-learning-system-plans`. Submit two valid tasks. Assert:

- existing storage is unchanged;
- today plan count is unchanged;
- draft inputs remain filled;
- a visible failure message explains that the draft was retained;
- no unhandled `pageerror` occurs.

Restore the original method after the assertion. The try/catch in Step 3 must make this test pass.

- [ ] **Step 7: Verify independent plan operations and single-form regression**

After a successful four-plan save:

1. mark only “学 RAG” complete and assert the other three remain incomplete;
2. delete only “背单词” and assert the other three remain;
3. verify topic detail/today counts follow each plan's `topicId`;
4. create a future single plan and a historical-backfill single plan;
5. assert their date, `isBackfilled`, view classification and existing progress-link behavior are unchanged.

### Task 4: Verification and manual acceptance gate

**Files:**
- Create: `tests/manual-batch-today-plan-entry-regression.md`
- Keep unchanged until acceptance: `docs/project-status.md`

**Interfaces:**
- Consumes: Tasks 1–3 behavior and the accepted historical-backfill baseline.
- Produces: complete automated evidence and a user-executable manual checklist.

- [ ] **Step 1: Write the manual checklist**

Copy all ten scenarios from `docs/batch-today-plan-entry-requirements.md` section 12. Add preparation instructions for two active themes and theme-specific resources, expected plan counts before/after, safe test record names, 390px responsive mode, and a reminder not to enter secrets.

- [ ] **Step 2: Run syntax checks**

```powershell
$nodeExe = (Get-Command node -ErrorAction Stop).Source
& $nodeExe --check src/app.js
& $nodeExe --check src/data-model.js
& $nodeExe --check src/mock-ai-provider.js
& $nodeExe --check src/ai-service.js
```

Expected: all four commands exit 0.

- [ ] **Step 3: Run focused and complete automated tests**

```powershell
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$env:NODE_PATH = "<workspace-node_modules>"
$env:EDGE_EXE = "<path-to-supported-edge-or-chromium-executable>"
& $nodeExe --test tests/data-model.test.cjs tests/batch-today-plans-page.test.cjs tests/plan-date-validation-page.test.cjs
$testFiles = (Get-ChildItem -LiteralPath "tests" -Filter "*.test.cjs").FullName
& $nodeExe --test $testFiles
```

Expected: all tests pass, zero skipped tests, zero unhandled page errors.

- [ ] **Step 4: Review scope, sensitive files, and diff quality**

```powershell
git diff --check
git status --short
git diff --name-only
git ls-files --others --exclude-standard
git check-ignore -v .env .env.local "*.key" "*.pem"
```

Confirm only the requirements/plan, batch HTML/CSS/JavaScript, data-model tests, batch page test, and manual checklist changed. Confirm no `.env`, token, key, dependency, V1.4 AI parsing, copy-to-tomorrow, rollover, or unrelated file is included.

- [ ] **Step 5: Request read-only code review**

Ask the reviewer to check atomic save semantics, ID uniqueness, topic/resource isolation, active-topic race protection, midnight behavior, accessibility, mobile layout, legacy single-form regression, test quality, and sensitive-file scope. Resolve all Critical and Important findings, then rerun Steps 2–4.

- [ ] **Step 6: Stop for user manual acceptance**

Report fresh automated counts, open the local acceptance page, and link `tests/manual-batch-today-plan-entry-regression.md`. Do not update `docs/project-status.md`, commit, merge, or start another feature until the user reports acceptance.

### Task 5: Post-acceptance documentation and Git save

**Files:**
- Modify after user acceptance only: `docs/project-status.md`
- Include in the eventual scoped commit: requirement, plan, implementation, automated tests, and manual checklist for this batch feature only.

**Interfaces:**
- Consumes: explicit user manual-acceptance result.
- Produces: accurate project status and one reviewed Git commit on the feature branch.

- [ ] **Step 1: Update project status after acceptance**

Record the confirmed feature scope, data compatibility, manual scenarios, final automated test count, zero failures/skips, branch name, and the fact that every task remains independently associated with its `topicId`.

- [ ] **Step 2: Re-run final verification**

Repeat Task 4 Steps 2–4 after the documentation change. Expected: tests still pass and the diff contains only approved batch-feature files.

- [ ] **Step 3: Stage exact files and inspect the index**

Use explicit paths rather than `git add .`:

```powershell
git add index.html src/app.js src/data-model.js src/styles.css tests/data-model.test.cjs tests/batch-today-plans-page.test.cjs tests/manual-batch-today-plan-entry-regression.md docs/batch-today-plan-entry-requirements.md docs/superpowers/plans/2026-08-31-batch-today-plan-entry.md docs/project-status.md
git diff --cached --check
git diff --cached --name-only
```

Confirm no date-stage-only uncommitted file, secret, `.env`, generated artifact, or unrelated change is staged.

- [ ] **Step 4: Commit the accepted stage**

```powershell
git commit -m "feat: add batch today plan entry"
```

Do not push, merge, publish, delete a worktree, or start the next stage without the user's explicit direction.
