(function attachAIService(globalScope) {
  const DRAFT_FIELDS = ["date", "topicId", "resourceId", "planId", "durationMinutes", "completionPercent", "reflection"];
  const DRAFT_FIELD_RULES = {
    date: (value) => value === null || typeof value === "string",
    topicId: (value) => value === null || typeof value === "string",
    resourceId: (value) => value === null || typeof value === "string",
    planId: (value) => value === null || typeof value === "string",
    durationMinutes: (value) => value === null || (Number.isInteger(value) && value > 0),
    completionPercent: (value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 100),
    reflection: (value) => typeof value === "string" && value.length <= 500,
  };
  const INVALID_RESULT_MESSAGE = "AI Provider 返回了无效的学习进度草稿。";

  function invalidResult() {
    throw new Error(INVALID_RESULT_MESSAGE);
  }

  function validateProgressDraftResult(result) {
    if (!result || typeof result !== "object" || Array.isArray(result)) invalidResult();
    const resultKeys = Object.keys(result);
    if (resultKeys.length !== 3 || ["draft", "missingFields", "warnings"].some((field) => !Object.prototype.hasOwnProperty.call(result, field))) invalidResult();
    const draft = result.draft;
    if (!draft || typeof draft !== "object" || Array.isArray(draft)) invalidResult();
    const draftKeys = Object.keys(draft);
    if (draftKeys.length !== DRAFT_FIELDS.length || DRAFT_FIELDS.some((field) => !Object.prototype.hasOwnProperty.call(draft, field))) invalidResult();
    if (DRAFT_FIELDS.some((field) => !DRAFT_FIELD_RULES[field](draft[field]))) invalidResult();
    if (!Array.isArray(result.missingFields) || result.missingFields.some((field) => !DRAFT_FIELDS.includes(field))) invalidResult();
    if (!Array.isArray(result.warnings) || result.warnings.some((warning) => typeof warning !== "string")) invalidResult();
    return result;
  }

  function createAIService(provider) {
    if (!provider || typeof provider.generateProgressDraft !== "function") {
      throw new Error("AI Provider 未实现 generateProgressDraft。");
    }
    return {
      async generateProgressDraft(request) {
        return validateProgressDraftResult(await provider.generateProgressDraft(request));
      },
    };
  }

  if (globalScope.MockAIProvider) globalScope.AIService = createAIService(globalScope.MockAIProvider);
  if (typeof module !== "undefined" && module.exports) module.exports = { createAIService, validateProgressDraftResult };
})(typeof window !== "undefined" ? window : globalThis);
