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

test("计划标准化为旧记录补齐可选字段且不改写原始日期", () => {
  const legacyPlans = [
    { id: "legacy", date: "not-a-date", task: "旧任务" },
    { id: "valid", date: "2026-08-24", priority: "高", estimatedMinutes: 45 },
    { id: "invalid-fields", date: "2026-08-25", priority: "紧急", estimatedMinutes: 0 },
  ];

  const normalized = model.normalizePlans(legacyPlans);

  assert.deepEqual(normalized, [
    { id: "legacy", date: "not-a-date", task: "旧任务", priority: "中", estimatedMinutes: null },
    { id: "valid", date: "2026-08-24", priority: "高", estimatedMinutes: 45 },
    { id: "invalid-fields", date: "2026-08-25", priority: "中", estimatedMinutes: null },
  ]);
  assert.equal(legacyPlans[0].date, "not-a-date");
  assert.notEqual(normalized[0], legacyPlans[0]);
});

test("计划日期按今天、未来、逾期和历史分类", () => {
  const today = "2026-08-22";

  assert.equal(model.classifyPlanDate({ date: "2026-08-22", isCompleted: false }, today), "today");
  assert.equal(model.classifyPlanDate({ date: "2026-08-23", isCompleted: false }, today), "future");
  assert.equal(model.classifyPlanDate({ date: "2026-08-21", isCompleted: false }, today), "overdue");
  assert.equal(model.classifyPlanDate({ date: "2026-08-21", isCompleted: true }, today), "history");
});

test("无效旧日期计划归入历史而不是被丢弃", () => {
  assert.equal(model.classifyPlanDate({ date: "2026-02-30", isCompleted: false }, "2026-08-22"), "history");
  assert.equal(model.classifyPlanDate({ date: "旧格式", isCompleted: false }, "2026-08-22"), "history");
  assert.equal(model.classifyPlanDate({}, "2026-08-22"), "history");
});

test("进度只能关联同主题且不晚于实际学习日期的有效计划，并按日期由近到远稳定排序", () => {
  const plans = [
    { id: "older", topicId: "topic-a", date: "2026-08-18", task: "较早任务" },
    { id: "same-day-first", topicId: "topic-a", date: "2026-08-20", task: "当天第一个" },
    { id: "future", topicId: "topic-a", date: "2026-08-21", task: "未来任务" },
    { id: "other-topic", topicId: "topic-b", date: "2026-08-20", task: "其他主题" },
    { id: "invalid-date", topicId: "topic-a", date: "2026-02-30", task: "异常日期" },
    { id: "same-day-second", topicId: "topic-a", date: "2026-08-20", task: "当天第二个" },
  ];

  const eligible = model.getEligiblePlansForProgress(plans, "topic-a", "2026-08-20");

  assert.deepEqual(eligible.map((plan) => plan.id), ["same-day-first", "same-day-second", "older"]);
  assert.equal(eligible[0], plans[1]);
  assert.deepEqual(plans.map((plan) => plan.id), ["older", "same-day-first", "future", "other-topic", "invalid-date", "same-day-second"]);
});

test("进度日期无效或计划输入不是数组时没有可关联计划", () => {
  assert.deepEqual(model.getEligiblePlansForProgress([], "topic-a", "2026-02-30"), []);
  assert.deepEqual(model.getEligiblePlansForProgress({}, "topic-a", "2026-08-20"), []);
});
