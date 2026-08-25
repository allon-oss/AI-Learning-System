(function attachMockAIProvider(globalScope) {
  const DRAFT_FIELDS = ["date", "topicId", "resourceId", "planId", "durationMinutes", "completionPercent", "reflection"];

  function isValidDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }

  function dateOffset(value, days) {
    if (!isValidDate(value)) return null;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + days);
    const result = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return isValidDate(result) ? result : null;
  }

  function normalizeContext(context) {
    return {
      directions: Array.isArray(context?.directions) ? context.directions.slice() : [],
      topics: Array.isArray(context?.topics) ? context.topics.slice() : [],
      resources: Array.isArray(context?.resources) ? context.resources.slice() : [],
      plans: Array.isArray(context?.plans) ? context.plans.slice() : [],
    };
  }

  function pickLongest(items, text, nameOf) {
    const candidates = items.filter((item) => {
      const name = nameOf(item);
      return typeof name === "string" && name.length > 0 && text.includes(name);
    });
    if (!candidates.length) return { value: null, ambiguous: false };
    const longest = Math.max(...candidates.map((item) => nameOf(item).length));
    const best = candidates.filter((item) => nameOf(item).length === longest);
    return { value: best.length === 1 ? best[0] : null, ambiguous: best.length > 1 };
  }

  function pickUniqueMatch(items, text, nameOf) {
    const candidatesById = new Map();
    items.forEach((item) => {
      const name = nameOf(item);
      if (typeof name === "string" && name.length > 0 && text.includes(name)) {
        candidatesById.set(item.id, item);
      }
    });
    const candidates = [...candidatesById.values()];
    return { value: candidates.length === 1 ? candidates[0] : null, ambiguous: candidates.length > 1 };
  }

  function parseDate(text, referenceDate, warnings) {
    const explicit = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (explicit) return isValidDate(explicit[1]) && explicit[1] <= (isValidDate(referenceDate) ? referenceDate : "9999-12-31") ? explicit[1] : null;
    if (text.includes("昨天") || text.includes("昨日")) return dateOffset(referenceDate, -1);
    if (text.includes("今天") || text.includes("今日")) return isValidDate(referenceDate) ? referenceDate : null;
    return isValidDate(referenceDate) ? referenceDate : null;
  }

  function parseProgressDraft(description, referenceDate, context) {
    const warnings = [];
    const draft = { date: null, topicId: null, resourceId: null, planId: null, durationMinutes: null, completionPercent: null, reflection: description.slice(0, 500) };
    draft.date = parseDate(description, referenceDate, warnings);
    if (!draft.date) warnings.push("日期无效或超出参考日期，请手动选择有效日期。");

    const durations = [...description.matchAll(/(?<![\w.-])(-?\d+(?:\.\d+)?)(?![\w.])\s*(小时|小時|h|hours?|分钟|分鐘|min(?:ute)?s?)(?!\w)/gi)];
    if (durations.length) {
      const parsedDurations = durations.map((match) => ({
        value: Number(match[1]),
        isHour: /小时|小時|^h$|hour/i.test(match[2]),
      }));
      const hasInvalidDuration = parsedDurations.some(({ value, isHour }) => !Number.isFinite(value) || value <= 0 || (!isHour && !Number.isInteger(value)));
      const minutes = parsedDurations.reduce((sum, { value, isHour }) => sum + (isHour ? value * 60 : value), 0);
      if (!hasInvalidDuration && Number.isInteger(minutes) && minutes > 0) draft.durationMinutes = minutes;
    }
    const percent = description.match(/(?<![\w.-])(-?\d+(?:\.\d+)?)(?![\w.])\s*%(?![\w%])/);
    if (percent) {
      const value = Number(percent[1]);
      if (Number.isInteger(value) && value >= 0 && value <= 100) draft.completionPercent = value;
    }

    let topics = context.topics.filter((topic) => topic && topic.isArchived !== true);
    const directions = context.directions.filter((direction) => typeof direction === "string" && direction && description.includes(direction));
    if (directions.length) topics = topics.filter((topic) => directions.includes(topic.direction));
    const topicPick = pickLongest(topics, description, (topic) => topic.name);
    if (topicPick.value) draft.topicId = topicPick.value.id;
    else if (topicPick.ambiguous) warnings.push("无法唯一匹配活动学习主题，请手动选择。");
    else warnings.push("无法匹配活动学习主题，请手动选择或先创建主题。");

    if (draft.topicId) {
      const resources = context.resources.filter((resource) => resource && resource.topicId === draft.topicId);
      const resourcePick = pickUniqueMatch(resources, description, (resource) => resource.title);
      if (resourcePick.value) draft.resourceId = resourcePick.value.id;
      else if (resourcePick.ambiguous) warnings.push("资料匹配存在歧义，请手动选择。");
      else if (/资料|视频|音频|resource/i.test(description)) warnings.push("资料无法关联到当前主题，请手动选择。");
      const plans = context.plans.filter((plan) => plan && plan.topicId === draft.topicId && isValidDate(plan.date) && draft.date && plan.date <= draft.date);
      const planPick = pickUniqueMatch(plans, description, (plan) => plan.task);
      if (planPick.value) draft.planId = planPick.value.id;
      else if (planPick.ambiguous) warnings.push("计划匹配存在歧义，请手动选择。");
      else if (/计划|任务|plan/i.test(description)) warnings.push("计划无法关联到当前主题和日期，请手动选择。");
    }
    return { draft, warnings };
  }

  async function generateProgressDraft(request) {
    const description = typeof request?.description === "string" ? request.description.trim() : "";
    const context = normalizeContext(request?.context);
    const parsed = parseProgressDraft(description, request?.referenceDate, context);
    return { draft: parsed.draft, missingFields: DRAFT_FIELDS.filter((field) => parsed.draft[field] === null || parsed.draft[field] === ""), warnings: parsed.warnings };
  }

  const api = { generateProgressDraft };
  globalScope.MockAIProvider = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
