const test = require("node:test");
const assert = require("node:assert/strict");
const queue = require("../src/progress-draft-queue.js");

const providerDrafts = [
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
];

test("队列按 Provider 顺序建立稳定会话 ID 且不修改输入", () => {
  const source = structuredClone(providerDrafts);
  const items = queue.createProgressDraftQueueItems(source, 3);
  assert.deepEqual(items.map((item) => item.id), ["progress-draft-3-1", "progress-draft-3-2"]);
  assert.deepEqual(items.map((item) => item.sourceText), ["Codex 学了40分钟", "背了40个单词"]);
  assert.deepEqual(source, providerDrafts);
});

test("更新当前草稿不会修改其他队列项或原数组", () => {
  const items = queue.createProgressDraftQueueItems(providerDrafts, 1);
  const updated = queue.updateProgressDraftQueueItem(items, items[0].id, {
    ...items[0].draft,
    completionPercent: 70,
  });
  assert.equal(updated[0].draft.completionPercent, 70);
  assert.equal(items[0].draft.completionPercent, null);
  assert.equal(updated[1], items[1]);
});

test("移除当前项后优先选择原位置下一条否则选择上一条", () => {
  const items = queue.createProgressDraftQueueItems(providerDrafts, 1);
  const firstRemoved = queue.removeProgressDraftQueueItem(items, items[0].id);
  assert.equal(firstRemoved.nextActiveId, items[1].id);
  const lastRemoved = queue.removeProgressDraftQueueItem(items, items[1].id);
  assert.equal(lastRemoved.nextActiveId, items[0].id);
  const empty = queue.removeProgressDraftQueueItem([items[0]], items[0].id);
  assert.deepEqual(empty, { items: [], nextActiveId: "" });
});

test("当前缺失字段随用户修改重新计算但保留 Provider 原始提示", () => {
  const items = queue.createProgressDraftQueueItems(providerDrafts, 1);
  const originalMissing = items[1].providerMissingFields.slice();
  const completedDraft = {
    ...items[1].draft,
    topicId: "topic-words",
    durationMinutes: 30,
    completionPercent: 80,
  };
  assert.deepEqual(queue.getCurrentProgressDraftMissingFields(completedDraft), []);
  assert.deepEqual(items[1].providerMissingFields, originalMissing);
});
