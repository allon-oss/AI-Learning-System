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
    return items.map((item) => (item.id === itemId
      ? { ...item, draft: cloneDraft(nextDraft) }
      : item));
  }

  function removeProgressDraftQueueItem(items, itemId) {
    const index = items.findIndex((item) => item.id === itemId);
    if (index < 0) return { items: items.slice(), nextActiveId: "" };
    const nextItems = items.filter((item) => item.id !== itemId);
    const nextItem = nextItems[index] || nextItems[index - 1] || null;
    return { items: nextItems, nextActiveId: nextItem?.id || "" };
  }

  function getCurrentProgressDraftMissingFields(draft) {
    return REQUIRED_FIELDS.filter((field) => {
      const value = draft[field];
      return value === null || value === "" || value === undefined;
    });
  }

  const api = {
    createProgressDraftQueueItems,
    updateProgressDraftQueueItem,
    removeProgressDraftQueueItem,
    getCurrentProgressDraftMissingFields,
  };
  globalScope.ProgressDraftQueue = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
