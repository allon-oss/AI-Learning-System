const test = require("node:test");
const assert = require("node:assert/strict");
const { createDemoData, initializeDemoData } = require("../src/demo-data.js");
const provider = require("../src/mock-ai-provider.js");

const keys = Object.fromEntries(["topics", "resources", "plans", "notes", "progressRecords", "directions"].map((name) => [name, name]));
function storage(initial = {}, failAt = null) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem(key, value) { if (key === failAt) throw new Error("Quota exceeded"); values.set(key, value); },
    removeItem: (key) => values.delete(key),
  };
}

test("首次初始化完整示例，日期跨月正确，刷新不移动日期", () => {
  const local = storage();
  assert.equal(initializeDemoData(local, keys, new Date(2026, 9, 1, 12)), "initialized");
  const before = [...local.values];
  const data = Object.fromEntries(before.map(([key, value]) => [key, JSON.parse(value)]));
  assert.deepEqual(Object.values(data).map((items) => items.length), [4, 3, 4, 2, 2, 2]);
  assert.equal(data.progressRecords.reduce((sum, item) => sum + item.durationMinutes, 0), 75);
  assert.deepEqual(data.plans.map((item) => item.date), ["2026-10-01", "2026-10-01", "2026-09-30", "2026-10-02"]);
  assert.equal(initializeDemoData(local, keys, new Date(2026, 9, 2)), "existing");
  assert.deepEqual([...local.values], before);
});

test("任一存储键存在时，包括空值和异常内容，均不插入或改写数据", () => {
  for (const key of Object.values(keys)) {
    for (const value of ["[]", "", "not-json", "null", '[{"id":"personal"}]']) {
      const local = storage({ [key]: value });
      assert.equal(initializeDemoData(local, keys), "existing");
      assert.deepEqual([...local.values], [[key, value]]);
    }
  }
});

test("写入失败时撤回本次示例写入，不留下不完整关联", () => {
  const local = storage({}, "notes");
  assert.equal(initializeDemoData(local, keys), "unavailable");
  assert.equal(local.values.size, 0);
});

test("存储不可读时不尝试写入", () => {
  let writes = 0;
  const local = { getItem() { throw new Error("Denied"); }, setItem() { writes++; } };
  assert.equal(initializeDemoData(local, keys), "unavailable");
  assert.equal(writes, 0);
});

test("示例的父主题、资料、计划、笔记与记录关联均有效且同主题", () => {
  const data = createDemoData(new Date(2026, 9, 4, 12));
  const topics = new Map(data.topics.map((item) => [item.id, item]));
  assert.equal(new Set(data.topics.map((item) => item.id)).size, 4);
  assert.ok(data.topics.some((item) => item.parentId));
  data.topics.forEach((item) => { if (item.parentId) assert.ok(topics.has(item.parentId)); });
  for (const item of [...data.resources, ...data.plans, ...data.notes, ...data.progressRecords]) {
    assert.ok(topics.has(item.topicId));
    if (item.resourceId) assert.equal(data.resources.find((resource) => resource.id === item.resourceId)?.topicId, item.topicId);
    if (item.planId) assert.equal(data.plans.find((plan) => plan.id === item.planId)?.topicId, item.topicId);
  }
});

test("首页示例产生两个对应主题草稿，不改变已有记录与任务", async () => {
  const data = createDemoData(new Date(2026, 9, 4, 12));
  const before = JSON.stringify(data);
  const result = await provider.generateProgressDrafts({
    description: "今天学习 Prompt Engineering 45 分钟，完成 70%；雅思阅读练习 30 分钟，完成 60%。",
    referenceDate: "2026-10-04", context: data,
  });
  assert.deepEqual(result.drafts.map((item) => item.draft.topicId), ["demo-topic-prompt", "demo-topic-reading"]);
  assert.deepEqual(result.drafts.map((item) => item.draft.durationMinutes), [45, 30]);
  assert.deepEqual(result.drafts.map((item) => item.draft.completionPercent), [70, 60]);
  assert.equal(JSON.stringify(data), before);
});
