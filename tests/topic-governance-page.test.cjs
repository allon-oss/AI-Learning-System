const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  test("主题治理页面回归需要 Playwright", { skip: "Playwright 未安装" }, () => {});
}

const workspaceRoot = path.resolve(__dirname, "..");
const browserExecutable = process.env.EDGE_EXE;

function createServer() {
  return http.createServer((request, response) => {
    const requestPath = request.url === "/" ? "/index.html" : request.url;
    const filePath = path.join(workspaceRoot, decodeURIComponent(requestPath));

    if (!filePath.startsWith(workspaceRoot) || !fs.existsSync(filePath)) {
      response.writeHead(404);
      response.end();
      return;
    }

    const contentType = filePath.endsWith(".js") ? "text/javascript" : filePath.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, { "content-type": contentType });
    fs.createReadStream(filePath).pipe(response);
  });
}

function archivedTopicFixture() {
  return {
    "personal-learning-system-topics": [
      { id: "topic-active", name: "活动主题", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: "2026-08-24", updatedAt: "2026-08-24" },
      { id: "topic-archived", name: "归档主题", direction: "AI 学习", parentId: "", description: "", status: "已完成", createdAt: "2026-08-24", updatedAt: "2026-08-24", isArchived: true, archivedAt: "2026-08-24", archiveRootId: "topic-archived" },
    ],
    "personal-learning-system-resources": [],
    "personal-learning-system-plans": [],
    "personal-learning-system-notes": [],
    "personal-learning-system-progress-records": [],
  };
}

function archivedHistoryFixture() {
  const fixture = archivedTopicFixture();
  fixture["personal-learning-system-resources"] = [
    { id: "resource-archived", title: "历史资料", topicId: "topic-archived", type: "文章", status: "学习中", createdAt: "2026-08-24", updatedAt: "2026-08-24" },
  ];
  fixture["personal-learning-system-plans"] = [
    { id: "plan-archived", date: "2026-08-24", topicId: "topic-archived", resourceId: "resource-archived", task: "历史计划", priority: "中", estimatedMinutes: 30, isCompleted: false, createdAt: "2026-08-24T00:00:00.000Z" },
  ];
  fixture["personal-learning-system-notes"] = [
    { id: "note-archived", topicId: "topic-archived", title: "历史笔记", content: "原始内容", resourceId: "resource-archived", planId: "plan-archived", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" },
  ];
  fixture["personal-learning-system-progress-records"] = [
    { id: "progress-archived", date: "2026-08-24", topicId: "topic-archived", resourceId: "resource-archived", planId: "plan-archived", durationMinutes: 30, completionPercent: 50, reflection: "原始总结", createdAt: "2026-08-24T00:00:00.000Z", updatedAt: "2026-08-24T00:00:00.000Z" },
  ];
  return fixture;
}

async function openFixturePage(server, fixture) {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((storage) => {
    Object.entries(storage).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, fixture);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  return { browser, page, pageErrors };
}

if (chromium) {
  test("新增关联表单只提供活动主题", async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    const { browser, page, pageErrors } = await openFixturePage(server, archivedTopicFixture());
    t.after(() => browser.close());

    for (const selector of ["#resourceTopic", "#planTopic", "#noteTopic", "#progressTopic"]) {
      const optionValues = await page.locator(`${selector} option`).evaluateAll((options) => options.map((option) => option.value));
      assert.deepEqual(optionValues, ["topic-active"], `${selector} 不应列出归档主题`);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "390px 宽度不应产生横向滚动");
    assert.deepEqual(pageErrors, [], "页面不应出现 JavaScript 错误");
  });

  test("归档主题的历史关联可查看和编辑，且主题关联保持只读", async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    const { browser, page } = await openFixturePage(server, archivedHistoryFixture());
    t.after(() => browser.close());

    await assertTopicLabelAndReadOnlyEdit(page, "[data-edit-resource]", "#resourceTopic", "#resourceTitle", "更新后的历史资料", "personal-learning-system-resources", "resource-archived");
    await assertTopicLabelAndReadOnlyEdit(page, "[data-edit-note]", "#noteTopic", "#noteTitle", "更新后的历史笔记", "personal-learning-system-notes", "note-archived");
    await assertTopicLabelAndReadOnlyEdit(page, "[data-edit-progress]", "#progressTopic", "#progressReflection", "更新后的历史总结", "personal-learning-system-progress-records", "progress-archived");

    assert.match(await page.locator("#planList").textContent(), /已归档/);
    await page.locator("[data-toggle-plan='plan-archived']").click();
    const plan = await getStoredItem(page, "personal-learning-system-plans", "plan-archived");
    assert.equal(plan.topicId, "topic-archived");
    assert.equal(plan.isCompleted, true);
  });

  test("只有归档主题时不能创建新的关联记录", async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    const fixture = archivedTopicFixture();
    fixture["personal-learning-system-topics"] = fixture["personal-learning-system-topics"].filter((topic) => topic.isArchived);
    const { browser, page } = await openFixturePage(server, fixture);
    t.after(() => browser.close());

    for (const selector of ["#resourceTopic", "#planTopic", "#noteTopic", "#progressTopic"]) {
      assert.equal(await page.locator(selector).isDisabled(), true, `${selector} 应在没有活动主题时禁用`);
      assert.match(await page.locator(selector).textContent(), /创建或恢复/);
    }
    for (const selector of ["#resourceSubmitButton", "#planForm button[type='submit']", "#noteSubmitButton", "#progressSubmitButton"]) {
      assert.equal(await page.locator(selector).isDisabled(), true, `${selector} 应在没有活动主题时禁用`);
    }
  });

  test("主题在新增资料表单打开后归档时，保存会被拒绝", async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => server.close());

    const fixture = archivedTopicFixture();
    fixture["personal-learning-system-topics"] = fixture["personal-learning-system-topics"].filter((topic) => !topic.isArchived);
    const { browser, page } = await openFixturePage(server, fixture);
    t.after(() => browser.close());
    page.on("dialog", (dialog) => dialog.accept());

    await page.locator("#showResourceFormButton").click();
    await page.locator("#resourceTitle").fill("不应保存的资料");
    await page.locator("[data-archive-topic='topic-active']").click();
    assert.equal(await page.locator("#resourceSubmitButton").isDisabled(), true, "归档后应禁止继续保存新增资料");

    const resources = await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-resources")));
    assert.deepEqual(resources, []);
  });
}

async function assertTopicLabelAndReadOnlyEdit(page, editSelector, topicSelector, fieldSelector, value, storageKey, recordId) {
  await page.locator(editSelector).click();
  assert.equal(await page.locator(topicSelector).isDisabled(), true, `${topicSelector} 应锁定原主题关联`);
  assert.match(await page.locator(topicSelector).textContent(), /已归档/);
  await page.locator(fieldSelector).fill(value);
  await page.locator(`${topicSelector}`).evaluate((select) => select.form.requestSubmit());
  const record = await getStoredItem(page, storageKey, recordId);
  assert.equal(record.topicId, "topic-archived");
  assert.equal(record.title || record.reflection, value);
}

async function getStoredItem(page, storageKey, recordId) {
  return page.evaluate(({ storageKey: key, id }) => JSON.parse(localStorage.getItem(key)).find((item) => item.id === id), { storageKey, id: recordId });
}
