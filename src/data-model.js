(function attachLearningDataModel(globalScope) {
  const DEFAULT_LEARNING_DIRECTIONS = ["AI 学习", "雅思英语学习"];

  function normalizeLearningDirections(directions) {
    const normalized = [...DEFAULT_LEARNING_DIRECTIONS];

    (Array.isArray(directions) ? directions : []).forEach((direction) => {
      const name = typeof direction === "string" ? direction.trim() : "";

      if (name && !normalized.includes(name)) {
        normalized.push(name);
      }
    });

    return normalized;
  }

  function addLearningDirection(directions, value) {
    const normalized = normalizeLearningDirections(directions);
    const addedDirection = typeof value === "string" ? value.trim() : "";

    if (!addedDirection) {
      return { directions: normalized, error: "empty", addedDirection: "" };
    }

    if (normalized.includes(addedDirection)) {
      return { directions: normalized, error: "duplicate", addedDirection: "" };
    }

    return { directions: [...normalized, addedDirection], error: null, addedDirection };
  }

  function getTopicScopeKey(topic) {
    return `${topic.direction || ""}\u0000${topic.parentId || ""}`;
  }

  function normalizeTopics(topics) {
    if (!Array.isArray(topics)) {
      return [];
    }

    const normalized = topics.map((topic) => {
      const isArchived = topic.isArchived === true;

      return {
        ...topic,
        isArchived,
        archivedAt: isArchived && typeof topic.archivedAt === "string" ? topic.archivedAt : null,
        archiveRootId: isArchived && typeof topic.archiveRootId === "string" && topic.archiveRootId ? topic.archiveRootId : null,
      };
    });
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

  function getActiveTopics(topics) {
    return normalizeTopics(topics).filter((topic) => !topic.isArchived);
  }

  function getTopicDescendantIds(topics, rootId) {
    const normalized = normalizeTopics(topics);
    const root = normalized.find((topic) => topic.id === rootId);

    if (!root) {
      return [];
    }

    const childrenByParent = new Map();
    normalized.forEach((topic) => {
      if (topic.direction !== root.direction) {
        return;
      }

      if (!childrenByParent.has(topic.parentId)) {
        childrenByParent.set(topic.parentId, []);
      }

      childrenByParent.get(topic.parentId).push(topic);
    });

    childrenByParent.forEach((children) => {
      children.sort((first, second) => first.sortOrder - second.sortOrder);
    });

    const topicIds = [];
    const visited = new Set();
    const appendTopic = (topic) => {
      if (visited.has(topic.id)) {
        return;
      }

      visited.add(topic.id);
      topicIds.push(topic.id);
      (childrenByParent.get(topic.id) || []).forEach(appendTopic);
    };

    appendTopic(root);
    return topicIds;
  }

  function getAllowedParentTopics(topics, topicId, direction) {
    const excludedIds = new Set(getTopicDescendantIds(topics, topicId));

    return getOrderedTopics(getActiveTopics(topics)).filter(
      (topic) => topic.direction === direction && !excludedIds.has(topic.id),
    );
  }

  function updateTopic(topics, topicId, changes) {
    const normalized = normalizeTopics(topics);
    const topic = normalized.find((item) => item.id === topicId);

    if (!topic) {
      return { topics: normalized, error: "not-found" };
    }

    if (topic.isArchived) {
      return { topics: normalized, error: "archived" };
    }

    const parentId = typeof changes?.parentId === "string" ? changes.parentId : topic.parentId;
    const allowedParentIds = new Set(getAllowedParentTopics(normalized, topicId, topic.direction).map((item) => item.id));

    if (parentId && !allowedParentIds.has(parentId)) {
      return { topics: normalized, error: "invalid-parent" };
    }

    const parentChanged = parentId !== topic.parentId;
    const sortOrder = parentChanged ? getNextTopicSortOrder(normalized, topic.direction, parentId) : topic.sortOrder;
    const updatedTopics = normalized.map((item) => {
      if (item.id !== topicId) {
        return item;
      }

      return {
        ...item,
        name: typeof changes?.name === "string" ? changes.name : item.name,
        status: typeof changes?.status === "string" ? changes.status : item.status,
        parentId,
        sortOrder,
        updatedAt: typeof changes?.updatedAt === "string" ? changes.updatedAt : item.updatedAt,
      };
    });

    return { topics: normalizeTopics(updatedTopics), error: null };
  }

  function archiveTopicTree(topics, rootId, archivedAt) {
    const normalized = normalizeTopics(topics);
    const root = normalized.find((topic) => topic.id === rootId);

    if (!root || root.isArchived) {
      return { topics: normalized, archiveRootId: "", topicIds: [] };
    }

    const topicIds = getTopicDescendantIds(normalized, rootId);
    const archivedTopicIds = new Set(topicIds);
    const updatedTopics = normalized.map((topic) => {
      if (!archivedTopicIds.has(topic.id)) {
        return topic;
      }

      return {
        ...topic,
        isArchived: true,
        archivedAt: typeof archivedAt === "string" ? archivedAt : null,
        archiveRootId: rootId,
      };
    });

    return {
      topics: normalizeTopics(updatedTopics),
      archiveRootId: rootId,
      topicIds,
    };
  }

  function restoreTopicTree(topics, archiveRootId) {
    const normalized = normalizeTopics(topics);
    const root = normalized.find(
      (topic) => topic.id === archiveRootId && topic.isArchived && topic.archiveRootId === archiveRootId,
    );

    if (!root) {
      return { topics: normalized, restored: false };
    }

    const restoredTopics = normalized.map((topic) => {
      if (topic.archiveRootId !== archiveRootId) {
        return topic;
      }

      return {
        ...topic,
        isArchived: false,
        archivedAt: null,
        archiveRootId: null,
      };
    });

    return { topics: normalizeTopics(restoredTopics), restored: true };
  }

  function getTopicArchiveImpact(topicIds, resources, plans, notes, progressRecords) {
    const topicIdSet = new Set(Array.isArray(topicIds) ? topicIds.filter((topicId) => typeof topicId === "string") : []);
    const countRelatedRecords = (records) =>
      Array.isArray(records) ? records.filter((record) => topicIdSet.has(record.topicId)).length : 0;

    return {
      topics: topicIdSet.size,
      resources: countRelatedRecords(resources),
      plans: countRelatedRecords(plans),
      notes: countRelatedRecords(notes),
      progressRecords: countRelatedRecords(progressRecords),
    };
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

  function normalizePlans(plans) {
    if (!Array.isArray(plans)) {
      return [];
    }

    return plans.map((plan) => ({
      ...plan,
      priority: ["高", "中", "低"].includes(plan.priority) ? plan.priority : "中",
      estimatedMinutes: Number.isInteger(plan.estimatedMinutes) && plan.estimatedMinutes > 0 ? plan.estimatedMinutes : null,
    }));
  }

  function isValidPlanDate(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }

    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
  }

  function classifyPlanDate(plan, today) {
    if (!isValidPlanDate(plan?.date) || !isValidPlanDate(today)) {
      return "history";
    }

    if (plan.date === today) {
      return "today";
    }

    if (plan.date > today) {
      return "future";
    }

    return plan.isCompleted ? "history" : "overdue";
  }

  function getEligiblePlansForProgress(plans, topicId, progressDate) {
    if (!Array.isArray(plans) || !isValidPlanDate(progressDate)) {
      return [];
    }

    return plans
      .map((plan, index) => ({ plan, index }))
      .filter(({ plan }) => plan.topicId === topicId && isValidPlanDate(plan.date) && plan.date <= progressDate)
      .sort((first, second) => second.plan.date.localeCompare(first.plan.date) || first.index - second.index)
      .map(({ plan }) => plan);
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
    DEFAULT_LEARNING_DIRECTIONS,
    normalizeLearningDirections,
    addLearningDirection,
    normalizeTopics,
    getActiveTopics,
    getTopicDescendantIds,
    getAllowedParentTopics,
    updateTopic,
    archiveTopicTree,
    restoreTopicTree,
    getTopicArchiveImpact,
    getOrderedTopics,
    getNextTopicSortOrder,
    moveTopic,
    getTopicMoveAvailability,
    normalizePlans,
    classifyPlanDate,
    getEligiblePlansForProgress,
    getResourceTodayPlanSummary,
  };

  globalScope.LearningDataModel = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
