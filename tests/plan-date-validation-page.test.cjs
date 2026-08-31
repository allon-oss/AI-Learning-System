const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { chromium } = require("playwright");

const workspaceRoot = path.resolve(__dirname, "..");
const browserExecutable = process.env.EDGE_EXE;
const planStorageKey = "personal-learning-system-plans";
const progressStorageKey = "personal-learning-system-progress-records";

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

function getLocalDate(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fixture() {
  const today = getLocalDate();
  return {
    "personal-learning-system-topics": [
      { id: "topic-ai", name: "AI 基础", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-resources": [],
    [planStorageKey]: [],
    "personal-learning-system-notes": [],
    "personal-learning-system-progress-records": [],
  };
}

async function openFixturePage(server, { clockTime } = {}) {
  const browser = await chromium.launch({ executablePath: browserExecutable, headless: true });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const pageErrors = [];

  page.on("pageerror", (error) => pageErrors.push(error.message));
  if (clockTime) {
    await page.clock.install({ time: clockTime });
  }
  await page.addInitScript((items) => {
    Object.entries(items).forEach(([key, value]) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, JSON.stringify(value));
      }
    });
  }, fixture());
  await page.goto(`http://127.0.0.1:${server.address().port}`);

  return { browser, page, pageErrors };
}

async function readPlans(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), planStorageKey);
}

async function readProgressRecords(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), progressStorageKey);
}

test("普通计划手动输入过去日期会立即阻止保存，今天和未来仍可保存", async (t) => {
  const today = getLocalDate();
  const yesterday = getLocalDate(-1);
  const tomorrow = getLocalDate(1);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server);
  t.after(() => browser.close());

  assert.equal(await page.getByLabel("计划日期", { exact: true }).count(), 1);
  await page.locator("#planTask").fill("验证计划日期");
  await page.locator("#planScheduleDate").fill(yesterday);

  const dateError = await page.locator("#planDateError").textContent();
  assert.match(dateError, /今天或未来/);
  assert.match(dateError, /历史补录/);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).count(), 1);
  assert.equal(await page.locator("#planScheduleDate").getAttribute("aria-invalid"), "true");
  assert.equal(await page.locator("#planForm button[type='submit']").isDisabled(), true);
  assert.deepEqual(await readPlans(page), []);

  await page.locator("#planScheduleDate").fill(today);

  assert.equal(await page.locator("#planDateError").textContent(), "");
  assert.equal(await page.locator("#planScheduleDate").getAttribute("aria-invalid"), "false");
  assert.equal(await page.locator("#planForm button[type='submit']").isDisabled(), false);

  await page.locator("#planForm button[type='submit']").click();
  const plans = await readPlans(page);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].date, today);
  assert.equal(plans[0].task, "验证计划日期");
  assert.equal(plans[0].isBackfilled, false);

  await page.locator("#planTask").fill("验证未来计划");
  await page.locator("#planScheduleDate").fill(tomorrow);
  assert.equal(await page.locator("#planDateError").textContent(), "");
  assert.equal(await page.locator("#planForm button[type='submit']").isDisabled(), false);
  await page.locator("#planForm button[type='submit']").click();

  const plansWithFuture = await readPlans(page);
  assert.equal(plansWithFuture.length, 2);
  assert.equal(plansWithFuture[0].date, tomorrow);
  assert.equal(plansWithFuture[0].task, "验证未来计划");
  assert.equal(plansWithFuture[0].isBackfilled, false);
  assert.deepEqual(pageErrors, []);
});

test("历史补录只接受过去日期并在历史视图显示事后补录标记", async (t) => {
  const today = getLocalDate();
  const yesterday = getLocalDate(-1);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server);
  t.after(() => browser.close());

  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  assert.equal(await page.getByLabel("计划日期", { exact: true }).inputValue(), yesterday);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("max"), yesterday);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("min"), null);

  await page.getByLabel("计划日期", { exact: true }).fill(today);
  assert.match(await page.locator("#planDateError").textContent(), /只能选择过去日期/);
  assert.equal(await page.locator("#planForm button[type='submit']").isDisabled(), true);

  await page.getByLabel("记录方式", { exact: true }).selectOption("scheduled");
  assert.equal(await page.getByLabel("计划日期", { exact: true }).inputValue(), today);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("min"), today);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("max"), null);
  assert.equal(await page.locator("#planDateError").textContent(), "");

  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  await page.getByLabel("计划日期", { exact: true }).fill(yesterday);
  await page.locator("#planTask").fill("验证历史补录");
  assert.equal(await page.locator("#planDateError").textContent(), "");
  await page.locator("#planForm button[type='submit']").click();

  const plans = await readPlans(page);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].date, yesterday);
  assert.equal(plans[0].isBackfilled, true);
  assert.equal(plans[0].isCompleted, false);
  assert.equal(await page.locator('[data-plan-view="history"]').getAttribute("aria-selected"), "true");

  const planCard = page.locator(".plan-card").filter({ hasText: "验证历史补录" });
  assert.match(await planCard.textContent(), /事后补录/);
  assert.doesNotMatch(await planCard.textContent(), /已逾期/);
  assert.equal(await page.getByLabel("记录方式", { exact: true }).inputValue(), "scheduled");
  assert.equal(await page.getByLabel("计划日期", { exact: true }).inputValue(), today);
  assert.deepEqual(pageErrors, []);
});

test("补录更早日期的 100% 进度可以关联补录计划且不会改写计划日期或完成状态", async (t) => {
  const historicalDate = getLocalDate(-7);
  const tomorrow = getLocalDate(1);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server);
  t.after(() => browser.close());

  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  await page.getByLabel("计划日期", { exact: true }).fill(historicalDate);
  await page.locator("#planTask").fill("更早日期学习 Codex");
  await page.locator("#planForm button[type='submit']").click();
  const originalPlan = (await readPlans(page))[0];

  await page.locator("#progressDate").fill(historicalDate);
  await page.locator("#progressDate").dispatchEvent("change");
  await page.locator("#progressTopic").selectOption("topic-ai");
  await page.locator("#progressPlan").selectOption(originalPlan.id);
  await page.locator("#progressDuration").fill("40");
  await page.locator("#progressCompletion").fill("100");
  await page.locator("#progressReflection").fill("补录更早日期实际完成的 Codex 学习。");
  await page.locator("#progressSubmitButton").click();

  const progressRecords = await readProgressRecords(page);
  assert.equal(progressRecords.length, 1);
  assert.equal(progressRecords[0].date, historicalDate);
  assert.equal(progressRecords[0].topicId, "topic-ai");
  assert.equal(progressRecords[0].planId, originalPlan.id);
  assert.deepEqual((await readPlans(page))[0], originalPlan);

  await page.reload();
  assert.equal((await readProgressRecords(page))[0].date, historicalDate);
  assert.deepEqual((await readPlans(page))[0], originalPlan);

  await page.locator("#progressDate").fill(tomorrow);
  assert.equal(await page.locator("#progressDate").evaluate((input) => input.validity.rangeOverflow), true);
  await page.locator("#progressDuration").fill("10");
  await page.locator("#progressCompletion").fill("10");
  await page.locator("#progressSubmitButton").click();
  assert.equal((await readProgressRecords(page)).length, 1);
  assert.deepEqual((await readPlans(page))[0], originalPlan);
  assert.deepEqual(pageErrors, []);
});

test("页面跨过本地午夜后会刷新计划和进度的日期边界", async (t) => {
  const initialToday = "2026-08-30";
  const initialYesterday = "2026-08-29";
  const nextToday = "2026-08-31";
  const nextYesterday = "2026-08-30";
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server, {
    clockTime: new Date(2026, 7, 30, 23, 59, 0),
  });
  t.after(() => browser.close());

  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("max"), initialYesterday);
  assert.equal(await page.locator("#progressDate").getAttribute("max"), initialToday);

  await page.clock.setSystemTime(new Date(2026, 7, 31, 0, 1, 0));
  await page.getByLabel("计划日期", { exact: true }).focus();
  assert.equal(await page.getByLabel("计划日期", { exact: true }).getAttribute("max"), nextYesterday);
  await page.getByLabel("计划日期", { exact: true }).fill(nextYesterday);
  assert.equal(await page.getByLabel("计划日期", { exact: true }).evaluate((input) => input.validity.valid), true);

  await page.locator("#progressDate").focus();
  assert.equal(await page.locator("#progressDate").getAttribute("max"), nextToday);
  await page.locator("#progressDate").fill(nextToday);
  assert.equal(await page.locator("#progressDate").evaluate((input) => input.validity.valid), true);
  assert.deepEqual(pageErrors, []);
});

test("390px 宽度下历史补录控件、提示和标记不产生横向溢出", async (t) => {
  const today = getLocalDate();
  const yesterday = getLocalDate(-1);
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { browser, page, pageErrors } = await openFixturePage(server);
  t.after(() => browser.close());

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  await page.locator("#planTask").fill("窄屏历史补录");
  await page.locator("#planForm button[type='submit']").click();

  assert.match(await page.locator(".plan-card").filter({ hasText: "窄屏历史补录" }).textContent(), /事后补录/);

  await page.getByLabel("记录方式", { exact: true }).selectOption("backfill");
  await page.locator("#planScheduleDate").fill(today);

  assert.match(await page.locator("#planDateError").textContent(), /只能选择过去日期/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  assert.deepEqual(pageErrors, []);
});
