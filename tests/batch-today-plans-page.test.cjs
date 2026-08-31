const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const workspaceRoot = path.resolve(__dirname, "..");

function getToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getLocalDate(dayOffset) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fixture() {
  const today = getToday();
  return {
    "personal-learning-system-topics": [
      { id: "topic-ai", name: "AI", direction: "技术", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
      { id: "topic-ielts", name: "IELTS", direction: "英语", parentId: "", description: "", status: "未开始", createdAt: today, updatedAt: today },
      { id: "topic-archived", name: "归档主题", direction: "旧", parentId: "", description: "", status: "学习中", isArchived: true, archivedAt: `${today}T00:00:00.000Z`, archiveRootId: "topic-archived", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-resources": [
      { id: "resource-ai", title: "AI 资料", topicId: "topic-ai", type: "文章", status: "学习中", createdAt: today, updatedAt: today },
      { id: "resource-ielts", title: "IELTS 资料", topicId: "topic-ielts", type: "真题", status: "未开始", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-plans": [],
    "personal-learning-system-notes": [],
    "personal-learning-system-progress-records": [],
  };
}

function createServer() {
  return http.createServer((request, response) => {
    const requestPath = request.url === "/" ? "/index.html" : request.url;
    const filePath = path.join(workspaceRoot, decodeURIComponent(requestPath));
    if (!filePath.startsWith(workspaceRoot) || !fs.existsSync(filePath)) return response.writeHead(404).end();
    response.writeHead(200, { "content-type": filePath.endsWith(".js") ? "text/javascript" : filePath.endsWith(".css") ? "text/css" : "text/html" });
    fs.createReadStream(filePath).pipe(response);
  });
}

async function openPage(server, items = fixture(), { clockTime } = {}) {
  const browser = await chromium.launch({ executablePath: process.env.EDGE_EXE, headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  if (clockTime) await page.clock.install({ time: clockTime });
  await page.addInitScript((items) => Object.entries(items).forEach(([key, value]) => {
    if (localStorage.getItem(key) === null) localStorage.setItem(key, JSON.stringify(value));
  }), items);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  return { browser, page, pageErrors };
}

function fixtureWithExistingPlan() {
  const items = fixture();
  const today = getToday();
  items["personal-learning-system-plans"] = [{
    id: "plan-existing",
    task: "已有计划",
    topicId: "topic-ielts",
    resourceId: null,
    estimatedMinutes: 15,
    priority: "中",
    date: today,
    createdAt: `${today}T00:00:00.000Z`,
    isCompleted: false,
    isBackfilled: false,
  }];
  return items;
}

async function fillTwoValidBatchTasks(page) {
  await page.getByRole("tab", { name: "批量今日计划" }).click();
  const group = page.locator("[data-batch-group]").first();
  await group.locator("[data-batch-topic]").selectOption("topic-ai");
  await group.locator("[data-batch-task]").fill("有效任务一");
  await group.getByRole("button", { name: "添加同主题任务" }).click();
  await group.locator("[data-batch-task]").nth(1).fill("有效任务二");
  return group;
}

async function readBatchDraft(page) {
  return page.locator("[data-batch-group]").evaluateAll((groups) => groups.map((group) => ({
    topicId: group.querySelector("[data-batch-topic]").value,
    tasks: [...group.querySelectorAll("[data-batch-task-row]")].map((row) => ({
      task: row.querySelector("[data-batch-task]").value,
      resourceId: row.querySelector("[data-batch-resource]").value,
      estimatedMinutes: row.querySelector("[data-batch-minutes]").value,
      priority: row.querySelector("[data-batch-priority]").value,
    })),
  })));
}

async function assertAtomicInvalidSubmit(page, pageErrors, expectedField, detailRow = null) {
  const storageBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const draftBefore = await readBatchDraft(page);
  await page.getByRole("button", { name: "统一保存今日计划" }).click();

  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans"))), storageBefore);
  assert.deepEqual(await readBatchDraft(page), draftBefore);
  assert.match(await page.locator("#planSummary").textContent(), /今天共有 1 个任务/);
  assert.equal(await page.locator("#planList .plan-card h3").allTextContents().then((items) => items.includes("已有计划")), true);
  assert.match(await page.locator("#batchPlanSaveMessage").textContent(), /尚未保存任何计划/);
  assert.equal(await expectedField.getAttribute("aria-invalid"), "true");
  assert.equal(await expectedField.evaluate((field) => field === document.activeElement), true);
  if (detailRow) {
    assert.equal(await detailRow.locator("[data-batch-task-details]").isVisible(), true);
    assert.equal(await detailRow.locator("[data-toggle-batch-task-details]").getAttribute("aria-expanded"), "true");
  }
  assert.deepEqual(pageErrors, []);
}

const invalidBatchScenarios = [
  {
    name: "空白可见任务阻止整批保存并聚焦任务",
    prepare: async (page, group) => {
      const row = group.locator("[data-batch-task-row]").first();
      await row.locator("[data-batch-task]").fill("");
      return { expectedField: row.locator("[data-batch-task]") };
    },
  },
  {
    name: "折叠详情中的非法分钟阻止整批保存并自动展开",
    prepare: async (page, group) => {
      const row = group.locator("[data-batch-task-row]").first();
      await row.locator("[data-toggle-batch-task-details]").click();
      await row.locator("[data-batch-minutes]").fill("0");
      await row.locator("[data-toggle-batch-task-details]").click();
      return { expectedField: row.locator("[data-batch-minutes]"), detailRow: row };
    },
  },
  {
    name: "跨主题资料阻止整批保存并自动展开",
    prepare: async (page, group) => {
      const row = group.locator("[data-batch-task-row]").first();
      const field = row.locator("[data-batch-resource]");
      await field.evaluate((select) => {
        select.add(new Option("错误的 IELTS 资料", "resource-ielts"));
        select.value = "resource-ielts";
      });
      return { expectedField: field, detailRow: row };
    },
  },
  {
    name: "重复主题组阻止整批保存并聚焦重复主题",
    prepare: async (page) => {
      await page.getByRole("button", { name: "添加主题" }).click();
      const duplicateGroup = page.locator("[data-batch-group]").nth(1);
      await duplicateGroup.locator("[data-batch-topic]").selectOption("topic-ielts");
      await duplicateGroup.locator("[data-batch-task]").fill("第三个有效任务");
      await duplicateGroup.locator("[data-batch-topic]").evaluate((select) => { select.value = "topic-ai"; });
      return { expectedField: duplicateGroup.locator("[data-batch-topic]") };
    },
  },
  {
    name: "草稿主题经真实界面归档后阻止整批保存",
    prepare: async (page) => {
      page.once("dialog", (dialog) => dialog.accept());
      await page.locator("[data-select-topic='topic-ai']").click();
      await page.locator("[data-archive-topic='topic-ai']").click();
      return { expectedField: page.locator("[data-batch-group]").first().locator("[data-batch-topic]") };
    },
  },
  {
    name: "非法优先级阻止整批保存并自动展开",
    prepare: async (page, group) => {
      const row = group.locator("[data-batch-task-row]").first();
      const field = row.locator("[data-batch-priority]");
      await field.evaluate((select) => {
        select.add(new Option("紧急", "紧急"));
        select.value = "紧急";
      });
      return { expectedField: field, detailRow: row };
    },
  },
];

for (const scenario of invalidBatchScenarios) {
  test(scenario.name, async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());
    const { browser, page, pageErrors } = await openPage(server, fixtureWithExistingPlan());
    t.after(() => browser.close());
    const group = await fillTwoValidBatchTasks(page);
    const { expectedField, detailRow } = await scenario.prepare(page, group);
    await assertAtomicInvalidSubmit(page, pageErrors, expectedField, detailRow);
  });
}

test("数字输入处于 badInput 时整批拒绝且保留草稿错误状态", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server, fixtureWithExistingPlan());
  t.after(() => browser.close());
  const group = await fillTwoValidBatchTasks(page);
  const firstRow = group.locator("[data-batch-task-row]").first();
  await firstRow.locator("[data-toggle-batch-task-details]").click();
  const minutesField = firstRow.locator("[data-batch-minutes]");
  await minutesField.click();
  await minutesField.pressSequentially("e");
  assert.equal(await minutesField.evaluate((input) => input.validity.badInput), true);
  assert.equal(await minutesField.inputValue(), "");
  const storageBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));

  await page.getByRole("button", { name: "统一保存今日计划" }).click();

  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans"))), storageBefore);
  assert.match(await page.locator("#planSummary").textContent(), /今天共有 1 个任务/);
  assert.equal(await minutesField.evaluate((input) => input.validity.badInput), true);
  assert.equal(await firstRow.locator("[data-batch-task]").inputValue(), "有效任务一");
  assert.equal(await group.locator("[data-batch-task]").nth(1).inputValue(), "有效任务二");
  assert.equal(await firstRow.locator("[data-batch-task-details]").isVisible(), true);
  assert.equal(await minutesField.getAttribute("aria-invalid"), "true");
  assert.equal(await minutesField.evaluate((field) => field === document.activeElement), true);
  assert.match(await page.locator(`#${await minutesField.getAttribute("aria-describedby")}`).textContent(), /分钟数必须为正整数或留空/);
  assert.match(await page.locator("#batchPlanSaveMessage").textContent(), /尚未保存任何计划/);
  assert.deepEqual(pageErrors, []);
});

test("批量计划存储写入失败时保留原有计划和完整草稿", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server, fixtureWithExistingPlan());
  t.after(() => browser.close());
  const group = await fillTwoValidBatchTasks(page);
  const firstRow = group.locator("[data-batch-task-row]").first();
  await firstRow.getByRole("button", { name: "更多设置" }).click();
  await firstRow.locator("[data-batch-resource]").selectOption("resource-ai");
  await firstRow.locator("[data-batch-minutes]").fill("25");
  await firstRow.locator("[data-batch-priority]").selectOption("高");
  const storageBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const draftBefore = await readBatchDraft(page);

  await page.evaluate(() => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function failingPlanWrite(key, value) {
      if (key === "personal-learning-system-plans") throw new Error("quota denied for test");
      return window.__originalStorageSetItem.call(this, key, value);
    };
  });
  try {
    await page.getByRole("button", { name: "统一保存今日计划" }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans"))), storageBefore);
    assert.deepEqual(await readBatchDraft(page), draftBefore);
    assert.equal(await firstRow.locator("[data-batch-task-details]").isVisible(), true);
    assert.equal(await group.locator("[data-batch-topic]").inputValue(), "topic-ai");
    assert.match(await page.locator("#planSummary").textContent(), /今天共有 1 个任务/);
    assert.match(await page.locator("#batchPlanSaveMessage").textContent(), /批量计划保存失败.*草稿已保留/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await page.evaluate(() => {
      Storage.prototype.setItem = window.__originalStorageSetItem;
      delete window.__originalStorageSetItem;
    });
  }
});

test("有效草稿构造结果异常为空时零写入并保留草稿", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server, fixtureWithExistingPlan());
  t.after(() => browser.close());
  await fillTwoValidBatchTasks(page);
  const storageBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const draftBefore = await readBatchDraft(page);
  await page.evaluate(() => {
    window.__originalCreateBatchPlanRecords = window.LearningDataModel.createBatchPlanRecords;
    window.__planStorageWriteCount = 0;
    const originalSetItem = Storage.prototype.setItem;
    window.__originalStorageSetItemForBuildFailure = originalSetItem;
    Storage.prototype.setItem = function countPlanWrites(key, value) {
      if (key === "personal-learning-system-plans") window.__planStorageWriteCount += 1;
      return originalSetItem.call(this, key, value);
    };
    window.LearningDataModel.createBatchPlanRecords = () => [];
  });
  try {
    await page.getByRole("button", { name: "统一保存今日计划" }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans"))), storageBefore);
    assert.deepEqual(await readBatchDraft(page), draftBefore);
    assert.equal(await page.evaluate(() => window.__planStorageWriteCount), 0);
    assert.match(await page.locator("#planSummary").textContent(), /今天共有 1 个任务/);
    assert.match(await page.locator("#batchPlanSaveMessage").textContent(), /构建失败.*尚未保存/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await page.evaluate(() => {
      window.LearningDataModel.createBatchPlanRecords = window.__originalCreateBatchPlanRecords;
      Storage.prototype.setItem = window.__originalStorageSetItemForBuildFailure;
      delete window.__originalCreateBatchPlanRecords;
      delete window.__originalStorageSetItemForBuildFailure;
    });
  }
});

async function fillFourBatchPlans(page) {
  await page.getByRole("tab", { name: "批量今日计划" }).click();
  const aiGroup = page.locator("[data-batch-group]").first();
  await aiGroup.locator("[data-batch-topic]").selectOption("topic-ai");

  const systemTask = aiGroup.locator("[data-batch-task-row]").first();
  await systemTask.locator("[data-batch-task]").fill("测试学习系统");
  await systemTask.getByRole("button", { name: "更多设置" }).click();
  await systemTask.locator("[data-batch-resource]").selectOption("resource-ai");
  await systemTask.locator("[data-batch-minutes]").fill("45");
  await systemTask.locator("[data-batch-priority]").selectOption("高");

  await aiGroup.getByRole("button", { name: "添加同主题任务" }).click();
  const ragTask = aiGroup.locator("[data-batch-task-row]").nth(1);
  await ragTask.locator("[data-batch-task]").fill("学 RAG");

  await page.getByRole("button", { name: "添加主题" }).click();
  const ieltsGroup = page.locator("[data-batch-group]").nth(1);
  await ieltsGroup.locator("[data-batch-topic]").selectOption("topic-ielts");

  const wordsTask = ieltsGroup.locator("[data-batch-task-row]").first();
  await wordsTask.locator("[data-batch-task]").fill("背单词");
  await wordsTask.getByRole("button", { name: "更多设置" }).click();
  await wordsTask.locator("[data-batch-resource]").selectOption("resource-ielts");
  await wordsTask.locator("[data-batch-minutes]").fill("20");
  await wordsTask.locator("[data-batch-priority]").selectOption("低");

  await ieltsGroup.getByRole("button", { name: "添加同主题任务" }).click();
  const readingTask = ieltsGroup.locator("[data-batch-task-row]").nth(1);
  await readingTask.locator("[data-batch-task]").fill("做阅读");
  await readingTask.getByRole("button", { name: "更多设置" }).click();
  await readingTask.locator("[data-batch-minutes]").fill("30");
}

test("批量保存四条今日计划保持输入顺序且只原子写入一次", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server);
  t.after(() => browser.close());
  await page.evaluate(() => {
    const originalSetItem = Storage.prototype.setItem;
    window.__planStorageWriteCount = 0;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === "personal-learning-system-plans") window.__planStorageWriteCount += 1;
      return originalSetItem.call(this, key, value);
    };
  });

  await fillFourBatchPlans(page);
  await page.getByRole("button", { name: "统一保存今日计划" }).click();

  const savedPlans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.deepEqual(savedPlans.map(({ task, topicId, resourceId, estimatedMinutes, priority, date, isCompleted, isBackfilled }) => ({
    task, topicId, resourceId, estimatedMinutes, priority, date, isCompleted, isBackfilled,
  })), [
    { task: "测试学习系统", topicId: "topic-ai", resourceId: "resource-ai", estimatedMinutes: 45, priority: "高", date: getToday(), isCompleted: false, isBackfilled: false },
    { task: "学 RAG", topicId: "topic-ai", resourceId: null, estimatedMinutes: null, priority: "中", date: getToday(), isCompleted: false, isBackfilled: false },
    { task: "背单词", topicId: "topic-ielts", resourceId: "resource-ielts", estimatedMinutes: 20, priority: "低", date: getToday(), isCompleted: false, isBackfilled: false },
    { task: "做阅读", topicId: "topic-ielts", resourceId: null, estimatedMinutes: 30, priority: "中", date: getToday(), isCompleted: false, isBackfilled: false },
  ]);
  assert.equal(new Set(savedPlans.map((plan) => plan.id)).size, 4);
  assert.equal(new Set(savedPlans.map((plan) => plan.createdAt)).size, 1);
  assert.equal(Number.isNaN(Date.parse(savedPlans[0].createdAt)), false);
  assert.equal(savedPlans.some((plan) => Object.hasOwn(plan, "batchId")), false);
  assert.equal(await page.evaluate(() => window.__planStorageWriteCount), 1);
  assert.equal(await page.locator("#batchPlanSaveMessage").textContent(), "已保存 4 条今日计划。");
  assert.equal(await page.locator("#batchPlanForm").isVisible(), true);
  assert.equal(await page.locator("[data-batch-group]").count(), 1);
  assert.equal(await page.locator("[data-batch-task-row]").count(), 1);
  assert.equal(await page.locator("[data-batch-task]").inputValue(), "");
  assert.match(await page.locator("#planSummary").textContent(), /今天共有 4 个任务/);

  await page.reload();
  const reloadedPlans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.deepEqual(reloadedPlans, savedPlans);
  assert.deepEqual(await page.locator("#planList .plan-card h3").allTextContents(), ["测试学习系统", "学 RAG", "背单词", "做阅读"]);
  assert.deepEqual(pageErrors, []);
});

test("批量保存后的每条计划可独立完成和删除且主题计数各自更新", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server);
  t.after(() => browser.close());
  await fillFourBatchPlans(page);
  await page.getByRole("button", { name: "统一保存今日计划" }).click();
  const originalPlans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const originalByTask = Object.fromEntries(originalPlans.map((plan) => [plan.task, plan]));

  const ragCard = page.locator("#planList .plan-card").filter({ has: page.getByRole("heading", { name: "学 RAG", exact: true }) });
  await ragCard.getByRole("button", { name: "完成", exact: true }).click();
  let plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.equal(plans.find((plan) => plan.task === "学 RAG").isCompleted, true);
  assert.deepEqual(plans.filter((plan) => plan.task !== "学 RAG").map((plan) => plan.isCompleted), [false, false, false]);

  await ragCard.getByRole("button", { name: "取消完成", exact: true }).click();
  plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.equal(plans.find((plan) => plan.task === "学 RAG").isCompleted, false);
  assert.deepEqual(plans.filter((plan) => plan.task !== "学 RAG").map((plan) => plan.isCompleted), [false, false, false]);

  page.once("dialog", (dialog) => dialog.accept());
  const wordsCard = page.locator("#planList .plan-card").filter({ has: page.getByRole("heading", { name: "背单词", exact: true }) });
  await wordsCard.getByRole("button", { name: "删除", exact: true }).click();
  plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.deepEqual(plans.map((plan) => plan.task), ["测试学习系统", "学 RAG", "做阅读"]);
  for (const plan of plans) {
    assert.equal(plan.id, originalByTask[plan.task].id);
    assert.equal(plan.topicId, originalByTask[plan.task].topicId);
    assert.equal(plan.resourceId, originalByTask[plan.task].resourceId);
  }

  await page.locator("[data-select-topic='topic-ai']").click();
  assert.match(await page.locator("#topicDetail").textContent(), /今天有 2 个任务/);
  await page.locator("[data-select-topic='topic-ielts']").click();
  assert.match(await page.locator("#topicDetail").textContent(), /今天有 1 个任务/);
  assert.equal(await page.getByRole("button", { name: /完成整批|删除整批/ }).count(), 0);
  assert.equal(plans.some((plan) => Object.hasOwn(plan, "batchId")), false);
  assert.deepEqual(pageErrors, []);
});

test("批量组更换主题会清除旧资料并只提供新主题资料", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server);
  t.after(() => browser.close());
  await page.getByRole("tab", { name: "批量今日计划" }).click();
  const group = page.locator("[data-batch-group]").first();
  const resource = group.locator("[data-batch-resource]");
  await group.locator("[data-batch-topic]").selectOption("topic-ai");
  await group.locator("[data-toggle-batch-task-details]").click();
  await resource.selectOption("resource-ai");
  assert.equal(await resource.inputValue(), "resource-ai");

  await group.locator("[data-batch-topic]").selectOption("topic-ielts");
  assert.equal(await resource.inputValue(), "");
  assert.deepEqual(await resource.locator("option").evaluateAll((options) => options.map((option) => [option.value, option.textContent])), [
    ["", "不关联资料"],
    ["resource-ielts", "IELTS 资料"],
  ]);
  assert.equal(await resource.locator("option[value='resource-ai']").count(), 0);

  await group.locator("[data-batch-topic]").selectOption("topic-ai");
  assert.deepEqual(await resource.locator("option").evaluateAll((options) => options.map((option) => option.value)), ["", "resource-ai"]);
  assert.deepEqual(pageErrors, []);
});

test("批量页面跨过本地午夜后刷新日期并按新日期保存", async (t) => {
  const initialToday = "2026-08-31";
  const nextToday = "2026-09-01";
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server, fixture(), {
    clockTime: new Date(2026, 7, 31, 23, 59, 0),
  });
  t.after(() => browser.close());
  await page.getByRole("tab", { name: "批量今日计划" }).click();
  assert.match(await page.locator("#batchPlanDate").textContent(), new RegExp(initialToday));
  const group = page.locator("[data-batch-group]").first();
  await group.locator("[data-batch-topic]").selectOption("topic-ai");
  await group.locator("[data-batch-task]").fill("跨午夜批量任务");

  await page.clock.setSystemTime(new Date(2026, 8, 1, 0, 1, 0));
  await group.locator("[data-batch-topic]").focus();
  assert.match(await page.locator("#batchPlanDate").textContent(), new RegExp(nextToday));
  await page.getByRole("button", { name: "统一保存今日计划" }).click();

  const plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.equal(plans.length, 1);
  assert.equal(plans[0].task, "跨午夜批量任务");
  assert.equal(plans[0].date, nextToday);
  assert.equal(plans[0].isBackfilled, false);
  assert.deepEqual(pageErrors, []);
});

test("模型返回陈旧或未知字段错误时安全降级且整批零写入", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server, fixtureWithExistingPlan());
  t.after(() => browser.close());
  await fillTwoValidBatchTasks(page);
  const storageBefore = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const draftBefore = await readBatchDraft(page);
  await page.evaluate(() => {
    window.__originalValidateBatchPlanGroups = window.LearningDataModel.validateBatchPlanGroups;
    window.LearningDataModel.validateBatchPlanGroups = () => ({
      entries: [],
      errors: [{ groupId: "stale-group", taskId: "stale-task", field: "unknown", message: "陈旧错误已安全处理" }],
    });
  });
  try {
    await page.getByRole("button", { name: "统一保存今日计划" }).click();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans"))), storageBefore);
    assert.deepEqual(await readBatchDraft(page), draftBefore);
    assert.match(await page.locator("#batchPlanSaveMessage").textContent(), /尚未保存任何计划/);
    assert.match(await page.locator("#planSummary").textContent(), /今天共有 1 个任务/);
    assert.deepEqual(pageErrors, []);
  } finally {
    await page.evaluate(() => {
      window.LearningDataModel.validateBatchPlanGroups = window.__originalValidateBatchPlanGroups;
      delete window.__originalValidateBatchPlanGroups;
    });
  }
});

test("批量保存后 Single 表单仍可独立新增未来计划和历史补录", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const initialItems = fixture();
  const originalResources = structuredClone(initialItems["personal-learning-system-resources"]);
  const { browser, page, pageErrors } = await openPage(server, initialItems);
  t.after(() => browser.close());
  await fillFourBatchPlans(page);
  await page.getByRole("button", { name: "统一保存今日计划" }).click();
  const batchPlans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  const batchIds = new Set(batchPlans.map((plan) => plan.id));

  await page.getByRole("tab", { name: "单条录入" }).click();
  const tomorrow = getLocalDate(1);
  await page.locator("#planTopic").selectOption("topic-ai");
  await page.locator("#planResource").selectOption("resource-ai");
  await page.locator("#planEntryMode").selectOption("scheduled");
  await page.locator("#planScheduleDate").fill(tomorrow);
  await page.locator("#planTask").fill("未来单条计划");
  await page.locator("#planEstimatedMinutes").fill("40");
  await page.locator("#planPriority").selectOption("高");
  await page.locator("#planForm button[type='submit']").click();

  let plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.deepEqual({
    task: plans[0].task,
    topicId: plans[0].topicId,
    resourceId: plans[0].resourceId,
    date: plans[0].date,
    isBackfilled: plans[0].isBackfilled,
  }, { task: "未来单条计划", topicId: "topic-ai", resourceId: "resource-ai", date: tomorrow, isBackfilled: false });
  assert.equal(await page.locator('[data-plan-view="future"]').getAttribute("aria-selected"), "true");

  const yesterday = getLocalDate(-1);
  await page.locator("#planEntryMode").selectOption("backfill");
  await page.locator("#planTopic").selectOption("topic-ielts");
  await page.locator("#planResource").selectOption("resource-ielts");
  await page.locator("#planScheduleDate").fill(yesterday);
  await page.locator("#planTask").fill("过去历史补录");
  await page.locator("#planPriority").selectOption("低");
  await page.locator("#planForm button[type='submit']").click();

  plans = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-plans")));
  assert.deepEqual({
    task: plans[0].task,
    topicId: plans[0].topicId,
    resourceId: plans[0].resourceId,
    date: plans[0].date,
    isBackfilled: plans[0].isBackfilled,
  }, { task: "过去历史补录", topicId: "topic-ielts", resourceId: "resource-ielts", date: yesterday, isBackfilled: true });
  assert.equal(await page.locator('[data-plan-view="history"]').getAttribute("aria-selected"), "true");
  assert.match(await page.locator("#planList .plan-card").filter({ hasText: "过去历史补录" }).textContent(), /事后补录/);

  const unchangedBatchPlans = plans.filter((plan) => batchIds.has(plan.id));
  assert.deepEqual(unchangedBatchPlans, batchPlans);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-resources"))), originalResources);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-progress-records"))), []);
  assert.deepEqual(pageErrors, []);
});

test("批量今日计划默认折叠更多设置且支持主题、任务和草稿交互", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server);
  t.after(() => browser.close());

  const batchTab = page.getByRole("tab", { name: "批量今日计划" });
  assert.equal(await page.getByRole("tab", { name: "单条录入" }).getAttribute("aria-selected"), "true");
  assert.equal(await page.locator("#planForm").isVisible(), true);
  assert.equal(await page.locator("#batchPlanForm").isVisible(), false);
  await batchTab.click();
  assert.equal(await page.locator("#batchPlanForm").isVisible(), true);
  assert.match(await page.locator("#batchPlanDate").textContent(), new RegExp(`今天的计划日期.*${getToday()}`));
  assert.equal(await page.locator("[data-batch-group]").count(), 1);
  assert.equal(await page.locator("[data-batch-task-row]").count(), 1);
  assert.equal(await page.locator("[data-batch-task-details]").isVisible(), false);
  assert.equal(await page.getByRole("button", { name: "移除主题" }).isDisabled(), true);
  assert.equal(await page.getByRole("button", { name: "移除任务" }).isDisabled(), true);

  const firstGroup = page.locator("[data-batch-group]").first();
  await firstGroup.locator("[data-batch-topic]").selectOption("topic-ai");
  await firstGroup.locator("[data-batch-task]").fill("AI 第一项");
  await firstGroup.getByRole("button", { name: "添加同主题任务" }).click();
  assert.equal(await firstGroup.locator("[data-batch-task-row]").count(), 2);
  await page.getByRole("button", { name: "添加主题" }).click();
  assert.equal(await page.locator("[data-batch-group]").count(), 2);
  const secondGroup = page.locator("[data-batch-group]").nth(1);
  assert.equal(await firstGroup.locator("[data-batch-topic]").inputValue(), "topic-ai");
  assert.equal(await secondGroup.locator("[data-batch-topic] option[value='topic-ai']").getAttribute("disabled"), "");
  await secondGroup.locator("[data-batch-topic]").selectOption("topic-ielts");
  assert.deepEqual(await secondGroup.locator("[data-batch-resource] option").allTextContents(), ["不关联资料", "IELTS 资料"]);

  const firstTask = firstGroup.locator("[data-batch-task-row]").first();
  await firstTask.getByRole("button", { name: "更多设置" }).click();
  await firstTask.locator("[data-batch-resource]").selectOption("resource-ai");
  await firstTask.locator("[data-batch-minutes]").fill("35");
  await firstTask.locator("[data-batch-priority]").selectOption("高");
  await firstTask.getByRole("button", { name: "更多设置" }).click();
  await firstTask.getByRole("button", { name: "更多设置" }).click();
  assert.equal(await firstTask.locator("[data-batch-resource]").inputValue(), "resource-ai");
  assert.equal(await firstTask.locator("[data-batch-minutes]").inputValue(), "35");
  assert.equal(await firstTask.locator("[data-batch-priority]").inputValue(), "高");

  await firstGroup.locator("[data-batch-task-row]").nth(1).getByRole("button", { name: "移除任务" }).click();
  await secondGroup.getByRole("button", { name: "移除主题" }).click();
  assert.equal(await page.locator("[data-batch-group]").count(), 1);
  assert.equal(await firstGroup.locator("[data-batch-task-row]").count(), 1);
  assert.equal(await firstGroup.getByRole("button", { name: "移除任务" }).isDisabled(), true);
  await page.getByRole("tab", { name: "单条录入" }).click();
  await batchTab.click();
  assert.equal(await firstGroup.locator("[data-batch-task]").inputValue(), "AI 第一项");
  assert.deepEqual(pageErrors, []);
});

test("390px 的批量草稿不横向溢出", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { browser, page, pageErrors } = await openPage(server);
  t.after(() => browser.close());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "批量今日计划" }).click();
  const firstGroup = page.locator("[data-batch-group]").first();
  await firstGroup.locator("[data-batch-topic]").selectOption("topic-ai");
  await firstGroup.getByRole("button", { name: "更多设置" }).click();
  await firstGroup.getByRole("button", { name: "添加同主题任务" }).click();
  await page.getByRole("button", { name: "添加主题" }).click();
  await page.locator("[data-batch-group]").nth(1).locator("[data-batch-topic]").selectOption("topic-ielts");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(pageErrors, []);
});
