(function attachLearningDataModel(globalScope) {
  function getTopicScopeKey(topic) {
    return `${topic.direction || ""}\u0000${topic.parentId || ""}`;
  }

  function normalizeTopics(topics) {
    if (!Array.isArray(topics)) {
      return [];
    }

    const normalized = topics.map((topic) => ({ ...topic }));
    const scopes = new Map();

    normalized.forEach((topic, index) => {
      const scopeKey = getTopicScopeKey(topic);
      if (!scopes.has(scopeKey)) {
        scopes.set(scopeKey, []);
      }
      scopes.get(scopeKey).push({ topic, index });
    });

    scopes.forEach((entries) => {
      const usedSortOrders = new Set();
      const stableEntries = [];
      const legacyEntries = [];

      entries.forEach((entry) => {
        const sortOrder = entry.topic.sortOrder;
        if (Number.isInteger(sortOrder) && sortOrder >= 0 && !usedSortOrders.has(sortOrder)) {
          usedSortOrders.add(sortOrder);
          stableEntries.push(entry);
          return;
        }

        legacyEntries.push(entry);
      });

      stableEntries.sort((first, second) => first.topic.sortOrder - second.topic.sortOrder || first.index - second.index);
      const orderedEntries = [...stableEntries, ...legacyEntries];

      orderedEntries.forEach(({ topic }, sortOrder) => {
        topic.sortOrder = sortOrder;
      });
    });

    return normalized;
  }

  function getOrderedTopics(topics) {
    const normalized = normalizeTopics(topics);
    const directionOrder = [];

    normalized.forEach((topic) => {
      if (!directionOrder.includes(topic.direction)) {
        directionOrder.push(topic.direction);
      }
    });

    const ordered = [];

    directionOrder.forEach((direction) => {
      const directionTopics = normalized.filter((topic) => topic.direction === direction);
      const directionIds = new Set(directionTopics.map((topic) => topic.id));
      const childrenByParent = new Map();

      directionTopics.forEach((topic) => {
        const parentId = topic.parentId && directionIds.has(topic.parentId) ? topic.parentId : "";
        if (!childrenByParent.has(parentId)) {
          childrenByParent.set(parentId, []);
        }
        childrenByParent.get(parentId).push(topic);
      });

      childrenByParent.forEach((children) => {
        children.sort((first, second) => first.sortOrder - second.sortOrder);
      });

      const visited = new Set();
      const appendTopicTree = (topic) => {
        if (visited.has(topic.id)) {
          return;
        }

        visited.add(topic.id);
        ordered.push(topic);
        (childrenByParent.get(topic.id) || []).forEach(appendTopicTree);
      };

      (childrenByParent.get("") || []).forEach(appendTopicTree);
      directionTopics
        .filter((topic) => !visited.has(topic.id))
        .sort((first, second) => first.sortOrder - second.sortOrder)
        .forEach(appendTopicTree);
    });

    return ordered;
  }

  function getNextTopicSortOrder(topics, direction, parentId) {
    const siblingOrders = normalizeTopics(topics)
      .filter((topic) => topic.direction === direction && (topic.parentId || "") === (parentId || ""))
      .map((topic) => topic.sortOrder);

    return siblingOrders.length ? Math.max(...siblingOrders) + 1 : 0;
  }

  function moveTopic(topics, topicId, delta) {
    const normalized = normalizeTopics(topics);
    const topic = normalized.find((item) => item.id === topicId);

    if (!topic || ![-1, 1].includes(delta)) {
      return normalized;
    }

    const siblings = normalized
      .filter(
        (item) =>
          item.direction === topic.direction &&
          (item.parentId || "") === (topic.parentId || ""),
      )
      .sort((first, second) => first.sortOrder - second.sortOrder);
    const currentIndex = siblings.findIndex((item) => item.id === topicId);
    const targetIndex = currentIndex + delta;

    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= siblings.length) {
      return normalized;
    }

    const adjacentTopic = siblings[targetIndex];
    const currentSortOrder = topic.sortOrder;
    topic.sortOrder = adjacentTopic.sortOrder;
    adjacentTopic.sortOrder = currentSortOrder;

    return normalized;
  }

  function getTopicMoveAvailability(topics, topicId) {
    const normalized = normalizeTopics(topics);
    const topic = normalized.find((item) => item.id === topicId);

    if (!topic) {
      return { canMoveUp: false, canMoveDown: false };
    }

    const siblings = normalized
      .filter(
        (item) =>
          item.direction === topic.direction &&
          (item.parentId || "") === (topic.parentId || ""),
      )
      .sort((first, second) => first.sortOrder - second.sortOrder);
    const currentIndex = siblings.findIndex((item) => item.id === topicId);

    return {
      canMoveUp: currentIndex > 0,
      canMoveDown: currentIndex >= 0 && currentIndex < siblings.length - 1,
    };
  }

  function getResourceTodayPlanSummary(plans, resourceId, today) {
    const relatedPlans = Array.isArray(plans)
      ? plans.filter((plan) => plan.resourceId === resourceId && plan.date === today)
      : [];

    return {
      total: relatedPlans.length,
      completed: relatedPlans.filter((plan) => plan.isCompleted).length,
    };
  }

  const api = {
    normalizeTopics,
    getOrderedTopics,
    getNextTopicSortOrder,
    moveTopic,
    getTopicMoveAvailability,
    getResourceTodayPlanSummary,
  };

  globalScope.LearningDataModel = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
