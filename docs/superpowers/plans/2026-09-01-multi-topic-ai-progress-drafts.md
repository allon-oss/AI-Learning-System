# V1.5 Multi-Topic AI Progress Drafts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn one natural-language learning description into an ordered queue of independently editable, saveable, and discardable progress drafts without changing the persisted progress-record schema.

**Architecture:** Evolve the replaceable Mock Provider/AI Service contract from one draft to a validated `drafts[]` result. Keep queue state in a focused browser/Node module, use the existing progress form as the editor for one active queue item, and persist only the confirmed item through the existing progress validation rules. Queue metadata remains in memory and never enters Local Storage.

**Tech Stack:** Vanilla JavaScript IIFEs, browser DOM APIs, Local Storage, Node.js built-in test runner, Playwright with Microsoft Edge, HTML, CSS.

**Spec:** `docs/v1.5-multi-topic-ai-progress-draft-requirements.md`

## Global Constraints

- Do not connect OpenAI, DeepSeek, or any real AI API.
- Do not add API keys, tokens, passwords, Provider settings, servers, MCP, Connectors, or network requests.
- Do not add npm dependencies or change the existing Local Storage keys.
- Do not add `batchId`, `sourceText`, `suggestedDirection`, `providerMissingFields`, or `learningContent` to saved progress records.
- Keep the final progress record fields exactly `id`, `date`, `topicId`, `resourceId`, `planId`, `durationMinutes`, `completionPercent`, `reflection`, `createdAt`, and `updatedAt`.
- Keep V1.3 single-topic AI drafts, manual progress entry, progress editing, V1.3.1 date rules, topic archive protection, and V1.4 batch plans working.
- A generated queue contains 1–10 drafts in source order and exists only in page memory.
- Confirming or discarding one draft must not modify any other pending draft.
- A failed Provider call, validation error, or Local Storage write must preserve the existing queue and current form values.
- Keep `.gitignore` protections for `.env`, tokens, keys, secrets, and local configuration.
- Keep the page free of horizontal overflow at a 390px viewport.

## File Structure

- `src/mock-ai-provider.js`: deterministic description segmentation, per-segment parsing, context matching, and multi-draft Provider result.
- `src/ai-service.js`: replaceable Provider delegation and strict validation of the complete multi-draft result.
- `src/progress-draft-queue.js`: pure queue construction, immutable updates, removal/next-selection, and current missing-field calculation.
- `src/app.js`: queue lifecycle, form synchronization, rendering, navigation, isolated save/discard, regeneration, and existing-progress edit suspension.
- `index.html`: queue summary/list markup and queue module script loading.
- `src/styles.css`: selected card, status, responsive queue, and action layout.
- `tests/mock-ai-provider.test.cjs`: deterministic segmentation and association rules.
- `tests/ai-service.test.cjs`: plural interface and schema validation.
- `tests/progress-draft-queue.test.cjs`: pure queue-state behavior.
- `tests/ai-assisted-progress-page.test.cjs`: end-to-end queue behavior and V1.3 regression.
- `tests/manual-v1.5-multi-topic-ai-progress-draft-regression.md`: user-run acceptance checklist.
- `docs/project-status.md`: final implementation and verification status after automated tests pass.

---

### Task 1: Add deterministic multi-topic parsing to Mock Provider

**Files:**
- Modify: `src/mock-ai-provider.js:1-114`
- Modify: `tests/mock-ai-provider.test.cjs:1-end`

**Interfaces:**
- Consumes: `description`, `referenceDate`, and read-only `context` with `directions`, `topics`, `resources`, and `plans`.
- Produces: `MockAIProvider.generateProgressDrafts(request) -> Promise<{ drafts: ProviderDraftItem[], warnings: string[] }>`.
- `ProviderDraftItem`: `{ sourceText, suggestedDirection, draft, missingFields, warnings }`.

- [ ] **Step 1: Write failing tests for the approved two-topic example**

Add a context with an AI topic, a vocabulary topic, and one current-date plan per topic. The test must prove that word count is not parsed as minutes:

```js
test("Mock 按顺序生成 Codex 与雅思词汇两条草稿且不把单词数当时长", async () => {
  const result = await provider.generateProgressDrafts({
    description: "今天 Codex 学了40分钟，背了40个单词。",
    referenceDate: "2026-09-01",
    context: {
      directions: ["AI 学习", "雅思英语学习"],
      topics: [
        { id: "topic-codex", name: "Codex 实践", direction: "AI 学习", isArchived: false },
        { id: "topic-words", name: "词汇", direction: "雅思英语学习", isArchived: false },
      ],
      resources: [],
      plans: [
        { id: "plan-codex", date: "2026-09-01", topicId: "topic-codex", task: "练习 Codex" },
        { id: "plan-words", date: "2026-09-01", topicId: "topic-words", task: "背单词" },
      ],
    },
  });

  assert.equal(result.drafts.length, 2);
  assert.deepEqual(result.drafts.map((item) => item.suggestedDirection), ["AI 学习", "雅思英语学习"]);
  assert.deepEqual(result.drafts.map((item) => item.draft.topicId), ["topic-codex", "topic-words"]);
  assert.deepEqual(result.drafts.map((item) => item.draft.planId), ["plan-codex", "plan-words"]);
  assert.equal(result.drafts[0].draft.durationMinutes, 40);
  assert.equal(result.drafts[1].draft.durationMinutes, null);
  assert.equal(result.drafts[1].draft.reflection, "背了40个单词");
});
```

- [ ] **Step 2: Run the focused Provider test and verify the new interface is missing**

Run:

```powershell
node --test tests/mock-ai-provider.test.cjs
```

Expected: FAIL because `generateProgressDrafts` is not defined.

- [ ] **Step 3: Add source segmentation and direction-cue helpers**

Implement named helpers in `src/mock-ai-provider.js`:

```js
const MAX_PROGRESS_DRAFTS = 10;
const DIRECTION_CUES = [
  { direction: "AI 学习", pattern: /\b(?:Codex|ChatGPT|OpenAI|RAG|Prompt)\b|大模型/i },
  { direction: "雅思英语学习", pattern: /雅思|\bIELTS\b|单词|背词/i },
];

function detectSuggestedDirection(text, directions) {
  const exact = directions.filter((direction) => text.includes(direction));
  if (exact.length === 1) return exact[0];
  const cues = DIRECTION_CUES.filter((cue) => cue.pattern.test(text) && directions.includes(cue.direction));
  return cues.length === 1 ? cues[0].direction : null;
}

function splitDescriptionIntoSegments(description, context) {
  const normalized = description.replace(/\s+/g, " ").trim();
  const strongSegments = normalized.split(/[。；;！？!?\n]+/).map((item) => item.trim()).filter(Boolean);
  return strongSegments.flatMap((segment) => splitSegmentAtTopicChanges(segment, context));
}

function getSegmentSignal(text, context) {
  const activeTopics = context.topics.filter((topic) => topic && topic.isArchived !== true);
  const topicPick = pickLongest(activeTopics, text, (topic) => topic.name);
  if (topicPick.value) {
    return { topicId: topicPick.value.id, direction: topicPick.value.direction };
  }
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
```

This implementation only starts a new group when two resolved signals conflict. A same-topic resource/plan continuation or a signal-free explanation stays with the current segment.

- [ ] **Step 4: Add tests that preserve the V1.3 same-topic description**

```js
test("Mock 不把同主题资料和计划说明错误拆成多条", async () => {
  const description = "今天学习 Transformer 入门 45 分钟，使用注意力机制视频，完成看完第二章计划 70%。";
  const result = await provider.generateProgressDrafts({
    description,
    referenceDate: "2026-08-25",
    context,
  });
  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0].draft.topicId, "topic-transformer");
  assert.equal(result.drafts[0].draft.resourceId, "resource-attention-video");
  assert.equal(result.drafts[0].draft.planId, "plan-chapter-2");
});
```

- [ ] **Step 5: Refactor the existing single-draft parser into a per-segment parser**

Rename the internal parser and pass inherited date metadata explicitly:

```js
function parseProgressDraftSegment(sourceText, referenceDate, context, inheritedDate) {
  const warnings = [];
  const draft = {
    date: parseDate(sourceText, inheritedDate || referenceDate, warnings),
    topicId: null,
    resourceId: null,
    planId: null,
    durationMinutes: parseDurationMinutes(sourceText),
    completionPercent: parseCompletionPercent(sourceText, warnings),
    reflection: sourceText.slice(0, 500),
  };
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
```

Extract the existing duration and completion expressions without weakening their current token-boundary protections. `parseDurationMinutes()` must only consume explicit time units; `parseCompletionPercent()` must return `null` with a warning when more than one distinct legal percentage occurs in one segment.

```js
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

function parseSharedDate(description, referenceDate) {
  return parseDate(description, referenceDate, []);
}
```

- [ ] **Step 6: Implement topic, resource, and plan association priority**

Use these exact candidate stages:

```js
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
  let topic = pickLongest(activeTopics, sourceText, (item) => item.name).value;
  const activeTopicIds = new Set(activeTopics.map((item) => item.id));

  if (!topic) {
    const planTopicIds = [...new Set(context.plans
      .filter((plan) => plan && activeTopicIds.has(plan.topicId) && typeof plan.task === "string" && sourceText.includes(plan.task))
      .map((plan) => plan.topicId))];
    if (planTopicIds.length === 1) topic = activeTopics.find((item) => item.id === planTopicIds[0]);
  }
  if (!topic) {
    const resourceTopicIds = [...new Set(context.resources
      .filter((resource) => resource && activeTopicIds.has(resource.topicId) && typeof resource.title === "string" && sourceText.includes(resource.title))
      .map((resource) => resource.topicId))];
    if (resourceTopicIds.length === 1) topic = activeTopics.find((item) => item.id === resourceTopicIds[0]);
  }
  if (!topic && suggestedDirection) {
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
```

Topic resolution order must be: longest exact active topic name; unique explicit same-date plan across active topics; unique explicit resource title; suggested direction narrowing; the `单词`/`背词` to unique `词汇` topic synonym; unique active topic in the suggested direction. When no stage produces one candidate, leave `topicId` null.

- [ ] **Step 7: Add public plural generation and the 10-item limit**

```js
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
```

Temporarily retain the old `generateProgressDraft()` export unchanged so the existing page remains functional until Task 4 migrates it. Export both methods from the Mock Provider during Tasks 1–3.

- [ ] **Step 8: Add boundary, ambiguity, date inheritance, and immutability tests**

Cover all of these as named tests:

- strong punctuation and newline create ordered drafts;
- a comma only splits when the topic/direction changes;
- public “今天” is inherited by later segments;
- multiple same-date plans leave `planId` null;
- archived topics never match;
- a direction hint with multiple topics leaves `topicId` null but preserves `suggestedDirection`;
- `40个单词`, `20道题`, `3章`, and `2个视频` never become minutes;
- 11 segments return 10 drafts plus the truncation warning;
- request context remains deeply equal before and after generation.

- [ ] **Step 9: Run Provider tests and syntax check**

Run:

```powershell
node --test tests/mock-ai-provider.test.cjs
node --check src/mock-ai-provider.js
```

Expected: all Provider tests pass and syntax check exits with code 0.

- [ ] **Step 10: Commit the Provider change**

```powershell
git add -- src/mock-ai-provider.js tests/mock-ai-provider.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: generate multi-topic progress drafts"
```

Expected staged files: only the two Provider files above.

---

### Task 2: Validate the plural AI Service contract

**Files:**
- Modify: `src/ai-service.js:1-44`
- Modify: `tests/ai-service.test.cjs:1-end`

**Interfaces:**
- Consumes: a Provider implementing `generateProgressDrafts(request) -> Promise<unknown>`.
- Produces: `createAIService(provider)`, `validateProgressDraftsResult(result, allowedDirections)`, and `AIService.generateProgressDrafts(request)`.

- [ ] **Step 1: Replace the valid single-result fixture with a valid multi-result fixture**

```js
const validMultiResult = {
  drafts: [
    {
      sourceText: "Codex 学了40分钟",
      suggestedDirection: "AI 学习",
      draft: {
        date: "2026-09-01", topicId: "topic-codex", resourceId: null, planId: "plan-codex",
        durationMinutes: 40, completionPercent: null, reflection: "Codex 学了40分钟",
      },
      missingFields: ["resourceId", "completionPercent"],
      warnings: [],
    },
    {
      sourceText: "背了40个单词",
      suggestedDirection: "雅思英语学习",
      draft: {
        date: "2026-09-01", topicId: "topic-words", resourceId: null, planId: "plan-words",
        durationMinutes: null, completionPercent: null, reflection: "背了40个单词",
      },
      missingFields: ["resourceId", "durationMinutes", "completionPercent"],
      warnings: [],
    },
  ],
  warnings: [],
};
```

- [ ] **Step 2: Write failing delegation and validation tests**

```js
test("AI Service 异步委托多草稿 Provider", async () => {
  let received;
  const service = createAIService({
    async generateProgressDrafts(request) {
      received = request;
      return validMultiResult;
    },
  });
  const request = {
    description: "学习两项",
    referenceDate: "2026-09-01",
    context: { directions: ["AI 学习", "雅思英语学习"], topics: [], resources: [], plans: [] },
  };
  assert.deepEqual(await service.generateProgressDrafts(request), validMultiResult);
  assert.equal(received, request);
});
```

Run `node --test tests/ai-service.test.cjs` and expect failure because the Service still requires `generateProgressDraft`.

- [ ] **Step 3: Implement strict item and result validators**

```js
const PROVIDER_DRAFT_ITEM_KEYS = ["sourceText", "suggestedDirection", "draft", "missingFields", "warnings"];

function validateDraft(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)) invalidResult();
  const keys = Object.keys(draft);
  if (keys.length !== DRAFT_FIELDS.length || DRAFT_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(draft, field))) invalidResult();
  if (DRAFT_FIELDS.some((field) => !DRAFT_FIELD_RULES[field](draft[field]))) invalidResult();
}

function validateMissingFields(fields) {
  if (!Array.isArray(fields) || fields.some((field) => !DRAFT_FIELDS.includes(field))) invalidResult();
}

function validateWarnings(warnings) {
  if (!Array.isArray(warnings) || warnings.some((warning) => typeof warning !== "string")) invalidResult();
}

function validateProviderDraftItem(item, allowedDirections) {
  if (!item || typeof item !== "object" || Array.isArray(item)) invalidResult();
  const keys = Object.keys(item);
  if (keys.length !== PROVIDER_DRAFT_ITEM_KEYS.length || keys.some((key) => !PROVIDER_DRAFT_ITEM_KEYS.includes(key))) invalidResult();
  if (typeof item.sourceText !== "string" || !item.sourceText.trim() || item.sourceText.length > 500) invalidResult();
  if (item.suggestedDirection !== null && (!allowedDirections.includes(item.suggestedDirection))) invalidResult();
  validateDraft(item.draft);
  validateMissingFields(item.missingFields);
  validateWarnings(item.warnings);
  return item;
}

function validateProgressDraftsResult(result, allowedDirections = []) {
  if (!result || typeof result !== "object" || Array.isArray(result)) invalidResult();
  const keys = Object.keys(result);
  if (keys.length !== 2 || !keys.includes("drafts") || !keys.includes("warnings")) invalidResult();
  if (!Array.isArray(result.drafts) || result.drafts.length < 1 || result.drafts.length > 10) invalidResult();
  if (new Set(result.drafts).size !== result.drafts.length) invalidResult();
  result.drafts.forEach((item) => validateProviderDraftItem(item, allowedDirections));
  validateWarnings(result.warnings);
  return result;
}
```

Extract the current seven-field draft checks into `validateDraft`, and keep the current exact-key, integer, range, and 500-character rules.

- [ ] **Step 4: Switch Service construction to the plural Provider method**

```js
function createAIService(provider) {
  if (!provider || typeof provider.generateProgressDrafts !== "function") {
    throw new Error("AI Provider 未实现 generateProgressDrafts。");
  }
  return {
    async generateProgressDrafts(request) {
      const allowedDirections = Array.isArray(request?.context?.directions) ? request.context.directions : [];
      return validateProgressDraftsResult(await provider.generateProgressDrafts(request), allowedDirections);
    },
  };
}
```

For Tasks 2–3, retain a temporary `generateProgressDraft(request)` compatibility method only in the browser default service. It must delegate to `globalScope.MockAIProvider.generateProgressDraft(request)` and existing validation so the not-yet-migrated page continues to load.

```js
function createAIService(provider) {
  if (!provider || typeof provider.generateProgressDrafts !== "function") {
    throw new Error("AI Provider 未实现 generateProgressDrafts。");
  }
  const service = {
    async generateProgressDrafts(request) {
      const allowedDirections = Array.isArray(request?.context?.directions) ? request.context.directions : [];
      return validateProgressDraftsResult(await provider.generateProgressDrafts(request), allowedDirections);
    },
  };
  if (typeof provider.generateProgressDraft === "function") {
    service.generateProgressDraft = async (request) => validateProgressDraftResult(
      await provider.generateProgressDraft(request),
    );
  }
  return service;
}
```

Keep the current `validateProgressDraftResult` only for this migration adapter; Task 6 removes both together.

- [ ] **Step 5: Add invalid result tests**

Test rejection of:

- missing or wrong Provider method;
- zero drafts and 11 drafts;
- unknown top-level or item keys;
- empty/501-character `sourceText`;
- non-string or non-context `suggestedDirection`;
- repeated references to the same draft item;
- incomplete seven-field draft;
- zero minutes, completion over 100, and reflection over 500;
- unknown `missingFields` entries;
- non-string item or top-level warnings;
- Provider exceptions.

Also run the source in a VM with `window.MockAIProvider` and assert that `window.AIService.generateProgressDrafts` exists.

- [ ] **Step 6: Run Service and Provider tests**

```powershell
node --test tests/ai-service.test.cjs
node --test tests/mock-ai-provider.test.cjs
node --check src/ai-service.js
```

Expected: all tests pass and syntax check exits with code 0.

- [ ] **Step 7: Commit the Service contract**

```powershell
git add -- src/ai-service.js tests/ai-service.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: validate multi-draft AI results"
```

---

### Task 3: Add a pure progress draft queue module

**Files:**
- Create: `src/progress-draft-queue.js`
- Create: `tests/progress-draft-queue.test.cjs`

**Interfaces:**
- Consumes: validated Provider draft items and plain draft field values.
- Produces: `createProgressDraftQueueItems`, `updateProgressDraftQueueItem`, `removeProgressDraftQueueItem`, and `getCurrentProgressDraftMissingFields` through `window.ProgressDraftQueue` and Node exports.

- [ ] **Step 1: Write failing queue construction and immutable update tests**

Define the complete two-item fixture in `tests/progress-draft-queue.test.cjs`:

```js
const providerDrafts = [
  {
    sourceText: "Codex 学了40分钟",
    suggestedDirection: "AI 学习",
    draft: {
      date: "2026-09-01", topicId: "topic-codex", resourceId: null, planId: "plan-codex",
      durationMinutes: 40, completionPercent: null, reflection: "Codex 学了40分钟",
    },
    missingFields: ["resourceId", "completionPercent"],
    warnings: [],
  },
  {
    sourceText: "背了40个单词",
    suggestedDirection: "雅思英语学习",
    draft: {
      date: "2026-09-01", topicId: "topic-words", resourceId: null, planId: "plan-words",
      durationMinutes: null, completionPercent: null, reflection: "背了40个单词",
    },
    missingFields: ["resourceId", "durationMinutes", "completionPercent"],
    warnings: [],
  },
];
```

```js
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
  assert.deepEqual(updated[1], items[1]);
});
```

- [ ] **Step 2: Run the new test and verify the module is missing**

Run `node --test tests/progress-draft-queue.test.cjs`.

Expected: FAIL because `src/progress-draft-queue.js` does not exist.

- [ ] **Step 3: Implement queue item construction and immutable updates**

```js
(function attachProgressDraftQueue(globalScope) {
  const REQUIRED_FIELDS = ["date", "topicId", "durationMinutes", "completionPercent"];

  function cloneDraft(draft) {
    return {
      date: draft.date,
      topicId: draft.topicId,
      resourceId: draft.resourceId,
      planId: draft.planId,
      durationMinutes: draft.durationMinutes,
      completionPercent: draft.completionPercent,
      reflection: draft.reflection,
    };
  }

  function createProgressDraftQueueItems(drafts, generationId) {
    return drafts.map((item, index) => ({
      id: `progress-draft-${generationId}-${index + 1}`,
      sourceText: item.sourceText,
      suggestedDirection: item.suggestedDirection,
      draft: cloneDraft(item.draft),
      providerMissingFields: item.missingFields.slice(),
      warnings: item.warnings.slice(),
    }));
  }

  function updateProgressDraftQueueItem(items, itemId, nextDraft) {
    return items.map((item) => item.id === itemId ? { ...item, draft: cloneDraft(nextDraft) } : item);
  }

  const api = { createProgressDraftQueueItems, updateProgressDraftQueueItem };
  globalScope.ProgressDraftQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: Write removal and next-selection tests**

```js
test("移除当前项后优先选择原位置下一条否则选择上一条", () => {
  const items = queue.createProgressDraftQueueItems(providerDrafts, 1);
  const firstRemoved = queue.removeProgressDraftQueueItem(items, items[0].id);
  assert.equal(firstRemoved.nextActiveId, items[1].id);
  const lastRemoved = queue.removeProgressDraftQueueItem(items, items[1].id);
  assert.equal(lastRemoved.nextActiveId, items[0].id);
  const empty = queue.removeProgressDraftQueueItem([items[0]], items[0].id);
  assert.deepEqual(empty, { items: [], nextActiveId: "" });
});
```

Implement:

```js
function removeProgressDraftQueueItem(items, itemId) {
  const index = items.findIndex((item) => item.id === itemId);
  if (index < 0) return { items: items.slice(), nextActiveId: "" };
  const nextItems = items.filter((item) => item.id !== itemId);
  const nextItem = nextItems[index] || nextItems[index - 1] || null;
  return { items: nextItems, nextActiveId: nextItem?.id || "" };
}
```

- [ ] **Step 5: Recompute current missing fields from edited values**

```js
  function getCurrentProgressDraftMissingFields(draft) {
  return REQUIRED_FIELDS.filter((field) => {
    const value = draft[field];
    return value === null || value === "" || value === undefined;
  });
}
```

Test that adding topic, duration, and completion clears those current missing fields without changing `providerMissingFields`.

Update the exported API after all four functions exist:

```js
const api = {
  createProgressDraftQueueItems,
  updateProgressDraftQueueItem,
  removeProgressDraftQueueItem,
  getCurrentProgressDraftMissingFields,
};
```

- [ ] **Step 6: Run queue tests and syntax check**

```powershell
node --test tests/progress-draft-queue.test.cjs
node --check src/progress-draft-queue.js
```

Expected: all queue tests pass and syntax check exits with code 0.

- [ ] **Step 7: Commit the queue module**

```powershell
git add -- src/progress-draft-queue.js tests/progress-draft-queue.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: add progress draft queue state"
```

---

### Task 4: Render and navigate the draft queue with the existing form

**Files:**
- Modify: `index.html:274-333, script loading near end of body`
- Modify: `src/app.js:137-164, 240-261, 470-478, 1705-1836`
- Modify: `src/styles.css`
- Modify: `tests/ai-assisted-progress-page.test.cjs`

**Interfaces:**
- Consumes: `window.AIService.generateProgressDrafts()` and `window.ProgressDraftQueue`.
- Produces: `applyProgressDraftsResult`, `renderProgressDraftQueue`, `selectProgressDraft`, `syncActiveProgressDraftFromForm`, and `loadActiveProgressDraftIntoForm`.

- [ ] **Step 1: Add a failing page test for ordered queue generation and navigation**

Extend the fixture with Codex and vocabulary topics plus one current-date plan per topic. Add:

```js
function multiTopicFixture({ progress = [] } = {}) {
  const today = getLocalToday();
  return {
    "personal-learning-system-topics": [
      { id: "topic-codex", name: "Codex 实践", direction: "AI 学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
      { id: "topic-words", name: "词汇", direction: "雅思英语学习", parentId: "", description: "", status: "学习中", createdAt: today, updatedAt: today },
    ],
    "personal-learning-system-directions": ["AI 学习", "雅思英语学习"],
    "personal-learning-system-resources": [],
    "personal-learning-system-plans": [
      { id: "plan-codex", date: today, topicId: "topic-codex", resourceId: null, task: "练习 Codex", priority: "中", estimatedMinutes: 40, isCompleted: false, isBackfilled: false, createdAt: `${today}T00:00:00.000Z` },
      { id: "plan-words", date: today, topicId: "topic-words", resourceId: null, task: "背单词", priority: "中", estimatedMinutes: 25, isCompleted: false, isBackfilled: false, createdAt: `${today}T00:00:00.000Z` },
    ],
    "personal-learning-system-notes": [],
    [progressStorageKey]: progress,
  };
}

async function generateTwoDrafts(page) {
  await page.locator("#aiProgressDescription").fill("今天 Codex 学了40分钟，背了40个单词。");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 2 条，待处理 2 条").waitFor();
}

test("多主题描述生成有序队列并在切换时保留各自修改", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await page.locator("#aiProgressDescription").fill("今天 Codex 学了40分钟，背了40个单词。");
  await page.locator("#generateProgressDraftButton").click();
  await page.getByText("共 2 条，待处理 2 条").waitFor();

  const cards = page.locator("[data-progress-draft-id]");
  assert.equal(await cards.count(), 2);
  assert.match(await cards.nth(0).textContent(), /Codex/);
  assert.match(await cards.nth(1).textContent(), /单词/);

  await page.locator("#progressCompletion").fill("70");
  await cards.nth(1).getByRole("button").click();
  await page.locator("#progressDuration").fill("25");
  await page.locator("#progressCompletion").fill("80");
  await cards.nth(0).getByRole("button").click();
  assert.equal(await page.locator("#progressDuration").inputValue(), "40");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "70");
  assert.deepEqual(pageErrors, []);
});
```

- [ ] **Step 2: Run the focused page test and verify the queue is absent**

Run:

```powershell
node --test --test-concurrency=1 tests/ai-assisted-progress-page.test.cjs
```

Expected: FAIL because queue markup and plural page flow do not exist.

- [ ] **Step 3: Add queue markup and load the queue module**

Inside `#aiProgressPanel`, after `#aiProgressWarnings`, add:

```html
<section id="progressDraftQueuePanel" class="progress-draft-queue hidden" aria-labelledby="progressDraftQueueTitle">
  <div class="progress-draft-queue-heading">
    <h3 id="progressDraftQueueTitle">待确认草稿</h3>
    <p id="progressDraftQueueSummary"></p>
  </div>
  <div id="progressDraftQueueList" class="progress-draft-queue-list"></div>
</section>
```

Load scripts in this order:

```html
<script src="src/data-model.js"></script>
<script src="src/mock-ai-provider.js"></script>
<script src="src/ai-service.js"></script>
<script src="src/progress-draft-queue.js"></script>
<script src="src/app.js"></script>
```

At app startup, throw `草稿队列模块加载失败，请刷新页面后重试。` if `window.ProgressDraftQueue` is absent.

- [ ] **Step 4: Add page state and DOM references**

```js
let progressDraftQueue = [];
let activeProgressDraftId = "";
let progressDraftGenerationId = 0;
let suspendedProgressDraftId = "";
let progressDraftQueueWarnings = [];

const progressDraftQueuePanel = document.querySelector("#progressDraftQueuePanel");
const progressDraftQueueSummary = document.querySelector("#progressDraftQueueSummary");
const progressDraftQueueList = document.querySelector("#progressDraftQueueList");
```

Replace `isProgressDraftActive` checks with `Boolean(activeProgressDraftId)` where they mean “the form currently edits a queue item.” Keep `isProgressDraftGenerating` and `progressDraftRequestToken` for request races.

- [ ] **Step 5: Change generation to call the plural Service method**

```js
const result = await window.AIService.generateProgressDrafts({
  description,
  referenceDate: getToday(),
  context: { directions: learningDirections, topics: getActiveTopics(), resources, plans },
});
if (requestToken !== progressDraftRequestToken) return;
applyProgressDraftsResult(result);
```

`applyProgressDraftsResult` must replace the queue only after the complete result is available:

```js
function applyProgressDraftsResult(result) {
  progressDraftGenerationId += 1;
  progressDraftQueue = window.ProgressDraftQueue.createProgressDraftQueueItems(result.drafts, progressDraftGenerationId);
  progressDraftQueueWarnings = result.warnings.slice();
  activeProgressDraftId = progressDraftQueue[0].id;
  suspendedProgressDraftId = "";
  renderProgressDraftQueue();
  loadActiveProgressDraftIntoForm();
}
```

- [ ] **Step 6: Implement form-to-queue synchronization**

```js
function readProgressDraftFromForm() {
  return {
    date: progressDate.value || null,
    topicId: progressTopicSelect.value || null,
    resourceId: progressResourceSelect.value || null,
    planId: progressPlanSelect.value || null,
    durationMinutes: progressDuration.value === "" ? null : Number(progressDuration.value),
    completionPercent: progressCompletion.value === "" ? null : Number(progressCompletion.value),
    reflection: progressReflection.value,
  };
}

function syncActiveProgressDraftFromForm() {
  if (!activeProgressDraftId) return;
  progressDraftQueue = window.ProgressDraftQueue.updateProgressDraftQueueItem(
    progressDraftQueue,
    activeProgressDraftId,
    readProgressDraftFromForm(),
  );
}
```

Listen to both `input` and `change` on `progressForm`. After topic/date changes invoke existing association option refresh first, then synchronize the resulting legal values and call `renderProgressDraftQueue()` so the active card’s missing-field status updates immediately.

- [ ] **Step 7: Implement queue rendering and selection**

Render buttons with `data-progress-draft-id`, `aria-current`, source text, suggested direction/topic, duration, completion, and current required-field status. Use DOM element creation or `escapeHtml` for every user-controlled value.

```js
function renderProgressDraftQueue() {
  const hasQueue = progressDraftQueue.length > 0;
  progressDraftQueuePanel.classList.toggle("hidden", !hasQueue);
  progressDraftQueueSummary.textContent = hasQueue
    ? `共 ${progressDraftQueue.length} 条，待处理 ${progressDraftQueue.length} 条`
    : "";
  progressDraftQueueList.innerHTML = progressDraftQueue.map((item, index) => {
    const topic = topics.find((candidate) => candidate.id === item.draft.topicId);
    const label = topic ? getTopicPath(topic) : item.suggestedDirection || "主题待选择";
    const missing = window.ProgressDraftQueue.getCurrentProgressDraftMissingFields(item.draft);
    const isActive = item.id === activeProgressDraftId;
    return `
      <article class="progress-draft-card${isActive ? " is-active" : ""}" data-progress-draft-id="${escapeHtml(item.id)}">
        <button type="button" data-select-progress-draft="${escapeHtml(item.id)}" aria-current="${isActive ? "true" : "false"}" aria-label="编辑第 ${index + 1} 条草稿：${escapeHtml(label)}">
          <strong>第 ${index + 1} 条 · ${escapeHtml(label)}</strong>
          <span>${escapeHtml(item.sourceText)}</span>
          <span class="progress-draft-card-status">${missing.length ? `还需补充 ${missing.length} 项` : "必填项完整"}</span>
        </button>
      </article>`;
  }).join("");
  const active = progressDraftQueue.find((item) => item.id === activeProgressDraftId);
  const activeMissing = active
    ? window.ProgressDraftQueue.getCurrentProgressDraftMissingFields(active.draft)
    : [];
  const feedback = [
    ...progressDraftQueueWarnings,
    ...(active?.warnings || []),
    ...(activeMissing.length ? [`当前草稿还需补充 ${activeMissing.length} 个必填字段。`] : []),
  ];
  aiProgressWarnings.innerHTML = "";
  feedback.forEach((warning) => {
    const item = document.createElement("li");
    item.textContent = warning;
    aiProgressWarnings.appendChild(item);
  });
  aiProgressWarnings.classList.toggle("hidden", feedback.length === 0);
}

function selectProgressDraft(itemId) {
  if (!progressDraftQueue.some((item) => item.id === itemId) || itemId === activeProgressDraftId) return;
  syncActiveProgressDraftFromForm();
  activeProgressDraftId = itemId;
  loadActiveProgressDraftIntoForm();
  renderProgressDraftQueue();
}
```

`loadActiveProgressDraftIntoForm()` follows the existing V1.3 association order:

```js
function loadActiveProgressDraftIntoForm() {
  const item = progressDraftQueue.find((candidate) => candidate.id === activeProgressDraftId);
  if (!item) return;
  const draft = item.draft;
  editingProgressId = "";
  progressForm.reset();
  progressDate.max = getToday();
  progressDate.value = draft.date || "";
  updateProgressTopicOptions({ allowEmpty: draft.topicId === null });
  if (draft.topicId && [...progressTopicSelect.options].some((option) => option.value === draft.topicId)) {
    progressTopicSelect.value = draft.topicId;
  }
  updateProgressRelatedOptions();
  if (draft.resourceId && [...progressResourceSelect.options].some((option) => option.value === draft.resourceId)) {
    progressResourceSelect.value = draft.resourceId;
  }
  if (draft.planId && [...progressPlanSelect.options].some((option) => option.value === draft.planId)) {
    progressPlanSelect.value = draft.planId;
  }
  progressDuration.value = draft.durationMinutes ?? "";
  progressCompletion.value = draft.completionPercent ?? "";
  progressReflection.value = draft.reflection;
  progressSubmitButton.textContent = "确认并保存此条";
  discardProgressDraftButton.textContent = "放弃此条";
  discardProgressDraftButton.classList.remove("hidden");
}
```

- [ ] **Step 8: Add accessible and responsive styles**

Create styles for:

- `.progress-draft-queue`, `.progress-draft-queue-list`, and `.progress-draft-card`;
- `.progress-draft-card.is-active` with a visible border/background that does not rely on color alone;
- `.progress-draft-card-status` and missing-field text;
- wrapping long source text;
- 390px single-column cards and full-width action buttons;
- `min-width: 0` on queue/grid children.

- [ ] **Step 9: Update the single-topic V1.3 regression test**

The existing full V1.3 description must now assert one queue item and `确认并保存此条`, while preserving the existing topic/resource/plan/duration/completion values and “not saved before confirmation” assertion.

- [ ] **Step 10: Run page, module, and syntax tests**

```powershell
node --test tests/progress-draft-queue.test.cjs
node --test tests/mock-ai-provider.test.cjs
node --test tests/ai-service.test.cjs
node --test --test-concurrency=1 tests/ai-assisted-progress-page.test.cjs
node --check src/progress-draft-queue.js
node --check src/app.js
```

Expected: queue tests and migrated page tests pass with no page errors.

- [ ] **Step 11: Commit queue rendering and navigation**

```powershell
git add -- index.html src/app.js src/styles.css tests/ai-assisted-progress-page.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: render progress draft queue"
```

---

### Task 5: Save and discard one queue item without affecting the rest

**Files:**
- Modify: `src/app.js:598-687, 1815-1880`
- Modify: `tests/ai-assisted-progress-page.test.cjs`

**Interfaces:**
- Consumes: active queue item synchronized from the existing form.
- Produces: `removeActiveProgressDraft`, `finishProgressDraftQueue`, and storage-safe current-item confirmation.

- [ ] **Step 1: Write a failing isolated-save test**

```js
test("保存第一条只新增一条记录并完整保留第二条草稿", async (t) => {
  const { page, pageErrors } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.locator("#progressCompletion").fill("70");
  const secondBefore = await page.locator("[data-progress-draft-id]").nth(1).textContent();
  await page.getByRole("button", { name: "确认并保存此条" }).click();

  const saved = await getStoredProgress(page);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].topicId, "topic-codex");
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 1);
  assert.equal(await page.locator("[data-progress-draft-id]").nth(0).textContent(), secondBefore);
  assert.equal(await page.locator("#progressTopic").inputValue(), "topic-words");
  assert.equal(await page.locator("#progressDuration").inputValue(), "");
  assert.equal(await page.locator("#progressCompletion").inputValue(), "");
  assert.deepEqual(pageErrors, []);
});
```

- [ ] **Step 2: Run the isolated-save test and verify the current reset clears the queue incorrectly**

Run the focused page file and expect failure in queue count or active item restoration.

- [ ] **Step 3: Make progress persistence storage-safe**

In the progress submit handler, compute a new array without replacing `progressRecords` first:

```js
const nextProgressRecords = isEditing
  ? progressRecords.map((progress) => progress.id === editingProgressId ? updatedProgress : progress)
  : [newProgress, ...progressRecords];

try {
  saveItems(PROGRESS_STORAGE_KEY, nextProgressRecords);
} catch {
  progressSaveMessage.textContent = "进度保存失败，请检查浏览器存储后重试。";
  return;
}

progressRecords = nextProgressRecords;
```

Keep the existing validation before record construction. Disable `progressSubmitButton` during persistence and restore it in `finally` so duplicate clicks cannot create two records.

- [ ] **Step 4: Remove only the confirmed queue item after a successful write**

```js
function removeActiveProgressDraft() {
  const result = window.ProgressDraftQueue.removeProgressDraftQueueItem(progressDraftQueue, activeProgressDraftId);
  progressDraftQueue = result.items;
  activeProgressDraftId = result.nextActiveId;
  if (!activeProgressDraftId) {
    finishProgressDraftQueue();
    return;
  }
  renderProgressDraftQueue();
  loadActiveProgressDraftIntoForm();
}
```

Call this only when the submitted form represented a queue item and Local Storage succeeded. Do not call the old `clearProgressDraftState()` for a partial queue save.

- [ ] **Step 5: Add failing validation and storage failure tests**

Cover:

- first draft missing completion blocks save and preserves both drafts;
- a topic archived after generation blocks only the active save and preserves both drafts;
- a replaced `localStorage.setItem` throwing an error leaves storage, in-memory rendered records, queue order, current ID, and form values unchanged;
- double-clicking submit creates exactly one record.

- [ ] **Step 6: Implement per-item discard with confirmation**

```js
function discardActiveProgressDraft() {
  if (!activeProgressDraftId) return;
  const current = progressDraftQueue.find((item) => item.id === activeProgressDraftId);
  if (!current || !window.confirm(`放弃这条未保存草稿吗？\n${current.sourceText}`)) return;
  removeActiveProgressDraft();
  progressSaveMessage.textContent = activeProgressDraftId ? "当前草稿已放弃，其他草稿仍保留。" : "草稿队列已处理完毕。";
}
```

Test both confirm `false` and confirm `true`. Confirming must not write progress storage.

- [ ] **Step 7: Finish the queue only when it becomes empty**

```js
function finishProgressDraftQueue() {
  progressDraftQueue = [];
  activeProgressDraftId = "";
  suspendedProgressDraftId = "";
  aiProgressDescription.value = "";
  progressDraftQueueList.innerHTML = "";
  progressDraftQueuePanel.classList.add("hidden");
  discardProgressDraftButton.classList.add("hidden");
  resetProgressForm();
}
```

Do not call this while any item remains.

- [ ] **Step 8: Run focused and full progress tests**

```powershell
node --test tests/progress-draft-queue.test.cjs
node --test --test-concurrency=1 tests/ai-assisted-progress-page.test.cjs
node --check src/app.js
```

Expected: isolated save/discard, failed save, duplicate click, and previous V1.3 page tests pass.

- [ ] **Step 9: Commit isolated save and discard**

```powershell
git add -- src/app.js tests/ai-assisted-progress-page.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "feat: confirm progress drafts independently"
```

---

### Task 6: Preserve queues across regeneration, races, and existing-progress editing

**Files:**
- Modify: `src/app.js:1705-1880`
- Modify: `tests/ai-assisted-progress-page.test.cjs`
- Modify: `src/mock-ai-provider.js`
- Modify: `src/ai-service.js`
- Modify: `tests/mock-ai-provider.test.cjs`
- Modify: `tests/ai-service.test.cjs`

**Interfaces:**
- Consumes: active queue synchronization, request tokens, existing progress edit lifecycle.
- Produces: non-destructive regeneration, suspended queue restoration, and the final plural-only Provider/Service interface.

- [ ] **Step 1: Write regeneration safety tests**

Test three paths:

```js
test("队列非空时取消重新生成不会调用 Service", async (t) => {
  const { page } = await startPage(t, multiTopicFixture());
  await generateTwoDrafts(page);
  await page.evaluate(() => {
    window.confirm = () => false;
    window.__generateCalls = 0;
    const original = window.AIService.generateProgressDrafts;
    window.AIService.generateProgressDrafts = async (...args) => {
      window.__generateCalls += 1;
      return original(...args);
    };
  });
  await page.locator("#generateProgressDraftButton").click();
  assert.equal(await page.evaluate(() => window.__generateCalls), 0);
  assert.equal(await page.locator("[data-progress-draft-id]").count(), 2);
});
```

Also test confirmed regeneration success replaces the queue once, and confirmed regeneration failure preserves the old queue plus current form edits.

- [ ] **Step 2: Implement confirmation without clearing the old queue early**

At the start of generation:

```js
if (progressDraftQueue.length && !window.confirm("重新生成会替换全部未确认草稿，是否继续？")) {
  return;
}
syncActiveProgressDraftFromForm();
```

Do not clear `progressDraftQueue` before awaiting the Service. `applyProgressDraftsResult()` performs the successful replacement. The catch branch only displays the error.

- [ ] **Step 3: Keep stale results from overwriting a newer queue**

Retain `progressDraftRequestToken`; increment it when saving, discarding, entering existing-record edit, and starting a newer generation. Add controlled Promise tests for stale resolve and stale reject after each of those state transitions.

- [ ] **Step 4: Write existing-progress edit suspension tests**

Generate two drafts, edit both, enter an existing progress record, and assert:

- AI queue and generation controls are hidden during existing edit;
- editing and saving the existing record only updates that record;
- after save or cancel, both queue drafts return in the same order;
- the same active draft and its modified form values return;
- no queue item is saved or removed.

- [ ] **Step 5: Implement queue suspension and restoration**

```js
function suspendProgressDraftQueue() {
  syncActiveProgressDraftFromForm();
  suspendedProgressDraftId = activeProgressDraftId;
  activeProgressDraftId = "";
  aiProgressPanel.classList.add("hidden");
}

function restoreProgressDraftQueue() {
  aiProgressPanel.classList.remove("hidden");
  if (!progressDraftQueue.length) return;
  activeProgressDraftId = progressDraftQueue.some((item) => item.id === suspendedProgressDraftId)
    ? suspendedProgressDraftId
    : progressDraftQueue[0].id;
  suspendedProgressDraftId = "";
  renderProgressDraftQueue();
  loadActiveProgressDraftIntoForm();
}
```

Call suspension from `startProgressEditing()`. After existing edit save or cancel, call restoration instead of resetting the AI state.

- [ ] **Step 6: Add deleted association and midnight tests**

Cover:

- deleting a queued draft’s resource clears only that queued association when loaded;
- deleting a queued draft’s plan clears only that queued association when loaded;
- a draft generated before midnight retains its original date after the simulated day changes;
- a new generation after midnight uses the new local date;
- existing progress save validation still accepts the now-historical first draft date.

- [ ] **Step 7: Remove the temporary single-draft interface**

After all page calls use `generateProgressDrafts`, remove `generateProgressDraft` from `MockAIProvider`, `AIService`, and their tests. Search must return no business-code calls:

```powershell
rg -n "generateProgressDraft\(" src tests
```

Expected: no old method call remains. `generateProgressDrafts` references remain.

- [ ] **Step 8: Run all AI and page regressions**

```powershell
node --test tests/mock-ai-provider.test.cjs
node --test tests/ai-service.test.cjs
node --test tests/progress-draft-queue.test.cjs
node --test --test-concurrency=1 tests/ai-assisted-progress-page.test.cjs
node --check src/mock-ai-provider.js
node --check src/ai-service.js
node --check src/progress-draft-queue.js
node --check src/app.js
```

Expected: all focused tests pass; no syntax errors or unhandled page errors.

- [ ] **Step 9: Commit lifecycle compatibility and interface cleanup**

```powershell
git add -- src/app.js src/mock-ai-provider.js src/ai-service.js tests/ai-assisted-progress-page.test.cjs tests/mock-ai-provider.test.cjs tests/ai-service.test.cjs
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: preserve progress draft queues across workflows"
```

---

### Task 7: Complete full regression, security checks, and acceptance documentation

**Files:**
- Create: `tests/manual-v1.5-multi-topic-ai-progress-draft-regression.md`
- Modify: `docs/v1.5-multi-topic-ai-progress-draft-requirements.md`
- Modify: `docs/project-status.md`

**Interfaces:**
- Consumes: completed implementation and actual automated verification output.
- Produces: reproducible user acceptance steps and an evidence-based project status update.

- [ ] **Step 1: Create the manual acceptance checklist**

The checklist must begin with a warning to use an isolated Edge profile or dedicated test Local Storage. Include the 12 scenarios from the spec and explicit expected storage counts before and after each save/discard.

The primary scenario must use:

```text
今天 Codex 学了40分钟，背了40个单词。
```

It must verify two ordered drafts, `40` AI minutes, blank vocabulary minutes, blank completion values, independent edits, one-record save, remaining queue preservation, and no record on discard.

- [ ] **Step 2: Run focused module tests**

```powershell
node --test tests/data-model.test.cjs
node --test tests/mock-ai-provider.test.cjs
node --test tests/ai-service.test.cjs
node --test tests/progress-draft-queue.test.cjs
```

Expected: all module tests pass with 0 failures and 0 skips.

- [ ] **Step 3: Run page files serially to avoid competing Edge instances**

```powershell
node --test --test-concurrency=1 tests/ai-assisted-progress-page.test.cjs
node --test --test-concurrency=1 tests/batch-today-plans-page.test.cjs
node --test --test-concurrency=1 tests/plan-date-validation-page.test.cjs
node --test --test-concurrency=1 tests/custom-learning-directions-page.test.cjs
node --test --test-concurrency=1 tests/topic-governance-page.test.cjs
```

Expected: every page test passes, no browser page error is collected, and no file reports a failure.

- [ ] **Step 4: Run the final full test and syntax suite**

```powershell
npm test
node --check src/data-model.js
node --check src/mock-ai-provider.js
node --check src/ai-service.js
node --check src/progress-draft-queue.js
node --check src/app.js
git diff --check
git status --short
```

Expected: the actual full test count passes with 0 failures and 0 skips; all syntax checks exit 0; diff check has no output; only final documentation is uncommitted.

- [ ] **Step 5: Verify data shape, no real API, and secret protection**

```powershell
rg -n -i "api[_-]?key|authorization|bearer|fetch\(|api\.openai|deepseek" src index.html
rg -n "learningContent|batchId|suggestedDirection|providerMissingFields|sourceText" src/app.js src/data-model.js
git diff -- .gitignore package.json
git status --short
```

Expected:

- no real API or credential pattern in business source;
- queue metadata appears only in transient queue handling, never in the saved progress object;
- no `learningContent` or `batchId` in saved progress construction;
- `.gitignore` and `package.json` have no changes;
- no `.env`, token, key, secret, log, temporary profile, or browser data is staged.

- [ ] **Step 6: Update requirements and project status with actual evidence**

Only after automated verification passes:

- change the requirement status to “开发完成，自动测试通过，待用户本地验收”;
- record the actual total, focused, and page test counts from this run;
- state that the queue is transient, records remain independent, and no real API exists;
- keep user acceptance explicitly “待执行” until the user confirms it;
- add V1.5 under the current project status without rewriting V1.3, V1.3.1, or V1.4 history.

- [ ] **Step 7: Commit final documentation**

```powershell
git add -- tests/manual-v1.5-multi-topic-ai-progress-draft-regression.md docs/v1.5-multi-topic-ai-progress-draft-requirements.md docs/project-status.md
git diff --cached --check
git diff --cached --name-only
git commit -m "docs: record multi-topic progress draft verification"
```

Expected staged files: only the three documentation files above.

- [ ] **Step 8: Perform final branch and scope review**

```powershell
git status --short --branch
git log --oneline -10
git diff master...HEAD --name-only
git diff master...HEAD -- .gitignore package.json
```

Expected:

- branch is `codex/v1.5-multi-topic-ai-progress-drafts`;
- working tree is clean;
- commits are separated by Provider, Service, queue state, page queue, isolated confirmation, lifecycle compatibility, and documentation;
- `.gitignore` and `package.json` have no branch changes;
- no push, merge, or pull request has occurred without explicit user instruction.

## Plan Self-Review Results

- **Spec coverage:** Provider segmentation, Service validation, queue state, ordered UI, independent save/discard, regeneration, race protection, existing edit suspension, persistence safety, compatibility, security, responsive layout, and documentation each map to Tasks 1–7.
- **Placeholder scan:** No deferred requirements or unspecified implementation steps remain.
- **Type consistency:** The Provider and Service use `generateProgressDrafts`; queue items use `providerMissingFields`; saved progress records use only the existing ten fields; temporary single-method compatibility is removed in Task 6.
