(function attachLearningDemoData(globalScope) {
  function createDemoData(now = new Date()) {
    const localDate = (offset) => {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    };
    const today = localDate(0);
    const yesterday = localDate(-1);
    const tomorrow = localDate(1);
    const timestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 18).toISOString();
    const topic = (id, name, direction, parentId, description, status, sortOrder) => ({
      id, name, direction, parentId, description, status, sortOrder,
      isArchived: false, archivedAt: null, archiveRootId: null,
      createdAt: yesterday, updatedAt: yesterday,
    });
    const resource = (id, title, topicId, type) => ({
      id, title, topicId, type, status: "学习中", createdAt: yesterday, updatedAt: yesterday,
    });
    const plan = (id, date, topicId, resourceId, task, estimatedMinutes, isCompleted = false) => ({
      id, date, topicId, resourceId, task, estimatedMinutes, isCompleted,
      priority: "中", isBackfilled: false, createdAt: timestamp,
    });
    return {
      topics: [
        topic("demo-topic-ai", "AI 基础", "AI 学习", "", "从基本概念到日常应用，建立自己的 AI 学习路线。", "学习中", 0),
        topic("demo-topic-prompt", "Prompt Engineering", "AI 学习", "demo-topic-ai", "练习清晰地描述任务，比较提示词对输出的影响。", "学习中", 0),
        topic("demo-topic-reading", "雅思阅读", "雅思英语学习", "", "练习关键词定位，记录理解与错题思路。", "学习中", 0),
        topic("demo-topic-words", "雅思词汇", "雅思英语学习", "", "通过例句与回顾巩固词汇，不只记住中文释义。", "学习中", 1),
      ],
      resources: [
        resource("demo-resource-prompt", "提示词练习笔记", "demo-topic-prompt", "文档"),
        resource("demo-resource-reading", "阅读练习材料", "demo-topic-reading", "文章"),
        resource("demo-resource-words", "词汇复习清单", "demo-topic-words", "单词表"),
      ],
      plans: [
        plan("demo-plan-prompt", today, "demo-topic-prompt", "demo-resource-prompt", "比较两种提示词的输出", 45),
        plan("demo-plan-reading", today, "demo-topic-reading", "demo-resource-reading", "练习关键词定位", 30),
        plan("demo-plan-words", yesterday, "demo-topic-words", "demo-resource-words", "复习一组词汇", 30, true),
        plan("demo-plan-review", tomorrow, "demo-topic-reading", "demo-resource-reading", "整理定位练习中的错题", 20),
      ],
      notes: [
        {
          id: "demo-note-prompt", title: "提示词结构复盘", topicId: "demo-topic-prompt", resourceId: "demo-resource-prompt", planId: null,
          content: "这次练习把同一个任务写成两种提示词，分别比较输出的结构与细节。明确目标、提供背景并约定输出格式后，结果更容易检查。还有一些回答过于笼统，下次准备补充一个具体例子，再观察差异。这是一条虚构的学习示例。",
          createdAt: timestamp, updatedAt: timestamp,
        },
        {
          id: "demo-note-words", title: "词汇复习方法", topicId: "demo-topic-words", resourceId: "demo-resource-words", planId: "demo-plan-words",
          content: "这次复习先遮住释义回想词义，再用短句确认自己是否理解。容易混淆的词单独放回清单，留待下次复习。完成一组词汇并不意味着已经长期掌握，后面还需要在阅读中辨认和使用。这是一条虚构示例，用来展示学习笔记的关联方式。",
          createdAt: timestamp, updatedAt: timestamp,
        },
      ],
      progressRecords: [
        { id: "demo-progress-prompt", date: yesterday, topicId: "demo-topic-prompt", resourceId: "demo-resource-prompt", planId: null, durationMinutes: 45, completionPercent: 70, reflection: "比较了两种提示词结构，下一次补充具体例子继续验证。", createdAt: timestamp, updatedAt: timestamp },
        { id: "demo-progress-words", date: yesterday, topicId: "demo-topic-words", resourceId: "demo-resource-words", planId: "demo-plan-words", durationMinutes: 30, completionPercent: 100, reflection: "完成一组词汇复习，已把容易混淆的词记入复习清单。", createdAt: timestamp, updatedAt: timestamp },
      ],
      directions: ["AI 学习", "雅思英语学习"],
    };
  }

  function initializeDemoData(storage, keys, now = new Date()) {
    const writtenKeys = [];
    try {
      // Existing empty or malformed values also belong to the user. Never seed over them.
      if (Object.values(keys).some((key) => storage.getItem(key) !== null)) return "existing";
      const data = createDemoData(now);
      for (const [name, key] of Object.entries(keys)) {
        storage.setItem(key, JSON.stringify(data[name]));
        writtenKeys.push(key);
      }
      return "initialized";
    } catch {
      // Roll back only keys created by this initialization, never pre-existing data.
      for (const key of writtenKeys) {
        try { storage.removeItem(key); } catch { /* Storage itself may be inaccessible. */ }
      }
      return "unavailable";
    }
  }

  const api = { createDemoData, initializeDemoData };
  globalScope.LearningDemoData = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
