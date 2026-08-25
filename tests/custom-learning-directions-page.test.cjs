const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

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

    response.writeHead(200, {
      "content-type": filePath.endsWith(".js") ? "text/javascript" : filePath.endsWith(".css") ? "text/css" : "text/html",
    });
    fs.createReadStream(filePath).pipe(response);
  });
}

function fixture() {
  return {
    "personal-learning-system-topics": [
      { id: "topic-ai", name: "AI 基础", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: "2026-08-25", updatedAt: "2026-08-25" },
    ],
    "personal-learning-system-resources": [{ id: "resource-ai", title: "AI 资料", topicId: "topic-ai", type: "文章", status: "学习中", createdAt: "2026-08-25", updatedAt: "2026-08-25" }],
    "personal-learning-system-plans": [{ id: "plan-ai", date: "2026-08-25", topicId: "topic-ai", resourceId: "resource-ai", task: "学习 AI", priority: "中", estimatedMinutes: 30, isCompleted: false, createdAt: "2026-08-25T00:00:00.000Z" }],
    "personal-learning-system-notes": [{ id: "note-ai", topicId: "topic-ai", title: "AI 笔记", content: "内容", resourceId: "resource-ai", planId: "plan-ai", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }],
    "personal-learning-system-progress-records": [{ id: "progress-ai", date: "2026-08-25", topicId: "topic-ai", resourceId: "resource-ai", planId: "plan-ai", durationMinutes: 30, completionPercent: 50, reflection: "总结", createdAt: "2026-08-25T00:00:00.000Z", updatedAt: "2026-08-25T00:00:00.000Z" }],
  };
}

async function openFixturePage(server, storage) {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript((items) => {
    Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }, storage);
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  return { browser, page, pageErrors };
}

test("新增自定义学习方向后自动选中并在刷新后保留", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const storage = fixture();
  const { browser, page, pageErrors } = await openFixturePage(server, storage);
  t.after(() => browser.close());

  await page.locator("#showFormButton").click();
  await page.locator("#showAddDirectionButton").click();
  await page.locator("#newDirectionName").fill(" 摄影学习 ");
  await page.locator("#saveDirectionButton").click();

  assert.equal(await page.locator("#topicDirection").inputValue(), "摄影学习");
  assert.deepEqual(await page.locator("#topicDirection option").allTextContents(), ["AI 学习", "雅思英语学习", "摄影学习"]);
  assert.match(await page.locator("#addDirectionMessage").textContent(), /已新增学习方向/);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("personal-learning-system-directions"))), [
    "AI 学习",
    "雅思英语学习",
    "摄影学习",
  ]);

  await page.reload();
  await page.locator("#showFormButton").click();
  assert.deepEqual(await page.locator("#topicDirection option").allTextContents(), ["AI 学习", "雅思英语学习", "摄影学习"]);
  await page.locator("#topicDirection").selectOption("摄影学习");
  assert.equal(await page.locator("#topicParent option").count(), 1);
  assert.deepEqual(await page.evaluate(() => ({
    topics: JSON.parse(localStorage.getItem("personal-learning-system-topics")),
    resources: JSON.parse(localStorage.getItem("personal-learning-system-resources")),
    plans: JSON.parse(localStorage.getItem("personal-learning-system-plans")),
    notes: JSON.parse(localStorage.getItem("personal-learning-system-notes")),
    progress: JSON.parse(localStorage.getItem("personal-learning-system-progress-records")),
  })), {
    topics: storage["personal-learning-system-topics"],
    resources: storage["personal-learning-system-resources"],
    plans: storage["personal-learning-system-plans"],
    notes: storage["personal-learning-system-notes"],
    progress: storage["personal-learning-system-progress-records"],
  });
  assert.deepEqual(pageErrors, []);
});

test("空白和重复方向被拒绝，编辑主题时不能新增方向", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server, fixture());
  t.after(() => browser.close());

  await page.locator("#showFormButton").click();
  await page.locator("#showAddDirectionButton").click();
  await page.locator("#saveDirectionButton").click();
  assert.match(await page.locator("#addDirectionMessage").textContent(), /请输入学习方向名称/);

  await page.locator("#newDirectionName").fill(" AI 学习 ");
  await page.locator("#saveDirectionButton").click();
  assert.match(await page.locator("#addDirectionMessage").textContent(), /已存在/);
  assert.equal(await page.locator("#newDirectionName").inputValue(), " AI 学习 ");
  assert.equal(await page.evaluate(() => localStorage.getItem("personal-learning-system-directions")), null);

  await page.locator("#cancelFormButton").click();
  await page.locator("[data-edit-topic='topic-ai']").click();
  assert.equal(await page.locator("#topicDirection").isDisabled(), true);
  assert.equal(await page.locator("#showAddDirectionButton").isVisible(), false);
  assert.deepEqual(pageErrors, []);
});

test("390px 宽度下新增方向控件不产生横向滚动", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server, fixture());
  t.after(() => browser.close());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#showFormButton").click();
  await page.locator("#showAddDirectionButton").click();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(pageErrors, []);
});
