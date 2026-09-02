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

function offsetDate(value, days) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function multiTopicFixture({ progress = [] } = {}) {
  const today = getLocalToday();
  return {
    "personal-learning-system-topics": [
      { id: "topic-codex", name: "Codex 实践", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
      { id: "topic-words", name: "词汇", direction: "雅思英语学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-directions": ["AI 学习", "雅思英语学习"],
    "personal-learning-system-resources": [],
    "personal-learning-system-plans": [
      { id: "plan-codex", date: today, topicId: "topic-codex", resourceId: null, task: "练习 Codex", priority: "中", estimatedMinutes: 40, isCompleted: false, isBackfilled: false, createdAt: `${today}T00:00:00.000Z` },
      { id: "plan-words", date: today, topicId: "topic-words", resourceId: null, task: "背单词", priority: "中", estimatedMinutes: 25, isCompleted: false, isBackfilled: false, createdAt: `${today}T00:00:00.000Z` },
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

async function waitForControlledDraftSettlement(page) {
  await page.waitForFunction(() => window.__oldProgressDraftSettled === true);
  await page.evaluate(() => new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = resolve;
    channel.port2.postMessage(null);
  }));
}

async function generateTwoDrafts(page) {
  await page.locator("#aiProgressDescription").fill("今天 Codex 学了40分钟，背了40个单词。");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 2 条，待处理 2 条").waitFor();
}

function controlledDraftResult(reflection = "过期草稿") {
  return {
    drafts: [{
      sourceText: reflection,
      suggestedDirection: "AI 学习",
      draft: {
        date: getLocalToday(), topicId: "topic-transformer", resourceId: null, planId: null,
        durationMinutes: 45, completionPercent: 70, reflection,
      },
      missingFields: ["resourceId", "planId"], warnings: [],
    }],
    warnings: [],
  };
}

test("多主题描述生成有序队列并在切换时保留各自修改", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);

  const cards = page.locator("[data-progress-draft-id]");
  assert.equal(await cards.count(), 2);
  assert.match(await cards.nth(0).textContent(), /Codex/);
  assert.match(await cards.nth(1).textContent(), /单词/);

  await page.locator("#progressCompletion").fill("70");
  await cards.nth(1).getByRole("button").click();
  await page.locator("#progressDuration").fill("25");
  await page.locator("#progressCompletion").fill("80");
  await cards.nth(0).getByRole("button").click();
  assert.equal(await page.locator("#progressDuration").inputValue(), "40");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "70");
  assert.deepEqual(pageErrors, []);
});

test("保存第一条只新增一条记录并完整保留第二条草稿", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.locator("#progressCompletion").fill("70");
  const secondBefore = await page.locator("[data-progress-draft-id]").nth(1).textContent();
  await page.getByRole("button", { name: "确认并保存此条" }).click();

  const saved = await getStoredProgress(page);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].topicId, "topic-codex");
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 1);
  assert.equal(await page.locator("[data-progress-draft-id]").nth(0).textContent(), secondBefore);
  assert.equal(await page.locator("#progressTopic").inputValue(), "topic-words");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "");
  assert.deepEqual(pageErrors, []);
});

test("当前草稿必填项缺失或主题失效时保留整个队列", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);

  await page.getByRole("button", { name: "确认并保存此条" }).click();
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);
  assert.deepEqual(await getStoredProgress(page), []);

  await page.locator("#progressCompletion").fill("70");
  await page.evaluate(() => {
    topics = topics.map((topic) => topic.id === "topic-codex" ? { ...topic, isArchived: true } : topic);
  });
  await page.getByRole("button", { name: "确认并保存此条" }).click();
  assert.match(await page.locator("#progressSaveMessage").textContent(), /主题已归档或不存在/);
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("存储写入失败时记录、队列顺序和当前表单都保持不变", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.locator("#progressCompletion").fill("70");
  const cardsBefore = await page.locator("[data-progress-draft-id]").allTextContents();
  const activeIdBefore = await page.locator("[data-progress-draft-id].is-active").getAttribute("data-progress-draft-id");
  await page.evaluate((key) => {
    window.__originalStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(storageKey, value) {
      if (storageKey === key) throw new Error("storage unavailable");
      return window.__originalStorageSetItem.call(this, storageKey, value);
    };
  }, progressStorageKey);

  await page.getByRole("button", { name: "确认并保存此条" }).click();
  assert.match(await page.locator("#progressSaveMessage").textContent(), /进度保存失败/);
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(await page.locator("[data-progress-draft-id]").allTextContents(), cardsBefore);
  assert.equal(await page.locator("#progressDuration").inputValue(), "40");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "70");
  assert.equal(await page.locator("[data-progress-draft-id].is-active").getAttribute("data-progress-draft-id"), activeIdBefore);
  await page.evaluate(() => { Storage.prototype.setItem = window.__originalStorageSetItem; });
  assert.deepEqual(pageErrors, []);
});

test("双击确认按钮只保存当前一条记录", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.locator("#progressCompletion").fill("70");
  await page.getByRole("button", { name: "确认并保存此条" }).dblclick();
  await page.waitForTimeout(400);
  assert.equal((await getStoredProgress(page)).length, 1);
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 1);
  assert.deepEqual(pageErrors, []);
});

test("放弃当前草稿必须确认且不会写入进度存储", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#discardProgressDraftButton").click();
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discardProgressDraftButton").click();
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 1);
  assert.equal(await page.locator("#progressTopic").inputValue(), "topic-words");
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("重新生成取消或失败时保留旧队列和当前修改，成功时才替换", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.locator("#progressCompletion").fill("70");
  const oldCards = await page.locator("[data-progress-draft-id]").allTextContents();
  await page.evaluate(() => {
    window.__generateCalls = 0;
    const original = window.AIService.generateProgressDrafts;
    window.__originalGenerateProgressDrafts = original;
    window.AIService.generateProgressDrafts = async (...args) => {
      window.__generateCalls += 1;
      return original(...args);
    };
  });

  page.once("dialog", (dialog) => dialog.dismiss());
  await page.locator("#generateProgressDraftButton").click();
  assert.equal(await page.evaluate(() => window.__generateCalls), 0);
  assert.deepEqual(await page.locator("[data-progress-draft-id]").allTextContents(), oldCards);

  await page.evaluate(() => {
    window.AIService.generateProgressDrafts = async () => { throw new Error("provider failed"); };
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("草稿生成失败，请重试或手动填写。").waitFor();
  assert.deepEqual(await page.locator("[data-progress-draft-id]").allTextContents(), oldCards);
  assert.equal(await page.locator("#progressCompletion").inputValue(), "70");

  await page.evaluate(() => { window.AIService.generateProgressDrafts = window.__originalGenerateProgressDrafts; });
  await page.locator("#aiProgressDescription").fill("今天 Codex 学了20分钟。");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 1 条，待处理 1 条").waitFor();
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 1);
  assert.equal(await page.locator("#progressDuration").inputValue(), "20");
  assert.deepEqual(pageErrors, []);
});

test("编辑已有进度时暂存队列并在保存后恢复同一当前草稿", async (t) => {
  const today = getLocalToday();
  const existing = {
    id: "progress-existing", date: today, topicId: "topic-codex", resourceId: null, planId: "plan-codex",
    durationMinutes: 30, completionPercent: 50, reflection: "原记录",
    createdAt: `${today}T00:00:00.000Z`, updatedAt: `${today}T00:00:00.000Z`,
  };
  const { page, pageErrors } = await startPage(t, multiTopicFixture({ progress: [existing] }));
  await generateTwoDrafts(page);
  const cards = page.locator("[data-progress-draft-id]");
  await page.locator("#progressCompletion").fill("70");
  await cards.nth(1).getByRole("button").click();
  await page.locator("#progressDuration").fill("25");
  await page.locator("#progressCompletion").fill("80");
  const activeId = await page.locator("[data-progress-draft-id].is-active").getAttribute("data-progress-draft-id");

  await page.locator("[data-edit-progress='progress-existing']").click();
  assert.equal(await page.locator("#aiProgressPanel").isVisible(), false);
  await page.locator("#progressReflection").fill("已更新记录");
  await page.locator("#progressSubmitButton").click();

  assert.equal(await page.locator("#aiProgressPanel").isVisible(), true);
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);
  assert.equal(await page.locator("[data-progress-draft-id].is-active").getAttribute("data-progress-draft-id"), activeId);
  assert.equal(await page.locator("#progressDuration").inputValue(), "25");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "80");
  const saved = await getStoredProgress(page);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].reflection, "已更新记录");

  await page.locator("[data-edit-progress='progress-existing']").click();
  await page.locator("#progressReflection").fill("取消这次修改");
  await page.locator("#cancelProgressEditButton").click();
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);
  assert.equal(await page.locator("[data-progress-draft-id].is-active").getAttribute("data-progress-draft-id"), activeId);
  assert.equal(await page.locator("#progressDuration").inputValue(), "25");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "80");
  assert.deepEqual(pageErrors, []);
});

test("删除资料或计划后只清理对应队列草稿的关联", async (t) => {
  const storage = multiTopicFixture();
  const today = getLocalToday();
  storage["personal-learning-system-resources"] = [
    { id: "resource-codex", title: "Codex 文档", topicId: "topic-codex", type: "文档", status: "学习中", createdAt: today, updatedAt: today },
    { id: "resource-words", title: "词汇卡片", topicId: "topic-words", type: "卡片", status: "学习中", createdAt: today, updatedAt: today },
  ];
  const { page, pageErrors } = await startPage(t, storage);
  await page.locator("#aiProgressDescription").fill("今天 Codex 学了40分钟，使用 Codex 文档；背了40个单词，使用词汇卡片。");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 2 条，待处理 2 条").waitFor();
  const cards = page.locator("[data-progress-draft-id]");
  assert.equal(await page.locator("#progressResource").inputValue(), "resource-codex");
  assert.equal(await page.locator("#progressPlan").inputValue(), "plan-codex");

  await page.evaluate(() => { resources = resources.filter((item) => item.id !== "resource-codex"); });
  await cards.nth(1).getByRole("button").click();
  assert.equal(await page.locator("#progressResource").inputValue(), "resource-words");
  await cards.nth(0).getByRole("button").click();
  assert.equal(await page.locator("#progressResource").inputValue(), "");
  assert.equal(await page.locator("#progressPlan").inputValue(), "plan-codex");

  await page.evaluate(() => { plans = plans.filter((item) => item.id !== "plan-words"); });
  await cards.nth(1).getByRole("button").click();
  assert.equal(await page.locator("#progressResource").inputValue(), "resource-words");
  assert.equal(await page.locator("#progressPlan").inputValue(), "");
  await cards.nth(0).getByRole("button").click();
  assert.equal(await page.locator("#progressPlan").inputValue(), "plan-codex");
  assert.deepEqual(pageErrors, []);
});

test("跨午夜后旧草稿保留原日期且新生成草稿使用新日期", async (t) => {
  const today = getLocalToday();
  const tomorrow = offsetDate(today, 1);
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.evaluate((nextDate) => { getToday = () => nextDate; }, tomorrow);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

  assert.equal(await page.locator("#progressDate").inputValue(), today);
  await page.locator("#progressCompletion").fill("70");
  await page.getByRole("button", { name: "确认并保存此条" }).click();
  assert.equal((await getStoredProgress(page))[0].date, today);

  await page.locator("#aiProgressDescription").fill("今天 Codex 学了20分钟。");
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 1 条，待处理 1 条").waitFor();
  assert.equal(await page.locator("#progressDate").inputValue(), tomorrow);
  assert.deepEqual(pageErrors, []);
});

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
  const warnings = await page.locator("#aiProgressWarnings").textContent();
  assert.match(warnings, /还需补充：学习主题、学习时长、完成度。/);
  assert.match(warnings, /可选关联：关联资料、关联计划。/);
  assert.deepEqual(await getStoredProgress(page), []);

  await page.locator("#progressSubmitButton").click();
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
    window.AIService.generateProgressDrafts = async () => {
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
  page.once("dialog", (dialog) => dialog.accept());
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

test("编辑已有进度会使尚未完成的生成请求失效", async (t) => {
  const today = getLocalToday();
  const existing = { id: "progress-existing", date: today, topicId: "topic-transformer", resourceId: "resource-attention-video", planId: "plan-chapter-2", durationMinutes: 30, completionPercent: 50, reflection: "原始总结", createdAt: `${today}T00:00:00.000Z`, updatedAt: `${today}T00:00:00.000Z` };
  const { page, pageErrors } = await startPage(t, fixture({ progress: [existing] }));

  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.evaluate(() => {
    window.__oldProgressDraftSettled = false;
    const oldRequest = new Promise((resolve) => {
      window.__resolveProgressDraft = resolve;
    });
    window.AIService.generateProgressDrafts = () => oldRequest.finally(() => {
      window.__oldProgressDraftSettled = true;
    });
  });
  await page.locator("#generateProgressDraftButton").click();
  await page.locator("[data-edit-progress='progress-existing']").click();
  await page.evaluate((result) => window.__resolveProgressDraft(result), controlledDraftResult());
  await waitForControlledDraftSettlement(page);

  assert.equal(await page.locator("#aiProgressPanel").isVisible(), false);
  assert.equal(await page.locator("#progressSubmitButton").textContent(), "保存修改");
  assert.equal(await page.locator("#progressDuration").inputValue(), "30");
  assert.equal(await page.locator("#progressReflection").inputValue(), "原始总结");
  assert.deepEqual(await getStoredProgress(page), [existing]);
  assert.deepEqual(pageErrors, []);
});

test("放弃草稿会使尚未完成的重新生成请求失效", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());

  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();
  await page.evaluate(() => {
    window.__oldProgressDraftSettled = false;
    const oldRequest = new Promise((resolve) => {
      window.__resolveProgressDraft = resolve;
    });
    window.AIService.generateProgressDrafts = () => oldRequest.finally(() => {
      window.__oldProgressDraftSettled = true;
    });
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#generateProgressDraftButton").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discardProgressDraftButton").click();
  await page.evaluate((result) => window.__resolveProgressDraft(result), controlledDraftResult());
  await waitForControlledDraftSettlement(page);

  assert.equal(await page.locator("#aiProgressDescription").inputValue(), "");
  assert.equal(await page.locator("#discardProgressDraftButton").isVisible(), false);
  assert.equal(await page.locator("#progressSubmitButton").textContent(), "保存进度");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("放弃草稿后旧请求拒绝不会显示错误或重新激活草稿", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());

  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByRole("button", { name: "确认并保存" }).waitFor();
  await page.evaluate(() => {
    window.__oldProgressDraftSettled = false;
    const oldRequest = new Promise((resolve, reject) => {
      window.__rejectProgressDraft = reject;
    });
    window.AIService.generateProgressDrafts = () => oldRequest.finally(() => {
      window.__oldProgressDraftSettled = true;
    });
  });
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#generateProgressDraftButton").click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator("#discardProgressDraftButton").click();
  await page.evaluate(() => window.__rejectProgressDraft(new Error("stale request failed")));
  await waitForControlledDraftSettlement(page);

  assert.equal(await page.locator("#aiProgressDescription").inputValue(), "");
  assert.equal(await page.locator("#aiProgressStatus").textContent(), "");
  assert.equal(await page.locator("#aiProgressStatus").evaluate((status) => status.classList.contains("is-error")), false);
  assert.equal(await page.locator("#discardProgressDraftButton").isVisible(), false);
  assert.equal(await page.locator("#progressSubmitButton").textContent(), "保存进度");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.deepEqual(await getStoredProgress(page), []);
  assert.deepEqual(pageErrors, []);
});

test("生成期间禁用按钮以避免重复调用", async (t) => {
  const { page, pageErrors } = await startPage(t, fixture());
  await page.locator("#aiProgressDescription").fill("今天学习 Transformer 入门 45 分钟，完成 70%");
  await page.evaluate(() => {
    window.__progressDraftCalls = 0;
    window.__oldProgressDraftSettled = false;
    const oldRequest = new Promise((resolve) => {
      window.__progressDraftCalls += 1;
      window.__resolveProgressDraft = resolve;
    });
    window.AIService.generateProgressDrafts = () => oldRequest.finally(() => {
      window.__oldProgressDraftSettled = true;
    });
  });

  await page.locator("#generateProgressDraftButton").evaluate((button) => {
    button.click();
    button.click();
  });
  assert.equal(await page.locator("#generateProgressDraftButton").isDisabled(), true);
  assert.equal(await page.evaluate(() => window.__progressDraftCalls), 1);
  await page.evaluate(
    (result) => window.__resolveProgressDraft(result),
    controlledDraftResult("今天学习 Transformer 入门 45 分钟，完成 70%"),
  );
  await waitForControlledDraftSettlement(page);
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
