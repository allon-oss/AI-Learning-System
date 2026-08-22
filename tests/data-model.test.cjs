const test = require("node:test");
const assert = require("node:assert/strict");

const model = require("../src/data-model.js");

test("旧主题按当前同级顺序获得连续 sortOrder", () => {
  const topics = [
    { id: "ai-foundation", direction: "AI 学习", parentId: "" },
    { id: "ai-prompt", direction: "AI 学习", parentId: "" },
    { id: "ielts-reading", direction: "雅思英语学习", parentId: "" },
    { id: "ai-child-a", direction: "AI 学习", parentId: "ai-foundation" },
    { id: "ai-child-b", direction: "AI 学习", parentId: "ai-foundation" },
  ];

  const normalized = model.normalizeTopics(topics);

  assert.deepEqual(
    normalized.map((topic) => [topic.id, topic.sortOrder]),
    [
      ["ai-foundation", 0],
      ["ai-prompt", 1],
      ["ielts-reading", 0],
      ["ai-child-a", 0],
      ["ai-child-b", 1],
    ],
  );
});

test("已有 sortOrder 决定同级主题显示顺序", () => {
  const topics = [
    { id: "ai-prompt", direction: "AI 学习", parentId: "", sortOrder: 1 },
    { id: "ai-foundation", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ielts", direction: "雅思英语学习", parentId: "", sortOrder: 0 },
  ];

  const ordered = model.getOrderedTopics(model.normalizeTopics(topics));

  assert.deepEqual(ordered.map((topic) => topic.id), ["ai-foundation", "ai-prompt", "ielts"]);
});

test("混合新旧排序字段时保留已有顺序并把旧主题放到同级末尾", () => {
  const topics = [
    { id: "ai-prompt", direction: "AI 学习", parentId: "", sortOrder: 1 },
    { id: "legacy-topic", direction: "AI 学习", parentId: "" },
    { id: "ai-foundation", direction: "AI 学习", parentId: "", sortOrder: 0 },
  ];

  const ordered = model.getOrderedTopics(model.normalizeTopics(topics));

  assert.deepEqual(ordered.map((topic) => topic.id), ["ai-foundation", "ai-prompt", "legacy-topic"]);
  assert.deepEqual(ordered.map((topic) => topic.sortOrder), [0, 1, 2]);
});

test("重复或无效 sortOrder 不覆盖同级中仍然有效的自定义顺序", () => {
  const topics = [
    { id: "ai-foundation", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "duplicate", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ai-workflow", direction: "AI 学习", parentId: "", sortOrder: 2 },
    { id: "invalid", direction: "AI 学习", parentId: "", sortOrder: -1 },
  ];

  const ordered = model.getOrderedTopics(model.normalizeTopics(topics));

  assert.deepEqual(ordered.map((topic) => topic.id), ["ai-foundation", "ai-workflow", "duplicate", "invalid"]);
  assert.deepEqual(ordered.map((topic) => topic.sortOrder), [0, 1, 2, 3]);
});

test("新主题排序值只计算同方向同父级主题", () => {
  const topics = [
    { id: "ai-a", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ai-b", direction: "AI 学习", parentId: "", sortOrder: 1 },
    { id: "ai-child", direction: "AI 学习", parentId: "ai-a", sortOrder: 8 },
    { id: "ielts", direction: "雅思英语学习", parentId: "", sortOrder: 5 },
  ];

  assert.equal(model.getNextTopicSortOrder(topics, "AI 学习", ""), 2);
  assert.equal(model.getNextTopicSortOrder(topics, "AI 学习", "ai-a"), 1);
});

test("上移主题只交换同方向同父级的相邻主题", () => {
  const topics = [
    { id: "ai-a", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ai-b", direction: "AI 学习", parentId: "", sortOrder: 1 },
    { id: "ai-child", direction: "AI 学习", parentId: "ai-a", sortOrder: 0 },
    { id: "ielts", direction: "雅思英语学习", parentId: "", sortOrder: 0 },
  ];

  const moved = model.moveTopic(topics, "ai-b", -1);
  const ordered = model.getOrderedTopics(moved);

  assert.deepEqual(ordered.map((topic) => topic.id), ["ai-b", "ai-a", "ai-child", "ielts"]);
  assert.equal(moved.find((topic) => topic.id === "ai-child").sortOrder, 0);
  assert.equal(moved.find((topic) => topic.id === "ielts").sortOrder, 0);
});

test("边界主题继续移动时保持原顺序", () => {
  const topics = [
    { id: "ai-a", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ai-b", direction: "AI 学习", parentId: "", sortOrder: 1 },
  ];

  const moved = model.moveTopic(topics, "ai-a", -1);

  assert.deepEqual(model.getOrderedTopics(moved).map((topic) => topic.id), ["ai-a", "ai-b"]);
});

test("主题移动按钮只在同级相邻位置存在时可用", () => {
  const topics = [
    { id: "ai-a", direction: "AI 学习", parentId: "", sortOrder: 0 },
    { id: "ai-b", direction: "AI 学习", parentId: "", sortOrder: 1 },
    { id: "ai-child", direction: "AI 学习", parentId: "ai-a", sortOrder: 0 },
  ];

  assert.deepEqual(model.getTopicMoveAvailability(topics, "ai-a"), { canMoveUp: false, canMoveDown: true });
  assert.deepEqual(model.getTopicMoveAvailability(topics, "ai-b"), { canMoveUp: true, canMoveDown: false });
  assert.deepEqual(model.getTopicMoveAvailability(topics, "ai-child"), { canMoveUp: false, canMoveDown: false });
});

test("资料今日任务摘要只统计当天和指定资料", () => {
  const plans = [
    { id: "today-complete", date: "2026-08-22", resourceId: "resource-a", isCompleted: true },
    { id: "today-open", date: "2026-08-22", resourceId: "resource-a", isCompleted: false },
    { id: "other-resource", date: "2026-08-22", resourceId: "resource-b", isCompleted: true },
    { id: "yesterday", date: "2026-08-21", resourceId: "resource-a", isCompleted: true },
  ];

  assert.deepEqual(model.getResourceTodayPlanSummary(plans, "resource-a", "2026-08-22"), {
    total: 2,
    completed: 1,
  });
});
