(function attachMockAIProvider(globalScope) {
  const DRAFT_FIELDS = ["date", "topicId", "resourceId", "planId", "durationMinutes", "completionPercent", "reflection"];
  const MAX_PROGRESS_DRAFTS = 10;
  const DIRECTION_CUES = [
    { direction: "AI 学习", pattern: /\b(?:Codex|ChatGPT|OpenAI|RAG|Prompt)\b|大模型/i },
    { direction: "雅思英语学习", pattern: /雅思|\bIELTS\b|单词|背词/i },
  ];

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

  function detectSuggestedDirection(text, directions) {
    const exact = directions.filter((direction) => text.includes(direction));
    if (exact.length === 1) return exact[0];
    const cues = DIRECTION_CUES.filter((cue) => cue.pattern.test(text) && directions.includes(cue.direction));
    return cues.length === 1 ? cues[0].direction : null;
  }

  function getSegmentSignal(text, context) {
    const activeTopics = context.topics.filter((topic) => topic && topic.isArchived !== true);
    const topicPick = pickLongest(activeTopics, text, (topic) => topic.name);
    if (topicPick.value) return { topicId: topicPick.value.id, direction: topicPick.value.direction };

    const activeTopicIds = new Set(activeTopics.map((topic) => topic.id));
    const planTopicIds = [...new Set(context.plans
      .filter((plan) => plan && activeTopicIds.has(plan.topicId) && typeof plan.task === "string" && text.includes(plan.task))
      .map((plan) => plan.topicId))];
    if (planTopicIds.length === 1) {
      const topic = activeTopics.find((item) => item.id === planTopicIds[0]);
      return { topicId: topic.id, direction: topic.direction };
    }

    const resourceTopicIds = [...new Set(context.resources
      .filter((resource) => resource && activeTopicIds.has(resource.topicId) && typeof resource.title === "string" && text.includes(resource.title))
      .map((resource) => resource.topicId))];
    if (resourceTopicIds.length === 1) {
      const topic = activeTopics.find((item) => item.id === resourceTopicIds[0]);
      return { topicId: topic.id, direction: topic.direction };
    }
    return { topicId: null, direction: detectSuggestedDirection(text, context.directions) };
  }

  function signalsConflict(first, second) {
    if (!first || !second) return false;
    if (first.topicId && second.topicId) return first.topicId !== second.topicId;
    return Boolean(first.direction && second.direction && first.direction !== second.direction);
  }

  function splitSegmentAtTopicChanges(segment, context) {
    const parts = segment
      .split(/(?:[，,、]\s*|(?=然后|另外|接着|还(?:学|背|做|练|读|写|听)))/)
      .map((item) => item.trim())
      .filter(Boolean);
    const groups = [];
    parts.forEach((part) => {
      const signal = getSegmentSignal(part, context);
      const current = groups[groups.length - 1];
      if (!current || signalsConflict(current.signal, signal)) {
        groups.push({ text: part, signal });
        return;
      }
      current.text = `${current.text}，${part}`;
      if (!current.signal.topicId && signal.topicId) current.signal = signal;
      else if (!current.signal.direction && signal.direction) current.signal = signal;
    });
    return groups.map((group) => group.text);
  }

  function splitDescriptionIntoSegments(description, context) {
    const normalized = description.replace(/[^\S\r\n]+/g, " ").trim();
    const strongSegments = normalized.split(/[。；;！？!?\n]+/).map((item) => item.trim()).filter(Boolean);
    return strongSegments.flatMap((segment) => splitSegmentAtTopicChanges(segment, context));
  }

  function parseDate(text, referenceDate, warnings) {
    const explicit = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (explicit) return isValidDate(explicit[1]) && explicit[1] <= (isValidDate(referenceDate) ? referenceDate : "9999-12-31") ? explicit[1] : null;
    if (text.includes("昨天") || text.includes("昨日")) return dateOffset(referenceDate, -1);
    if (text.includes("今天") || text.includes("今日")) return isValidDate(referenceDate) ? referenceDate : null;
    return isValidDate(referenceDate) ? referenceDate : null;
  }

  function parseSegmentDate(sourceText, referenceDate, inheritedDate, warnings) {
    const hasOwnDate = /(\d{4}-\d{2}-\d{2})|今天|今日|昨天|昨日/.test(sourceText);
    return hasOwnDate
      ? parseDate(sourceText, referenceDate, warnings)
      : inheritedDate || parseDate(sourceText, referenceDate, warnings);
  }

  function parseDurationMinutes(text) {
    const matches = [...text.matchAll(/(?<![\w.-])(-?\d+(?:\.\d+)?)(?![\w.])\s*(小时|小時|h|hours?|分钟|分鐘|min(?:ute)?s?)(?!\w)/gi)];
    if (!matches.length) return null;
    const parsed = matches.map((match) => ({
      value: Number(match[1]),
      isHour: /小时|小時|^h$|hour/i.test(match[2]),
    }));
    if (parsed.some(({ value, isHour }) => !Number.isFinite(value) || value <= 0 || (!isHour && !Number.isInteger(value)))) return null;
    const minutes = parsed.reduce((sum, { value, isHour }) => sum + (isHour ? value * 60 : value), 0);
    return Number.isInteger(minutes) && minutes > 0 ? minutes : null;
  }

  function parseCompletionPercent(text, warnings) {
    const matches = [...text.matchAll(/(?<![\w.-])(-?\d+(?:\.\d+)?)(?![\w.])\s*%(?![\w%])/g)];
    const legal = [...new Set(matches.map((match) => Number(match[1]))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 100))];
    if (legal.length > 1) {
      warnings.push("同一学习片段出现多个完成度，请手动确认。");
      return null;
    }
    return legal.length === 1 ? legal[0] : null;
  }

  function getSameDatePlans(plans, topicId, date) {
    return plans.filter((plan) => plan && plan.topicId === topicId && plan.date === date);
  }

  function pickPlanForSegment(plans, sourceText, topicId, date) {
    const sameDate = getSameDatePlans(plans, topicId, date);
    const explicit = pickUniqueMatch(sameDate, sourceText, (plan) => plan.task);
    if (explicit.value) return { value: explicit.value, ambiguous: false };
    if (explicit.ambiguous) return explicit;
    if (sameDate.length === 1) return { value: sameDate[0], ambiguous: false };
    if (sameDate.length > 1) return { value: null, ambiguous: true };
    const eligible = plans.filter((plan) => plan && plan.topicId === topicId && isValidDate(plan.date) && date && plan.date <= date);
    return pickUniqueMatch(eligible, sourceText, (plan) => plan.task);
  }

  function matchTopicResourceAndPlan({ sourceText, draft, suggestedDirection, context, warnings }) {
    const activeTopics = context.topics.filter((topic) => topic && topic.isArchived !== true);
    const topicPick = pickLongest(activeTopics, sourceText, (item) => item.name);
    let topic = topicPick.value;
    const activeTopicIds = new Set(activeTopics.map((item) => item.id));

    if (!topic && !topicPick.ambiguous) {
      const planTopicIds = [...new Set(context.plans
        .filter((plan) => plan && activeTopicIds.has(plan.topicId) && typeof plan.task === "string" && sourceText.includes(plan.task))
        .map((plan) => plan.topicId))];
      if (planTopicIds.length === 1) topic = activeTopics.find((item) => item.id === planTopicIds[0]);
    }
    if (!topic && !topicPick.ambiguous) {
      const resourceTopicIds = [...new Set(context.resources
        .filter((resource) => resource && activeTopicIds.has(resource.topicId) && typeof resource.title === "string" && sourceText.includes(resource.title))
        .map((resource) => resource.topicId))];
      if (resourceTopicIds.length === 1) topic = activeTopics.find((item) => item.id === resourceTopicIds[0]);
    }
    if (!topic && !topicPick.ambiguous && suggestedDirection) {
      const directionTopics = activeTopics.filter((item) => item.direction === suggestedDirection);
      const vocabularyTopics = /单词|背词/.test(sourceText)
        ? directionTopics.filter((item) => item.name === "词汇")
        : [];
      if (vocabularyTopics.length === 1) topic = vocabularyTopics[0];
      else if (directionTopics.length === 1) topic = directionTopics[0];
    }

    if (!topic) {
      warnings.push(suggestedDirection
        ? `已识别为${suggestedDirection}，但无法唯一关联活动主题，请手动选择。`
        : "无法匹配活动学习主题，请手动选择或先创建主题。");
      return;
    }

    draft.topicId = topic.id;
    const resourcePick = pickUniqueMatch(
      context.resources.filter((resource) => resource && resource.topicId === topic.id),
      sourceText,
      (resource) => resource.title,
    );
    if (resourcePick.value) draft.resourceId = resourcePick.value.id;
    else if (resourcePick.ambiguous) warnings.push("资料匹配存在歧义，请手动选择。");

    const planPick = pickPlanForSegment(context.plans, sourceText, topic.id, draft.date);
    if (planPick.value) draft.planId = planPick.value.id;
    else if (planPick.ambiguous) warnings.push("同一日期存在多个可关联计划，请手动选择。");
  }

  function parseProgressDraftSegment(sourceText, referenceDate, context, inheritedDate) {
    const warnings = [];
    const draft = {
      date: parseSegmentDate(sourceText, referenceDate, inheritedDate, warnings),
      topicId: null,
      resourceId: null,
      planId: null,
      durationMinutes: parseDurationMinutes(sourceText),
      completionPercent: parseCompletionPercent(sourceText, warnings),
      reflection: sourceText.slice(0, 500),
    };
    if (!draft.date) warnings.push("日期无效或超出参考日期，请手动选择有效日期。");
    const suggestedDirection = detectSuggestedDirection(sourceText, context.directions);
    matchTopicResourceAndPlan({ sourceText, draft, suggestedDirection, context, warnings });
    return {
      sourceText: sourceText.slice(0, 500),
      suggestedDirection,
      draft,
      missingFields: DRAFT_FIELDS.filter((field) => draft[field] === null || draft[field] === ""),
      warnings,
    };
  }

  function parseSharedDate(description, referenceDate) {
    const leadingDate = description.trim().match(/^(\d{4}-\d{2}-\d{2}|今天|今日|昨天|昨日)/);
    return leadingDate
      ? parseDate(leadingDate[0], referenceDate, [])
      : isValidDate(referenceDate) ? referenceDate : null;
  }

  async function generateProgressDrafts(request) {
    const description = typeof request?.description === "string" ? request.description.trim() : "";
    const context = normalizeContext(request?.context);
    const sourceSegments = splitDescriptionIntoSegments(description, context);
    const warnings = [];
    if (sourceSegments.length > MAX_PROGRESS_DRAFTS) {
      warnings.push("一次最多生成 10 条草稿，请拆分描述后继续生成。");
    }
    const inheritedDate = parseSharedDate(description, request?.referenceDate);
    const drafts = sourceSegments
      .slice(0, MAX_PROGRESS_DRAFTS)
      .map((sourceText) => parseProgressDraftSegment(sourceText, request?.referenceDate, context, inheritedDate));
    return { drafts, warnings };
  }

  const api = { generateProgressDrafts };
  globalScope.MockAIProvider = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
