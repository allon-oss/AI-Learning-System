const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { createAIService, validateProgressDraftResult } = require("../src/ai-service.js");

const validResult = {
  draft: {
    date: "2026-08-25", topicId: "topic-ai", resourceId: null, planId: null,
    durationMinutes: 45, completionPercent: 70, reflection: "学习 AI",
  },
  missingFields: ["resourceId", "planId"],
  warnings: ["未匹配到关联资料，可手动选择或留空。"],
};

test("AI Service 异步委托 Provider 并返回统一草稿", async () => {
  let received;
  const service = createAIService({ async generateProgressDraft(request) { received = request; return validResult; } });
  const request = { description: "学习 AI", referenceDate: "2026-08-25", context: {} };
  const promise = service.generateProgressDraft(request);
  assert.equal(typeof promise.then, "function");
  assert.deepEqual(await promise, validResult);
  assert.equal(received, request);
});

test("AI Service 拒绝不完整或越界返回值", async () => {
  const incomplete = createAIService({ async generateProgressDraft() {
    return { draft: { date: null }, missingFields: [], warnings: [] };
  } });
  await assert.rejects(incomplete.generateProgressDraft({}), /无效的学习进度草稿/);

  const invalidPercent = createAIService({ async generateProgressDraft() {
    return { ...validResult, draft: { ...validResult.draft, completionPercent: 101 } };
  } });
  await assert.rejects(invalidPercent.generateProgressDraft({}), /无效/);
});

test("替换 Provider 不改变公开接口", async () => {
  const service = createAIService({ async generateProgressDraft() { return validResult; } });
  assert.deepEqual(await service.generateProgressDraft({}), validResult);
});

test("Provider 不存在或接口错误时创建 Service 失败", () => {
  assert.throws(() => createAIService(), /AI Provider 未实现 generateProgressDraft/);
  assert.throws(() => createAIService({}), /AI Provider 未实现 generateProgressDraft/);
});

test("Provider 抛错时 Service Promise 拒绝并保留原错误", async () => {
  const error = new Error("provider unavailable");
  const service = createAIService({ async generateProgressDraft() { throw error; } });
  await assert.rejects(service.generateProgressDraft({}), (actual) => actual === error);
});

test("校验器拒绝未知草稿键、非法缺失字段和非字符串警告", () => {
  const extraKey = { ...validResult, draft: { ...validResult.draft, extra: true } };
  const badMissingField = { ...validResult, missingFields: ["unknown"] };
  const badWarnings = { ...validResult, warnings: ["ok", 1] };
  for (const result of [extraKey, badMissingField, badWarnings]) {
    assert.throws(() => validateProgressDraftResult(result), /无效的学习进度草稿/);
  }
});

test("校验器拒绝顶层额外键", () => {
  assert.throws(() => validateProgressDraftResult({ ...validResult, extra: true }), /无效的学习进度草稿/);
});

test("校验器拒绝继承的顶层数组属性", () => {
  const inherited = Object.create({ missingFields: validResult.missingFields, warnings: validResult.warnings });
  inherited.draft = validResult.draft;
  assert.throws(() => validateProgressDraftResult(inherited), /无效的学习进度草稿/);
});

test("校验器拒绝非对象结果和非法字段值", () => {
  const invalidResults = [
    null,
    { ...validResult, draft: { ...validResult.draft, durationMinutes: 0 } },
    { ...validResult, draft: { ...validResult.draft, reflection: "x".repeat(501) } },
    { ...validResult, missingFields: "resourceId" },
  ];
  for (const result of invalidResults) {
    assert.throws(() => validateProgressDraftResult(result), /无效的学习进度草稿/);
  }
});

test("浏览器环境有 MockAIProvider 时建立默认 AIService", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "ai-service.js"), "utf8");
  const provider = { async generateProgressDraft() { return validResult; } };
  const context = { window: { MockAIProvider: provider } };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.AIService.generateProgressDraft, "function");
});
