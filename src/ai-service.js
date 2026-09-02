(function attachAIService(globalScope) {
  const DRAFT_FIELDS = ["date", "topicId", "resourceId", "planId", "durationMinutes", "completionPercent", "reflection"];
  const PROVIDER_DRAFT_ITEM_KEYS = ["sourceText", "suggestedDirection", "draft", "missingFields", "warnings"];
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
    if (keys.length !== PROVIDER_DRAFT_ITEM_KEYS.length || PROVIDER_DRAFT_ITEM_KEYS.some((key) => !Object.prototype.hasOwnProperty.call(item, key))) invalidResult();
    if (typeof item.sourceText !== "string" || !item.sourceText.trim() || item.sourceText.length > 500) invalidResult();
    if (item.suggestedDirection !== null
      && (typeof item.suggestedDirection !== "string" || !allowedDirections.includes(item.suggestedDirection))) invalidResult();
    validateDraft(item.draft);
    validateMissingFields(item.missingFields);
    validateWarnings(item.warnings);
    return item;
  }

  function validateProgressDraftsResult(result, allowedDirections = []) {
    if (!result || typeof result !== "object" || Array.isArray(result)) invalidResult();
    const keys = Object.keys(result);
    if (keys.length !== 2 || !Object.prototype.hasOwnProperty.call(result, "drafts") || !Object.prototype.hasOwnProperty.call(result, "warnings")) invalidResult();
    if (!Array.isArray(result.drafts) || result.drafts.length < 1 || result.drafts.length > 10) invalidResult();
    if (new Set(result.drafts).size !== result.drafts.length) invalidResult();
    const directions = Array.isArray(allowedDirections) ? allowedDirections.filter((item) => typeof item === "string") : [];
    result.drafts.forEach((item) => validateProviderDraftItem(item, directions));
    validateWarnings(result.warnings);
    return result;
  }

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

  if (globalScope.MockAIProvider) globalScope.AIService = createAIService(globalScope.MockAIProvider);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createAIService, validateProgressDraftsResult };
  }
})(typeof window !== "undefined" ? window : globalThis);
