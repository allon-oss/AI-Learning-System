const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const prefix = "personal-learning-system-";

async function openPage(t, existing = null) {
  const server = http.createServer((request, response) => {
    const routes = ["/index.html", "/src/styles.css", "/src/app.js", "/src/data-model.js", "/src/demo-data.js", "/src/mock-ai-provider.js", "/src/ai-service.js", "/src/progress-draft-queue.js"];
    const route = request.url === "/" ? "/index.html" : request.url;
    if (!routes.includes(route)) { response.writeHead(404); response.end(); return; }
    response.setHeader("content-type", route.endsWith(".js") ? "text/javascript" : route.endsWith(".css") ? "text/css" : "text/html");
    fs.createReadStream(path.join(root, route)).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const browser = await chromium.launch({ executablePath: process.env.EDGE_EXE, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (existing) await page.addInitScript((items) => Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, value)), existing);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  return { page, errors };
}

test("首页示例完整，导航有效，任务在表单之前且刷新不会重新注入数据", async (t) => {
  const { page, errors } = await openPage(t);
  assert.equal(await page.locator("h1").count(), 1);
  assert.match(await page.locator("#progressOverview").textContent(), /75 分钟/);
  assert.equal(await page.locator("#planList .plan-card").count(), 2);
  const before = await page.evaluate(() => ({ ...localStorage }));
  assert.equal(Object.keys(before).length, 6);
  for (const link of await page.locator(".site-nav a, .hero-actions a").all()) {
    const target = await link.getAttribute("href");
    assert.equal(await page.locator(target).count(), 1);
    await link.click();
    assert.equal(new URL(page.url()).hash, target);
  }
  const taskBox = await page.locator("#planList").boundingBox();
  const formBox = await page.locator("#planForm").boundingBox();
  assert.ok(taskBox.x < formBox.x);
  await page.reload();
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before);
  await page.evaluate(() => window.scrollTo(0, 0));
  if (process.env.CAPTURE_SHOWCASE === "1") {
    fs.mkdirSync(path.join(root, "docs/images"), { recursive: true });
    await page.screenshot({ path: path.join(root, "docs/images/showcase-home.png") });
  }
  assert.deepEqual(errors, []);
});

test("示例描述可确认两条草稿，保存前数据不变，保存后复用统计且不联动任务", async (t) => {
  const { page, errors } = await openPage(t);
  const before = await page.evaluate(() => ({ ...localStorage }));
  await page.locator("#aiProgressDescription").fill("今天学习 Prompt Engineering 45 分钟，完成 70%；雅思阅读练习 30 分钟，完成 60%。");
  await page.locator("#generateProgressDraftButton").click();
  await page.locator(".progress-draft-card").nth(1).waitFor();
  assert.equal(await page.locator(".progress-draft-card").count(), 2);
  assert.equal(await page.locator("#progressTopic").inputValue(), "demo-topic-prompt");
  assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), before);
  if (process.env.CAPTURE_SHOWCASE === "1") {
    await page.locator("#records").screenshot({ path: path.join(root, "docs/images/showcase-drafts.png") });
  }
  await page.locator("#progressSubmitButton").click();
  assert.equal(await page.locator("#progressTopic").inputValue(), "demo-topic-reading");
  assert.match(await page.locator("#progressOverview").textContent(), /120 分钟/);
  await page.locator("#progressSubmitButton").click();
  assert.match(await page.locator("#progressOverview").textContent(), /150 分钟/);
  assert.equal(await page.locator("#progressList .progress-card").count(), 4);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), `${prefix}plans`), before[`${prefix}plans`]);
  assert.deepEqual(errors, []);
});

test("已有空数组或异常存储不注入示例且页面仍可查看", async (t) => {
  for (const value of ["[]", "broken-json", "null", '{}']) {
    const existing = { [`${prefix}resources`]: value };
    const { page, errors } = await openPage(t, existing);
    assert.deepEqual(await page.evaluate(() => ({ ...localStorage })), existing);
    assert.match(await page.locator("#progressOverview").textContent(), /0 分钟/);
    assert.equal(await page.locator("#topicList .topic-card").count(), 0);
    assert.deepEqual(errors, []);
  }
});

test("390px 页面及草稿无横向溢出，任务先于录入表单", async (t) => {
  const { page, errors } = await openPage(t);
  await page.setViewportSize({ width: 390, height: 844 });
  const assertNoOverflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await assertNoOverflow();
  const taskBox = await page.locator("#planList").boundingBox();
  const formBox = await page.locator("#planForm").boundingBox();
  assert.ok(taskBox.y < formBox.y);
  await page.locator("#aiProgressDescription").fill("今天学习 Prompt Engineering 45 分钟，完成 70%；雅思阅读练习 30 分钟，完成 60%。");
  await page.locator("#generateProgressDraftButton").click();
  await page.locator(".progress-draft-card").nth(1).waitFor();
  await assertNoOverflow();
  await page.locator("#progressSubmitButton").click();
  assert.match(await page.locator("#progressOverview").textContent(), /120 分钟/);
  if (process.env.CAPTURE_SHOWCASE === "1") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(root, "tmp/showcase-mobile.png") });
  }
  assert.deepEqual(errors, []);
});
