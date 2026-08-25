const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

const workspaceRoot = path.resolve(__dirname, "..");
const browserExecutable = process.env.EDGE_EXE;
const progressStorageKey = "personal-learning-system-progress-records";

function getLocalToday() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

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

function fixture({ progress = [] } = {}) {
  const today = getLocalToday();
  return {
    "personal-learning-system-topics": [
      { id: "topic-transformer", name: "Transformer 入门", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-resources": [
      { id: "resource-attention-video", title: "注意力机制视频", topicId: "topic-transformer", type: "视频", status: "学习中", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-plans": [
      { id: "plan-chapter-2", date: today, topicId: "topic-transformer", resourceId: "resource-attention-video", task: "看完第二章", priority: "中", estimatedMinutes: 45, isCompleted: false, createdAt: `${today}T00:00:00.000Z` },
    ],
    "personal-learning-system-notes": [],
    [progressStorageKey]: progress,
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

async function startPage(t, storage) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const opened = await openFixturePage(server, storage);
  t.after(() => opened.browser.close());
  return opened;
}

async function getStoredProgress(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), progressStorageKey);
}

test("生成的 AI 草稿保持可编辑，确认后才按修改值保存", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());

  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，使用注意力机制视频，完成今天的看完第二章计划 70%，还需要继续理解多头注意力。");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();

  assert.equal(await page.locator("#progressTopic").inputValue(), "topic-transformer");
  assert.equal(await page.locator("#progressResource").inputValue(), "resource-attention-video");
  assert.equal(await page.locator("#progressPlan").inputValue(), "plan-chapter-2");
  assert.equal(await page.locator("#progressDuration").inputValue(), "45");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "70");
  assert.deepEqual(await getStoredProgress(page), []);

  await page.locator("#progressCompletion").fill("75");
  await page.locator("#progressSubmitButton").click();
  const saved = await getStoredProgress(page);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].completionPercent, 75);
  assert.equal(Object.hasOwn(saved[0], "learningContent"), false);
  assert.deepEqual(pageErrors, []);
});

test("缺少匹配结果不会自动保存，用户补齐后仍可使用既有保存逻辑", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());

  await page.locator("#aiProgressDescription").fill("今天学习了不存在主题");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();

  assert.equal(await page.locator("#progressTopic").inputValue(), "");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "");
  assert.match(await page.locator("#aiProgressWarnings").textContent(), /无法匹配|补充/);
  assert.deepEqual(await getStoredProgress(page), []);

  await page.locator("#progressTopic").selectOption("topic-transformer");
  await page.locator("#progressDuration").fill("30");
  await page.locator("#progressCompletion").fill("50");
  await page.locator("#progressSubmitButton").click();
  assert.equal((await getStoredProgress(page)).length, 1);
  assert.deepEqual(pageErrors, []);
});

test("草稿生成失败会保留自由描述和已手动填写的表单，且不会写入记录", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());
  const description = "今天学习 Transformer 入门";

  await page.locator("#progressDuration").fill("20");
  await page.locator("#progressCompletion").fill("40");
  await page.locator("#aiProgressDescription").fill(description);
  await page.evaluate(() => {
    window.AIService.generateProgressDraft = async () => {
      throw new Error("provider failed");
    };
  });
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("草稿生成失败，请重试或手动填写。").waitFor();

  assert.equal(await page.locator("#aiProgressDescription").inputValue(), description);
  assert.equal(await page.locator("#progressDuration").inputValue(), "20");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "40");
  assert.match(await page.locator("#aiProgressStatus").textContent(), /草稿生成失败/);
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("放弃草稿会清空草稿界面和表单，但不产生进度记录", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());

  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();
  await page.locator("#discardProgressDraftButton").click();

  assert.equal(await page.locator("#aiProgressDescription").inputValue(), "");
  assert.equal(await page.locator("#aiProgressStatus").textContent(), "");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.equal(await page.locator("#progressSubmitButton").textContent(), "保存进度");
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("编辑已有进度时隐藏 AI 面板，保存仍只更新原记录", async (t) => {
  const today = getLocalToday();
  const existing = { id: "progress-existing", date: today, topicId: "topic-transformer", resourceId: "resource-attention-video", planId: "plan-chapter-2", durationMinutes: 30, completionPercent: 50, reflection: "原始总结", createdAt: `${today}T00:00:00.000Z`, updatedAt: `${today}T00:00:00.000Z` };
  const { page, pageErrors } = await startPage(t, fixture({ progress: [existing] }));

  await page.locator("[data-edit-progress='progress-existing']").click();
  assert.equal(await page.locator("#aiProgressPanel").isVisible(), false);
  await page.locator("#progressReflection").fill("更新后的总结");
  await page.locator("#progressSubmitButton").click();

  const saved = await getStoredProgress(page);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].reflection, "更新后的总结");
  assert.equal(Object.hasOwn(saved[0], "learningContent"), false);
  assert.deepEqual(pageErrors, []);
});

test("生成期间禁用按钮以避免重复调用", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());
  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.evaluate(() => {
    window.__progressDraftCalls = 0;
    window.AIService.generateProgressDraft = () => new Promise((resolve) => {
      window.__progressDraftCalls += 1;
      window.__resolveProgressDraft = resolve;
    });
  });

  await page.locator("#generateProgressDraftButton").evaluate((button) => {
    button.click();
    button.click();
  });
  assert.equal(await page.locator("#generateProgressDraftButton").isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__progressDraftCalls), 1);
  await page.evaluate(() => window.__resolveProgressDraft({
    draft: { date: new Date().toISOString().slice(0, 10), topicId: "topic-transformer", resourceId: null, planId: null, durationMinutes: 45, completionPercent: 70, reflection: "今天学习 Transformer 入门 45 分钟，完成 70%" },
    missingFields: ["resourceId", "planId"],
    warnings: [],
  }));
  await page.getByRole("button", { name: "确认并保存" }).waitFor();

  assert.deepEqual(pageErrors, []);
});

test("390px 宽度下完整 AI 草稿流程不产生横向溢出", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();

  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(pageErrors, []);
});
