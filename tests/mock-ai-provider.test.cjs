const test = require("node:test");
const assert = require("node:assert/strict");
const provider = require("../src/mock-ai-provider.js");

const context = {
  directions: ["AI 学习"],
  topics: [{ id: "topic-transformer", name: "Transformer 入门", direction: "AI 学习", isArchived: false }],
  resources: [{ id: "resource-attention-video", title: "注意力机制视频", topicId: "topic-transformer" }],
  plans: [{ id: "plan-chapter-2", date: "2026-08-25", topicId: "topic-transformer", task: "看完第二章" }],
};

test("Mock 根据自由描述生成完整学习进度草稿", async () => {
  const description = "今天学习 Transformer 入门 45 分钟，使用注意力机制视频，完成今天的看完第二章计划 70%，还需要继续理解多头注意力。";
  const result = await provider.generateProgressDraft({ description, referenceDate: "2026-08-25", context });
  assert.deepEqual(result.draft, {
    date: "2026-08-25",
    topicId: "topic-transformer",
    resourceId: "resource-attention-video",
    planId: "plan-chapter-2",
    durationMinutes: 45,
    completionPercent: 70,
    reflection: description,
  });
  assert.deepEqual(result.missingFields, []);
});

test("Mock 识别昨天、明确日期、分钟和小数小时", async () => {
  const empty = { directions: [], topics: [], resources: [], plans: [] };
  const yesterday = await provider.generateProgressDraft({ description: "昨天学习 1.5 小时，完成 80%", referenceDate: "2026-08-25", context: empty });
  assert.equal(yesterday.draft.date, "2026-08-24");
  assert.equal(yesterday.draft.durationMinutes, 90);
  assert.equal(yesterday.draft.completionPercent, 80);
  const explicit = await provider.generateProgressDraft({ description: "2026-08-20 学习 20 分钟，完成 0%", referenceDate: "2026-08-25", context: empty });
  assert.equal(explicit.draft.date, "2026-08-20");
  assert.equal(explicit.draft.durationMinutes, 20);
  assert.equal(explicit.draft.completionPercent, 0);
});

test("Mock 排除归档主题并在同长候选歧义时留空", async () => {
  const result = await provider.generateProgressDraft({
    description: "今天学习阅读 30 分钟，完成 50%", referenceDate: "2026-08-25",
    context: { directions: ["AI 学习", "雅思英语学习"], topics: [
      { id: "topic-a", name: "阅读", direction: "AI 学习", isArchived: false },
      { id: "topic-b", name: "阅读", direction: "雅思英语学习", isArchived: false },
      { id: "topic-old", name: "阅读进阶", direction: "AI 学习", isArchived: true },
    ], resources: [], plans: [] },
  });
  assert.equal(result.draft.topicId, null);
  assert.ok(result.missingFields.includes("topicId"));
  assert.match(result.warnings.join(" "), /无法唯一匹配|活动学习主题/);
});

test("Mock 只匹配同主题资料和日期有效计划", async () => {
  const result = await provider.generateProgressDraft({
    description: "学习 Transformer 入门、注意力机制视频和看完第二章 45 分钟，完成 70%", referenceDate: "2026-08-25",
    context: { ...context, resources: [...context.resources, { id: "resource-other", title: "注意力机制视频", topicId: "topic-other" }], plans: [...context.plans, { id: "plan-future", date: "2026-08-26", topicId: "topic-transformer", task: "看完第二章" }] },
  });
  assert.equal(result.draft.resourceId, "resource-attention-video");
  assert.equal(result.draft.planId, "plan-chapter-2");
});

test("Mock 给出缺失提示并且不修改输入上下文", async () => {
  const supplied = { directions: ["AI 学习"], topics: [{ id: "topic-x", name: "已存在", direction: "AI 学习", isArchived: false }], resources: [], plans: [] };
  const before = structuredClone(supplied);
  const result = await provider.generateProgressDraft({ description: "学习了不存在主题", referenceDate: "2026-08-25", context: supplied });
  assert.equal(result.draft.date, "2026-08-25");
  assert.equal(result.draft.topicId, null);
  assert.equal(result.draft.durationMinutes, null);
  assert.equal(result.draft.completionPercent, null);
  assert.ok(result.missingFields.includes("topicId"));
  assert.match(result.warnings.join(" "), /手动选择|创建主题/);
  assert.deepEqual(supplied, before);
});
