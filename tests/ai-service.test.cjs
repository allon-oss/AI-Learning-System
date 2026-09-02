const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const {
  createAIService,
  validateProgressDraftsResult,
} = require("../src/ai-service.js");

const validMultiResult = {
  drafts: [
    {
      sourceText: "Codex 学了40分钟",
      suggestedDirection: "AI 学习",
      draft: {
        date: "2026-09-01", topicId: "topic-codex", resourceId: null, planId: "plan-codex",
        durationMinutes: 40, completionPercent: null, reflection: "Codex 学了40分钟",
      },
      missingFields: ["resourceId", "completionPercent"], warnings: [],
    },
    {
      sourceText: "背了40个单词",
      suggestedDirection: "雅思英语学习",
      draft: {
        date: "2026-09-01", topicId: "topic-words", resourceId: null, planId: "plan-words",
        durationMinutes: null, completionPercent: null, reflection: "背了40个单词",
      },
      missingFields: ["resourceId", "durationMinutes", "completionPercent"], warnings: [],
    },
  ],
  warnings: [],
};

const allowedDirections = ["AI 学习", "雅思英语学习"];

function makeRequest() {
  return {
    description: "学习两项",
    referenceDate: "2026-09-01",
    context: { directions: allowedDirections, topics: [], resources: [], plans: [] },
  };
}

test("AI Service 异步委托多草稿 Provider", async () => {
  let received;
  const service = createAIService({
    async generateProgressDrafts(request) { received = request; return validMultiResult; },
  });
  const request = makeRequest();
  const promise = service.generateProgressDrafts(request);
  assert.equal(typeof promise.then, "function");
  assert.deepEqual(await promise, validMultiResult);
  assert.equal(received, request);
});

test("Provider 不存在或缺少多草稿接口时创建 Service 失败", () => {
  assert.throws(() => createAIService(), /AI Provider 未实现 generateProgressDrafts/);
  assert.throws(() => createAIService({}), /AI Provider 未实现 generateProgressDrafts/);
  assert.throws(() => createAIService({ generateProgressDrafts: true }), /AI Provider 未实现 generateProgressDrafts/);
});

test("Provider 抛错时 Service Promise 拒绝并保留原错误", async () => {
  const error = new Error("provider unavailable");
  const service = createAIService({ async generateProgressDrafts() { throw error; } });
  await assert.rejects(service.generateProgressDrafts(makeRequest()), (actual) => actual === error);
});

test("多草稿校验器拒绝空数组、超过十条和重复对象引用", () => {
  assert.throws(() => validateProgressDraftsResult({ drafts: [], warnings: [] }, allowedDirections), /无效/);
  assert.throws(() => validateProgressDraftsResult({
    drafts: Array.from({ length: 11 }, () => structuredClone(validMultiResult.drafts[0])), warnings: [],
  }, allowedDirections), /无效/);
  const item = validMultiResult.drafts[0];
  assert.throws(() => validateProgressDraftsResult({ drafts: [item, item], warnings: [] }, allowedDirections), /无效/);
});

test("多草稿校验器拒绝未知顶层键和草稿项键", () => {
  assert.throws(() => validateProgressDraftsResult({ ...validMultiResult, extra: true }, allowedDirections), /无效/);
  const itemWithExtra = { ...validMultiResult.drafts[0], extra: true };
  assert.throws(() => validateProgressDraftsResult({ drafts: [itemWithExtra], warnings: [] }, allowedDirections), /无效/);
  const inherited = Object.create({ warnings: [] });
  inherited.drafts = validMultiResult.drafts;
  assert.throws(() => validateProgressDraftsResult(inherited, allowedDirections), /无效/);
});

test("多草稿校验器拒绝非法来源片段和建议方向", () => {
  const base = validMultiResult.drafts[0];
  const invalidItems = [
    { ...base, sourceText: " " },
    { ...base, sourceText: "x".repeat(501) },
    { ...base, suggestedDirection: 1 },
    { ...base, suggestedDirection: "不存在的方向" },
  ];
  for (const item of invalidItems) {
    assert.throws(() => validateProgressDraftsResult({ drafts: [item], warnings: [] }, allowedDirections), /无效/);
  }
});

test("多草稿校验器拒绝不完整、越界或超长草稿字段", () => {
  const base = validMultiResult.drafts[0];
  const invalidDrafts = [
    { date: "2026-09-01" },
    { ...base.draft, durationMinutes: 0 },
    { ...base.draft, completionPercent: 101 },
    { ...base.draft, reflection: "x".repeat(501) },
  ];
  for (const draft of invalidDrafts) {
    assert.throws(() => validateProgressDraftsResult({ drafts: [{ ...base, draft }], warnings: [] }, allowedDirections), /无效/);
  }
});

test("多草稿校验器拒绝非法缺失字段和非字符串警告", () => {
  const base = validMultiResult.drafts[0];
  const invalidResults = [
    { drafts: [{ ...base, missingFields: ["unknown"] }], warnings: [] },
    { drafts: [{ ...base, warnings: [1] }], warnings: [] },
    { drafts: [base], warnings: [1] },
  ];
  for (const result of invalidResults) {
    assert.throws(() => validateProgressDraftsResult(result, allowedDirections), /无效/);
  }
});

test("浏览器环境有 MockAIProvider 时建立默认多草稿 AIService", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "ai-service.js"), "utf8");
  const provider = {
    async generateProgressDrafts() { return validMultiResult; },
  };
  const context = { window: { MockAIProvider: provider } };
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.AIService.generateProgressDrafts, "function");
});
