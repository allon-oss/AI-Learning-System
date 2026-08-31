const TOPIC_STORAGE_KEY = "personal-learning-system-topics";
const RESOURCE_STORAGE_KEY = "personal-learning-system-resources";
const PLAN_STORAGE_KEY = "personal-learning-system-plans";
const NOTE_STORAGE_KEY = "personal-learning-system-notes";
const PROGRESS_STORAGE_KEY = "personal-learning-system-progress-records";
const LEARNING_DIRECTION_STORAGE_KEY = "personal-learning-system-directions";

/**
 * @typedef {Object} Note
 * @property {string} id
 * @property {string} topicId
 * @property {string} title
 * @property {string} content
 * @property {string | null} resourceId
 * @property {string | null} planId
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ProgressRecord
 * @property {string} id
 * @property {string} date
 * @property {string} topicId
 * @property {string | null} resourceId
 * @property {string | null} planId
 * @property {number} durationMinutes
 * @property {number} completionPercent
 * @property {string} reflection
 * @property {string} createdAt
 * @property {string} updatedAt
 */

const defaultTopics = [
  {
    id: "topic-ai-foundation",
    name: "AI 基础",
    direction: "AI 学习",
    parentId: "",
    description: "理解 AI 的基本概念、常见能力和使用边界。",
    status: "学习中",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ai-prompt",
    name: "Prompt Engineering",
    direction: "AI 学习",
    parentId: "",
    description: "学习如何设计提示词，让 AI 更好地完成任务。",
    status: "学习中",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ielts-reading",
    name: "阅读",
    direction: "雅思英语学习",
    parentId: "",
    description: "练习雅思阅读文章、关键词定位和错题分析。",
    status: "学习中",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ielts-vocabulary",
    name: "词汇",
    direction: "雅思英语学习",
    parentId: "",
    description: "积累雅思高频词、同义替换和写作表达。",
    status: "未开始",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ielts-listening",
    name: "听力",
    direction: "雅思英语学习",
    parentId: "",
    description: "练习雅思听力题型、关键词捕捉和错题复盘。",
    status: "未开始",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ielts-writing",
    name: "写作",
    direction: "雅思英语学习",
    parentId: "",
    description: "练习雅思小作文、大作文结构和表达积累。",
    status: "未开始",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "topic-ielts-speaking",
    name: "口语",
    direction: "雅思英语学习",
    parentId: "",
    description: "练习雅思口语话题、回答结构和表达流利度。",
    status: "未开始",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
];

const defaultResources = [
  {
    id: "resource-ai-prompt-guide",
    title: "Prompt Engineering 入门文章",
    topicId: "topic-ai-prompt",
    type: "文章",
    status: "未开始",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "resource-ielts-reading-test",
    title: "剑桥雅思 18 Test 1 Reading",
    topicId: "topic-ielts-reading",
    type: "真题",
    status: "学习中",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
  {
    id: "resource-ielts-paper",
    title: "雅思阅读同义替换打印资料",
    topicId: "topic-ielts-reading",
    type: "纸质资料",
    status: "学习中",
    createdAt: "2026-08-10",
    updatedAt: "2026-08-10",
  },
];

if (!window.LearningDataModel) {
  throw new Error("学习数据模块加载失败，请刷新页面后重试。");
}

if (!window.AIService) {
  throw new Error("AI 服务模块加载失败，请刷新页面后重试。");
}

let topics = window.LearningDataModel.normalizeTopics(loadItems(TOPIC_STORAGE_KEY, defaultTopics));
let learningDirections = window.LearningDataModel.normalizeLearningDirections(loadItems(LEARNING_DIRECTION_STORAGE_KEY, []));
let resources = loadItems(RESOURCE_STORAGE_KEY, defaultResources);
let plans = window.LearningDataModel.normalizePlans(loadItems(PLAN_STORAGE_KEY, []));
/** @type {Note[]} */
let notes = loadItems(NOTE_STORAGE_KEY, []);
/** @type {ProgressRecord[]} */
let progressRecords = loadItems(PROGRESS_STORAGE_KEY, []);

let selectedTopicId = window.LearningDataModel.getOrderedTopics(window.LearningDataModel.getActiveTopics(topics))[0]?.id || "";
let selectedResourceId = resources[0]?.id || "";
let selectedNoteId = notes[0]?.id || "";
let editingTopicId = "";
let editingResourceId = "";
let editingNoteId = "";
let editingProgressId = "";
let selectedPlanView = "today";
let showArchivedTopics = false;
let isProgressDraftGenerating = false;
let isProgressDraftActive = false;
let progressDraftRequestToken = 0;

const topicList = document.querySelector("#topicList");
const topicDetail = document.querySelector("#topicDetail");
const topicSummary = document.querySelector("#topicSummary");
const topicFormPanel = document.querySelector("#topicFormPanel");
const topicForm = document.querySelector("#topicForm");
const showFormButton = document.querySelector("#showFormButton");
const cancelFormButton = document.querySelector("#cancelFormButton");
const parentSelect = document.querySelector("#topicParent");
const directionSelect = document.querySelector("#topicDirection");
const showAddDirectionButton = document.querySelector("#showAddDirectionButton");
const addDirectionPanel = document.querySelector("#addDirectionPanel");
const newDirectionName = document.querySelector("#newDirectionName");
const saveDirectionButton = document.querySelector("#saveDirectionButton");
const cancelAddDirectionButton = document.querySelector("#cancelAddDirectionButton");
const addDirectionMessage = document.querySelector("#addDirectionMessage");
const topicFormTitle = document.querySelector("#topicFormTitle");
const topicFormDescription = document.querySelector("#topicFormDescription");
const topicSubmitButton = document.querySelector("#topicSubmitButton");
const showArchivedTopicsButton = document.querySelector("#showArchivedTopicsButton");
const hideArchivedTopicsButton = document.querySelector("#hideArchivedTopicsButton");
const archivedTopicsPanel = document.querySelector("#archivedTopicsPanel");
const archivedTopicList = document.querySelector("#archivedTopicList");

const resourceList = document.querySelector("#resourceList");
const resourceDetail = document.querySelector("#resourceDetail");
const resourceSummary = document.querySelector("#resourceSummary");
const resourceFormPanel = document.querySelector("#resourceFormPanel");
const resourceForm = document.querySelector("#resourceForm");
const showResourceFormButton = document.querySelector("#showResourceFormButton");
const cancelResourceFormButton = document.querySelector("#cancelResourceFormButton");
const resourceTopicSelect = document.querySelector("#resourceTopic");
const resourceFormTitle = document.querySelector("#resourceFormTitle");
const resourceFormDescription = document.querySelector("#resourceFormDescription");
const resourceSubmitButton = document.querySelector("#resourceSubmitButton");

const planDate = document.querySelector("#planDate");
const planForm = document.querySelector("#planForm");
const planTopicSelect = document.querySelector("#planTopic");
const planResourceSelect = document.querySelector("#planResource");
const planEntryModeSelect = document.querySelector("#planEntryMode");
const planScheduleDate = document.querySelector("#planScheduleDate");
const planDateError = document.querySelector("#planDateError");
const planEstimatedMinutes = document.querySelector("#planEstimatedMinutes");
const planPriority = document.querySelector("#planPriority");
const planTaskInput = document.querySelector("#planTask");
const planSubmitButton = planForm.querySelector('button[type="submit"]');
const planListHeading = document.querySelector("#planListHeading");
const planViewTabs = document.querySelector(".plan-view-tabs");
const planSummary = document.querySelector("#planSummary");
const planSaveMessage = document.querySelector("#planSaveMessage");
const planList = document.querySelector("#planList");
const planEntryTabs = document.querySelector(".plan-entry-tabs");
const batchPlanForm = document.querySelector("#batchPlanForm");
const batchPlanDate = document.querySelector("#batchPlanDate");
const batchPlanGroups = document.querySelector("#batchPlanGroups");
const addBatchPlanGroupButton = document.querySelector("#addBatchPlanGroupButton");
const batchPlanSaveMessage = document.querySelector("#batchPlanSaveMessage");
let batchGroupCounter = 0;
let batchTaskCounter = 0;
let planEntryFormMode = "single";

const noteForm = document.querySelector("#noteForm");
const noteFormPanel = document.querySelector("#noteFormPanel");
const noteFormTitle = document.querySelector("#noteFormTitle");
const noteFormDescription = document.querySelector("#noteFormDescription");
const noteTopicSelect = document.querySelector("#noteTopic");
const noteResourceSelect = document.querySelector("#noteResource");
const notePlanSelect = document.querySelector("#notePlan");
const noteSubmitButton = document.querySelector("#noteSubmitButton");
const cancelNoteEditButton = document.querySelector("#cancelNoteEditButton");
const noteSaveMessage = document.querySelector("#noteSaveMessage");
const noteList = document.querySelector("#noteList");
const noteDetail = document.querySelector("#noteDetail");
const noteSummary = document.querySelector("#noteSummary");

const progressForm = document.querySelector("#progressForm");
const progressFormPanel = document.querySelector("#progressFormPanel");
const progressFormTitle = document.querySelector("#progressFormTitle");
const progressFormDescription = document.querySelector("#progressFormDescription");
const progressDate = document.querySelector("#progressDate");
const progressTopicSelect = document.querySelector("#progressTopic");
const progressResourceSelect = document.querySelector("#progressResource");
const progressPlanSelect = document.querySelector("#progressPlan");
const progressSubmitButton = document.querySelector("#progressSubmitButton");
const cancelProgressEditButton = document.querySelector("#cancelProgressEditButton");
const progressSaveMessage = document.querySelector("#progressSaveMessage");
const progressOverview = document.querySelector("#progressOverview");
const progressSummary = document.querySelector("#progressSummary");
const progressList = document.querySelector("#progressList");
const aiProgressPanel = document.querySelector("#aiProgressPanel");
const aiProgressDescription = document.querySelector("#aiProgressDescription");
const generateProgressDraftButton = document.querySelector("#generateProgressDraftButton");
const discardProgressDraftButton = document.querySelector("#discardProgressDraftButton");
const aiProgressStatus = document.querySelector("#aiProgressStatus");
const aiProgressWarnings = document.querySelector("#aiProgressWarnings");
const progressDuration = document.querySelector("#progressDuration");
const progressCompletion = document.querySelector("#progressCompletion");
const progressReflection = document.querySelector("#progressReflection");

showFormButton.addEventListener("click", () => {
  openTopicForm();
});

showArchivedTopicsButton.addEventListener("click", () => {
  showArchivedTopics = true;
  renderArchivedTopicList();
  archivedTopicsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

hideArchivedTopicsButton.addEventListener("click", () => {
  showArchivedTopics = false;
  renderArchivedTopicList();
  showArchivedTopicsButton.focus();
});

archivedTopicList.addEventListener("click", (event) => {
  const selectButton = event.target.closest("[data-select-archived-topic]");
  const restoreButton = event.target.closest("[data-restore-topic]");

  if (selectButton) {
    selectedTopicId = selectButton.dataset.selectArchivedTopic;
    renderTopicDetail();
    return;
  }

  if (restoreButton) {
    restoreTopic(restoreButton.dataset.restoreTopic);
  }
});

cancelFormButton.addEventListener("click", () => {
  closeTopicForm();
});

showAddDirectionButton.addEventListener("click", openAddDirectionPanel);
saveDirectionButton.addEventListener("click", addDirectionFromForm);
cancelAddDirectionButton.addEventListener("click", closeAddDirectionPanel);

directionSelect.addEventListener("change", updateParentOptions);

topicForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(topicForm);
  const now = getToday();

  if (editingTopicId) {
    const result = window.LearningDataModel.updateTopic(topics, editingTopicId, {
      name: formData.get("name").trim(),
      status: formData.get("status"),
      parentId: formData.get("parentId"),
      updatedAt: now,
    });

    if (result.error) {
      window.alert("当前主题无法保存，请重新选择允许的父主题后再试。");
      return;
    }

    topics = result.topics;
    selectedTopicId = editingTopicId;
    saveItems(TOPIC_STORAGE_KEY, topics);
    closeTopicForm();
    render();
    return;
  }

  const topic = {
    id: `topic-${Date.now()}`,
    name: formData.get("name").trim(),
    direction: formData.get("direction"),
    parentId: formData.get("parentId"),
    description: formData.get("description").trim(),
    status: formData.get("status"),
    sortOrder: window.LearningDataModel.getNextTopicSortOrder(topics, formData.get("direction"), formData.get("parentId")),
    createdAt: now,
    updatedAt: now,
  };

  topics = window.LearningDataModel.normalizeTopics([...topics, topic]);
  selectedTopicId = topic.id;
  saveItems(TOPIC_STORAGE_KEY, topics);
  closeTopicForm();
  render();
});

showResourceFormButton.addEventListener("click", () => {
  openResourceForm();
});

cancelResourceFormButton.addEventListener("click", () => {
  closeResourceForm();
});

resourceForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(resourceForm);
  const now = getToday();
  const originalResource = editingResourceId ? resources.find((resource) => resource.id === editingResourceId) : null;
  const topicId = preserveLockedTopicAssociation(originalResource, formData.get("topicId"));

  if (!topicId || (!originalResource && !isActiveTopicId(topicId))) {
    window.alert("所选主题已归档或不存在。请先创建或恢复主题后再新增资料。");
    return;
  }

  if (editingResourceId) {
    resources = resources.map((resource) => {
      if (resource.id !== editingResourceId) {
        return resource;
      }

      return {
        ...resource,
        title: formData.get("title").trim(),
        topicId,
        type: formData.get("type"),
        status: formData.get("status"),
        updatedAt: now,
      };
    });
    selectedResourceId = editingResourceId;
  } else {
    const resource = {
      id: `resource-${Date.now()}`,
      title: formData.get("title").trim(),
      topicId,
      type: formData.get("type"),
      status: formData.get("status"),
      createdAt: now,
      updatedAt: now,
    };

    resources = [resource, ...resources];
    selectedResourceId = resource.id;
  }

  saveItems(RESOURCE_STORAGE_KEY, resources);
  closeResourceForm();
  render();
});

planTopicSelect.addEventListener("change", updatePlanResourceOptions);
planEntryModeSelect.addEventListener("change", () => setPlanDateDefaults({ resetInvalidDate: true }));
planScheduleDate.addEventListener("focus", () => setPlanDateDefaults());
planScheduleDate.addEventListener("input", () => setPlanDateDefaults());

batchPlanForm.noValidate = true;
planEntryTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-plan-entry-mode]");
  if (button) {
    setPlanEntryFormMode(button.dataset.planEntryMode);
  }
});

batchPlanForm.addEventListener("focusin", syncBatchPlanDate);
batchPlanForm.addEventListener("submit", submitBatchPlans);
batchPlanForm.addEventListener("change", (event) => {
  if (event.target.matches("[data-batch-topic]")) {
    refreshBatchPlanOptions();
  }
});
batchPlanForm.addEventListener("click", (event) => {
  const addTaskButton = event.target.closest("[data-add-batch-task]");
  const removeTaskButton = event.target.closest("[data-remove-batch-task]");
  const removeGroupButton = event.target.closest("[data-remove-batch-group]");
  const detailsButton = event.target.closest("[data-toggle-batch-task-details]");
  if (addTaskButton) return addBatchTaskRow(addTaskButton.closest("[data-batch-group]"));
  if (removeTaskButton) {
    removeTaskButton.closest("[data-batch-task-row]").remove();
    return refreshBatchPlanOptions();
  }
  if (removeGroupButton) {
    removeGroupButton.closest("[data-batch-group]").remove();
    return refreshBatchPlanOptions();
  }
  if (detailsButton) {
    const details = document.getElementById(detailsButton.getAttribute("aria-controls"));
    const expanded = detailsButton.getAttribute("aria-expanded") === "true";
    detailsButton.setAttribute("aria-expanded", String(!expanded));
    details.classList.toggle("hidden", expanded);
  }
});
addBatchPlanGroupButton.addEventListener("click", () => addBatchPlanGroup());

noteTopicSelect.addEventListener("change", updateNoteRelatedOptions);

progressTopicSelect.addEventListener("change", () => {
  updateProgressRelatedOptions(Boolean(editingProgressId));
});

progressDate.addEventListener("change", () => {
  setProgressDateDefaults();
  updateProgressRelatedOptions(Boolean(editingProgressId));
});
progressDate.addEventListener("focus", setProgressDateDefaults);

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    setPlanDateDefaults();
    setProgressDateDefaults();
    syncBatchPlanDate();
  }
});

cancelNoteEditButton.addEventListener("click", resetNoteForm);

cancelProgressEditButton.addEventListener("click", resetProgressForm);

generateProgressDraftButton.addEventListener("click", generateProgressDraftFromDescription);
discardProgressDraftButton.addEventListener("click", () => clearProgressDraftState({ resetForm: true }));

planForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(planForm);
  const topicId = formData.get("topicId");
  const task = formData.get("task").trim();
  const date = formData.get("date");
  const isBackfilled = formData.get("entryMode") === "backfill";
  const estimatedMinutesInput = formData.get("estimatedMinutes").trim();
  const estimatedMinutes = estimatedMinutesInput === "" ? null : Number(estimatedMinutesInput);
  const priority = formData.get("priority");

  if (!topicId || !task) {
    return;
  }

  if (!isActiveTopicId(topicId)) {
    planSaveMessage.textContent = "所选主题已归档或不存在。请先创建或恢复主题后再新增计划。";
    return;
  }

  if (!validatePlanScheduleDate()) {
    planSaveMessage.textContent = planDateError.textContent || "请选择符合记录方式的有效计划日期。";
    return;
  }

  if (estimatedMinutes !== null && (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0)) {
    planSaveMessage.textContent = "预计时长只能填写正整数分钟，或留空。";
    return;
  }

  const resourceId = formData.get("resourceId") || null;
  const plan = {
    id: `plan-${Date.now()}`,
    date,
    topicId,
    resourceId,
    task,
    priority: ["高", "中", "低"].includes(priority) ? priority : "中",
    estimatedMinutes,
    isCompleted: false,
    isBackfilled,
    createdAt: new Date().toISOString(),
  };

  plans = [plan, ...plans];
  saveItems(PLAN_STORAGE_KEY, plans);
  planForm.reset();
  setPlanDateDefaults();
  planTopicSelect.value = topicId;
  updatePlanResourceOptions();
  selectedPlanView = isBackfilled ? "history" : date === getToday() ? "today" : "future";
  render();
  planSaveMessage.textContent = isBackfilled ? "历史补录计划已添加并保存。" : "学习计划已添加并保存。";
});

noteForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(noteForm);
  const title = formData.get("title").trim();
  const content = formData.get("content").trim();
  const originalNote = editingNoteId ? notes.find((note) => note.id === editingNoteId) : null;
  const topicId = preserveLockedTopicAssociation(originalNote, formData.get("topicId"));

  if (!title || !content || !topicId) {
    return;
  }

  if (!originalNote && !isActiveTopicId(topicId)) {
    noteSaveMessage.textContent = "所选主题已归档或不存在。请先创建或恢复主题后再新增笔记。";
    return;
  }

  const now = new Date().toISOString();
  const isEditing = Boolean(editingNoteId);
  let savedNoteId = editingNoteId;

  if (isEditing) {
    notes = notes.map((note) => {
      if (note.id !== editingNoteId) {
        return note;
      }

      return {
        ...note,
        title,
        content,
        topicId,
        resourceId: formData.get("resourceId") || null,
        planId: formData.get("planId") || null,
        updatedAt: now,
      };
    });
  } else {
    const note = {
      id: `note-${Date.now()}`,
      title,
      content,
      topicId,
      resourceId: formData.get("resourceId") || null,
      planId: formData.get("planId") || null,
      createdAt: now,
      updatedAt: now,
    };

    notes = [note, ...notes];
    savedNoteId = note.id;
  }

  selectedNoteId = savedNoteId;
  saveItems(NOTE_STORAGE_KEY, notes);
  resetNoteForm();
  noteSaveMessage.textContent = isEditing ? "笔记已更新。" : "笔记已保存。";
  renderNoteList();
  renderNoteDetail();
});

progressForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(progressForm);
  const date = formData.get("date");
  const isEditing = Boolean(editingProgressId);
  const originalProgress = isEditing ? progressRecords.find((progress) => progress.id === editingProgressId) : null;
  const topicId = preserveLockedTopicAssociation(originalProgress, formData.get("topicId"));
  const resourceId = formData.get("resourceId") || null;
  const planId = formData.get("planId") || null;
  const durationMinutes = Number(formData.get("durationMinutes"));
  const completionPercent = Number(formData.get("completionPercent"));
  const reflection = formData.get("reflection").trim();

  if (!isValidPlanDateValue(date) || date > getToday()) {
    progressSaveMessage.textContent = "进度日期只能选择今天或过去的有效日期。";
    return;
  }

  if (!topicId || !Number.isInteger(durationMinutes) || durationMinutes <= 0 || !Number.isInteger(completionPercent) || completionPercent < 0 || completionPercent > 100) {
    progressSaveMessage.textContent = "请填写有效的学习时长和完成度。";
    return;
  }

  if (!originalProgress && !isActiveTopicId(topicId)) {
    progressSaveMessage.textContent = "所选主题已归档或不存在。请先创建或恢复主题后再新增进度。";
    return;
  }

  const selectedPlan = plans.find((plan) => plan.id === planId);
  const eligiblePlans = window.LearningDataModel.getEligiblePlansForProgress(plans, topicId, date);
  const preservesDeletedPlan = Boolean(planId && originalProgress && originalProgress.planId === planId && !selectedPlan);

  if (planId && !preservesDeletedPlan && !eligiblePlans.some((plan) => plan.id === planId)) {
    progressSaveMessage.textContent = "关联学习计划不属于当前主题，或其日期晚于记录日期。请清除关联或修改日期后再保存。";
    return;
  }

  const now = new Date().toISOString();
  let savedProgressId = editingProgressId;

  if (isEditing) {
    progressRecords = progressRecords.map((progress) => {
      if (progress.id !== editingProgressId) {
        return progress;
      }

      return {
        ...progress,
        date,
        topicId,
        resourceId,
        planId,
        durationMinutes,
        completionPercent,
        reflection,
        updatedAt: now,
      };
    });
  } else {
    const progress = {
      id: `progress-${Date.now()}`,
      date,
      topicId,
      resourceId,
      planId,
      durationMinutes,
      completionPercent,
      reflection,
      createdAt: now,
      updatedAt: now,
    };

    progressRecords = [progress, ...progressRecords];
    savedProgressId = progress.id;
  }

  saveItems(PROGRESS_STORAGE_KEY, progressRecords);
  invalidateProgressDraftRequest();
  const wasDraftConfirmation = isProgressDraftActive && !isEditing;
  resetProgressForm();
  if (wasDraftConfirmation) {
    clearProgressDraftState({ resetForm: false });
  }
  progressSaveMessage.textContent = isEditing
    ? "进度记录已更新。"
    : wasDraftConfirmation
      ? "AI 进度草稿已确认并保存。"
      : "进度记录已保存。";
  render();
});

topicDetail.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-topic]");
  const archiveButton = event.target.closest("[data-archive-topic]");
  const restoreButton = event.target.closest("[data-restore-topic]");
  const addButton = event.target.closest("[data-add-resource-topic]");
  const resourceButton = event.target.closest("[data-view-resource]");

  if (editButton) {
    openTopicForm(editButton.dataset.editTopic);
    return;
  }

  if (archiveButton) {
    archiveTopic(archiveButton.dataset.archiveTopic);
    return;
  }

  if (restoreButton) {
    restoreTopic(restoreButton.dataset.restoreTopic);
    return;
  }

  if (addButton) {
    openResourceForm(addButton.dataset.addResourceTopic);
    return;
  }

  if (resourceButton) {
    selectedResourceId = resourceButton.dataset.viewResource;
    renderResourceList();
    renderResourceDetail();
    document.querySelector("#resourceDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

resourceDetail.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-resource]");
  const deleteButton = event.target.closest("[data-delete-resource]");

  if (editButton) {
    openResourceForm("", editButton.dataset.editResource);
    return;
  }

  if (deleteButton) {
    deleteResource(deleteButton.dataset.deleteResource);
  }
});

planList.addEventListener("click", (event) => {
  const completeButton = event.target.closest("[data-toggle-plan]");
  const deleteButton = event.target.closest("[data-delete-plan]");

  if (completeButton) {
    togglePlanCompleted(completeButton.dataset.togglePlan);
    return;
  }

  if (deleteButton) {
    deletePlan(deleteButton.dataset.deletePlan);
  }
});

planViewTabs.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-plan-view]");
  if (!viewButton) {
    return;
  }

  selectedPlanView = viewButton.dataset.planView;
  renderPlanList();
});

noteList.addEventListener("click", (event) => {
  const noteButton = event.target.closest("[data-view-note]");
  if (!noteButton) {
    return;
  }

  selectedNoteId = noteButton.dataset.viewNote;
  renderNoteList();
  renderNoteDetail();
});

noteDetail.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-note]");
  const deleteButton = event.target.closest("[data-delete-note]");

  if (editButton) {
    startNoteEditing(editButton.dataset.editNote);
    return;
  }

  if (deleteButton) {
    deleteNote(deleteButton.dataset.deleteNote);
  }
});

progressList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-progress]");
  const deleteButton = event.target.closest("[data-delete-progress]");

  if (editButton) {
    startProgressEditing(editButton.dataset.editProgress);
    return;
  }

  if (deleteButton) {
    deleteProgress(deleteButton.dataset.deleteProgress);
  }
});

function loadItems(storageKey, fallbackItems) {
  const storedItems = localStorage.getItem(storageKey);
  if (!storedItems) {
    return fallbackItems;
  }

  try {
    return JSON.parse(storedItems);
  } catch {
    return fallbackItems;
  }
}

function saveItems(storageKey, items) {
  localStorage.setItem(storageKey, JSON.stringify(items));
}

function setPlanEntryFormMode(mode) {
  planEntryFormMode = mode === "batch" ? "batch" : "single";
  const isBatch = planEntryFormMode === "batch";
  planForm.classList.toggle("hidden", isBatch);
  batchPlanForm.classList.toggle("hidden", !isBatch);
  planEntryTabs.querySelectorAll("[data-plan-entry-mode]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.planEntryMode === planEntryFormMode));
  });

  if (isBatch) {
    if (!batchPlanGroups.children.length) {
      resetBatchPlanForm();
    }
    syncBatchPlanDate();
    batchPlanGroups.querySelector("[data-batch-topic]")?.focus();
  } else {
    planTopicSelect.focus();
  }
}

function resetBatchPlanForm() {
  batchPlanGroups.innerHTML = "";
  batchPlanSaveMessage.textContent = "";
  addBatchPlanGroup();
  syncBatchPlanDate();
}

function addBatchPlanGroup(topicId = "") {
  const group = document.createElement("section");
  const clientId = `batch-group-${++batchGroupCounter}`;
  group.className = "batch-plan-group";
  group.dataset.batchGroup = clientId;
  group.innerHTML = `
    <div class="batch-plan-group-header">
      <h3>学习主题</h3>
      <button class="danger-button" type="button" data-remove-batch-group>移除主题</button>
    </div>
    <label>主题
      <select data-batch-topic aria-label="主题" aria-describedby="${clientId}-topic-error"></select>
      <span id="${clientId}-topic-error" data-batch-error class="form-message is-error" aria-live="polite"></span>
    </label>
    <div class="batch-plan-task-list"></div>
    <div class="batch-plan-group-actions">
      <button class="secondary-button" type="button" data-add-batch-task>添加同主题任务</button>
    </div>
  `;
  batchPlanGroups.appendChild(group);
  addBatchTaskRow(group);
  refreshBatchPlanOptions();
  group.querySelector("[data-batch-topic]").value = topicId;
  refreshBatchPlanOptions();
  return group;
}

function addBatchTaskRow(groupElement) {
  if (!groupElement) return;
  const task = document.createElement("article");
  const clientId = `batch-task-${++batchTaskCounter}`;
  const detailsId = `${clientId}-details`;
  task.className = "batch-plan-task-row";
  task.dataset.batchTaskRow = clientId;
  task.innerHTML = `
    <div class="batch-plan-task-header">
      <h4>学习任务</h4>
      <button class="small-button" type="button" data-toggle-batch-task-details aria-expanded="false" aria-controls="${detailsId}">更多设置</button>
      <button class="danger-button" type="button" data-remove-batch-task>移除任务</button>
    </div>
    <label>任务名称
      <input data-batch-task type="text" required aria-describedby="${clientId}-task-error" />
      <span id="${clientId}-task-error" data-batch-error class="form-message is-error" aria-live="polite"></span>
    </label>
    <div id="${detailsId}" class="batch-plan-task-details hidden" data-batch-task-details>
      <label>学习资料（可选）
        <select data-batch-resource aria-describedby="${clientId}-resource-error"></select>
        <span id="${clientId}-resource-error" data-batch-error class="form-message is-error" aria-live="polite"></span>
      </label>
      <label>预计时长（分钟，可选）
        <input data-batch-minutes type="number" min="1" step="1" aria-describedby="${clientId}-minutes-error" />
        <span id="${clientId}-minutes-error" data-batch-error class="form-message is-error" aria-live="polite"></span>
      </label>
      <label>优先级
        <select data-batch-priority required aria-describedby="${clientId}-priority-error"><option value="高">高</option><option value="中" selected>中</option><option value="低">低</option></select>
        <span id="${clientId}-priority-error" data-batch-error class="form-message is-error" aria-live="polite"></span>
      </label>
    </div>
  `;
  groupElement.querySelector(".batch-plan-task-list").appendChild(task);
  refreshBatchPlanOptions();
  return task;
}

function refreshBatchPlanOptions() {
  const groups = [...batchPlanGroups.querySelectorAll("[data-batch-group]")];
  const activeTopics = window.LearningDataModel.getOrderedTopics(getActiveTopics());
  const selectedTopicIds = groups.map((group) => group.querySelector("[data-batch-topic]").value).filter(Boolean);

  groups.forEach((group) => {
    const topicSelect = group.querySelector("[data-batch-topic]");
    const currentTopicId = topicSelect.value;
    topicSelect.innerHTML = "";
    const emptyOption = document.createElement("option");
    emptyOption.value = "";
    emptyOption.textContent = "请选择学习主题";
    topicSelect.appendChild(emptyOption);
    activeTopics.forEach((topic) => {
      const option = document.createElement("option");
      option.value = topic.id;
      option.textContent = getTopicPath(topic);
      option.disabled = topic.id !== currentTopicId && selectedTopicIds.includes(topic.id);
      topicSelect.appendChild(option);
    });
    if (currentTopicId && !activeTopics.some((topic) => topic.id === currentTopicId)) {
      const missingOption = document.createElement("option");
      missingOption.value = currentTopicId;
      missingOption.textContent = "所选主题已归档或不存在";
      topicSelect.appendChild(missingOption);
    }
    topicSelect.value = currentTopicId;

    group.querySelectorAll("[data-batch-resource]").forEach((resourceSelect) => {
      const currentResourceId = resourceSelect.value;
      resourceSelect.innerHTML = "";
      const emptyResource = document.createElement("option");
      emptyResource.value = "";
      emptyResource.textContent = "不关联资料";
      resourceSelect.appendChild(emptyResource);
      const relatedResources = resources.filter((resource) => resource.topicId === currentTopicId);
      relatedResources.forEach((resource) => {
        const option = document.createElement("option");
        option.value = resource.id;
        option.textContent = resource.title;
        resourceSelect.appendChild(option);
      });
      resourceSelect.disabled = !currentTopicId;
      resourceSelect.value = relatedResources.some((resource) => resource.id === currentResourceId) ? currentResourceId : "";
    });

    const removeTaskButtons = group.querySelectorAll("[data-remove-batch-task]");
    removeTaskButtons.forEach((button) => { button.disabled = removeTaskButtons.length === 1; });
  });

  groups.forEach((group) => {
    group.querySelector("[data-remove-batch-group]").disabled = groups.length === 1;
  });
  const hasUnusedActiveTopic = activeTopics.some((topic) => !selectedTopicIds.includes(topic.id));
  addBatchPlanGroupButton.disabled = !hasUnusedActiveTopic;
  addBatchPlanGroupButton.title = hasUnusedActiveTopic ? "" : "所有活动主题都已加入当前草稿。";
  addBatchPlanGroupButton.setAttribute("aria-describedby", hasUnusedActiveTopic ? "" : "batchPlanSaveMessage");
  if (!hasUnusedActiveTopic && groups.length) {
    batchPlanSaveMessage.textContent = "所有活动主题都已加入当前草稿。";
  } else if (batchPlanSaveMessage.textContent === "所有活动主题都已加入当前草稿。") {
    batchPlanSaveMessage.textContent = "";
  }
}

function collectBatchPlanGroups() {
  return [...batchPlanGroups.querySelectorAll("[data-batch-group]")].map((group) => ({
    clientId: group.dataset.batchGroup,
    topicId: group.querySelector("[data-batch-topic]").value,
    tasks: [...group.querySelectorAll("[data-batch-task-row]")].map((task) => ({
      clientId: task.dataset.batchTaskRow,
      task: task.querySelector("[data-batch-task]").value,
      resourceId: task.querySelector("[data-batch-resource]").value,
      estimatedMinutes: task.querySelector("[data-batch-minutes]").value,
      priority: task.querySelector("[data-batch-priority]").value,
    })),
  }));
}

function collectBatchInputValidityErrors() {
  const errors = [];
  batchPlanGroups.querySelectorAll("[data-batch-group]").forEach((group) => {
    group.querySelectorAll("[data-batch-task-row]").forEach((row) => {
      const minutesInput = row.querySelector("[data-batch-minutes]");
      const { badInput, stepMismatch, rangeUnderflow } = minutesInput.validity;
      if (badInput || stepMismatch || rangeUnderflow) {
        errors.push({
          groupId: group.dataset.batchGroup,
          taskId: row.dataset.batchTaskRow,
          field: "estimatedMinutes",
          message: "分钟数必须为正整数或留空",
        });
      }
    });
  });
  return errors;
}

function submitBatchPlans(event) {
  event.preventDefault();
  clearBatchPlanErrors();

  const groups = collectBatchPlanGroups();
  const result = window.LearningDataModel.validateBatchPlanGroups(groups, topics, resources);
  const seenErrors = new Set();
  const errors = [...result.errors, ...collectBatchInputValidityErrors()].filter((error) => {
    const key = `${error.groupId}\u0000${error.taskId || ""}\u0000${error.field}`;
    if (seenErrors.has(key)) return false;
    seenErrors.add(key);
    return true;
  });
  if (errors.length) {
    showBatchPlanErrors(errors);
    batchPlanSaveMessage.textContent = "存在未完成或无效内容，尚未保存任何计划。";
    return;
  }

  const now = new Date();
  const newPlans = window.LearningDataModel.createBatchPlanRecords(result.entries, {
    date: getToday(),
    createdAt: now.toISOString(),
    batchToken: String(now.getTime()),
  });
  if (!newPlans.length) {
    batchPlanSaveMessage.textContent = "批量计划构建失败，尚未保存任何计划，草稿已保留。";
    return;
  }

  const nextPlans = [...newPlans, ...plans];
  try {
    saveItems(PLAN_STORAGE_KEY, nextPlans);
  } catch {
    batchPlanSaveMessage.textContent = "批量计划保存失败，草稿已保留，请检查浏览器存储后重试。";
    return;
  }

  plans = nextPlans;
  selectedPlanView = "today";
  resetBatchPlanForm();
  render();
  batchPlanSaveMessage.textContent = `已保存 ${newPlans.length} 条今日计划。`;
}

function clearBatchPlanErrors() {
  batchPlanForm.querySelectorAll("[data-batch-topic], [data-batch-task], [data-batch-resource], [data-batch-minutes], [data-batch-priority]").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  batchPlanForm.querySelectorAll("[data-batch-error]").forEach((errorNode) => {
    errorNode.textContent = "";
  });
  batchPlanSaveMessage.textContent = "";
}

function showBatchPlanErrors(errors) {
  const fieldSelectors = {
    topicId: "[data-batch-topic]",
    task: "[data-batch-task]",
    resourceId: "[data-batch-resource]",
    estimatedMinutes: "[data-batch-minutes]",
    priority: "[data-batch-priority]",
  };
  const detailFields = new Set(["resourceId", "estimatedMinutes", "priority"]);
  let firstErrorField = null;

  errors.forEach((error) => {
    const group = [...batchPlanGroups.querySelectorAll("[data-batch-group]")]
      .find((item) => item.dataset.batchGroup === error.groupId);
    const row = error.taskId && group
      ? [...group.querySelectorAll("[data-batch-task-row]")]
        .find((item) => item.dataset.batchTaskRow === error.taskId)
      : null;
    const fieldRoot = error.field === "topicId" ? group : row;
    const field = fieldRoot?.querySelector(fieldSelectors[error.field]);
    const errorNodeId = field?.getAttribute("aria-describedby");
    const errorNode = errorNodeId ? document.getElementById(errorNodeId) : null;

    if (!field || !errorNode) {
      batchPlanSaveMessage.textContent = typeof error.message === "string" && error.message
        ? error.message
        : "批量计划中存在无法定位的错误。";
      return;
    }

    field.setAttribute("aria-invalid", "true");
    errorNode.textContent = error.message;
    if (detailFields.has(error.field)) {
      const details = row.querySelector("[data-batch-task-details]");
      const toggle = row.querySelector("[data-toggle-batch-task-details]");
      details.classList.remove("hidden");
      toggle.setAttribute("aria-expanded", "true");
    }
    if (!firstErrorField) firstErrorField = field;
  });

  firstErrorField?.focus();
}

function syncBatchPlanDate() {
  batchPlanDate.textContent = `今天的计划日期：${getToday()}`;
}

function render() {
  if (!editingProgressId) {
    setProgressDateDefaults();
  }
  updateParentOptions();
  updateResourceTopicOptions();
  updatePlanTopicOptions();
  updatePlanResourceOptions();
  refreshBatchPlanOptions();
  updateNoteTopicOptions();
  updateNoteRelatedOptions();
  updateProgressTopicOptions();
  updateProgressRelatedOptions(Boolean(editingProgressId));
  renderTopicSummary();
  renderTopicList();
  renderArchivedTopicList();
  renderTopicDetail();
  renderResourceSummary();
  renderResourceList();
  renderResourceDetail();
  renderPlanHeader();
  renderPlanList();
  renderNoteSummary();
  renderNoteList();
  renderNoteDetail();
  renderProgressOverview();
  renderProgressList();
}

function renderTopicSummary() {
  const activeTopics = window.LearningDataModel.getActiveTopics(topics);
  const activeCount = activeTopics.filter((topic) => topic.status === "学习中").length;
  const archivedCount = topics.length - activeTopics.length;
  topicSummary.textContent = archivedCount
    ? `当前共有 ${activeTopics.length} 个活动主题，其中 ${activeCount} 个正在学习；另有 ${archivedCount} 个已归档主题。`
    : `当前共有 ${activeTopics.length} 个主题，其中 ${activeCount} 个正在学习。`;
}

function renderTopicList() {
  const activeTopics = window.LearningDataModel.getActiveTopics(topics);
  const groupedTopics = groupByDirection(window.LearningDataModel.getOrderedTopics(activeTopics));
  topicList.innerHTML = "";

  if (!activeTopics.length) {
    topicList.innerHTML = "<p>当前没有活动主题。可在“已归档主题”中恢复主题。</p>";
    return;
  }

  Object.entries(groupedTopics).forEach(([direction, directionTopics]) => {
    const group = document.createElement("section");
    group.className = "topic-group";

    const heading = document.createElement("h3");
    heading.textContent = direction;
    group.appendChild(heading);

    directionTopics.forEach((topic) => {
      const article = document.createElement("article");
      article.className = topic.id === selectedTopicId ? "topic-card topic-card-with-actions selected" : "topic-card topic-card-with-actions";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "topic-card-select";
      selectButton.dataset.selectTopic = topic.id;
      selectButton.setAttribute("aria-pressed", topic.id === selectedTopicId ? "true" : "false");
      selectButton.addEventListener("click", () => {
        selectedTopicId = topic.id;
        renderTopicList();
        renderTopicDetail();
      });

      const parent = topics.find((item) => item.id === topic.parentId);
      selectButton.innerHTML = `
        <span class="topic-card-title">${escapeHtml(topic.name)}</span>
        <span class="topic-card-meta">${escapeHtml(parent ? parent.name : topic.direction)} · ${escapeHtml(topic.status)}</span>
        <span class="topic-card-description">${escapeHtml(topic.description || "暂时没有描述。")}</span>
      `;

      const moveAvailability = window.LearningDataModel.getTopicMoveAvailability(topics, topic.id);
      const actions = document.createElement("div");
      actions.className = "topic-order-actions";
      actions.innerHTML = `
        <button class="small-button" type="button" data-move-topic="${escapeHtml(topic.id)}" data-move-direction="-1" aria-label="上移 ${escapeHtml(topic.name)}" ${moveAvailability.canMoveUp ? "" : "disabled"}>上移</button>
        <button class="small-button" type="button" data-move-topic="${escapeHtml(topic.id)}" data-move-direction="1" aria-label="下移 ${escapeHtml(topic.name)}" ${moveAvailability.canMoveDown ? "" : "disabled"}>下移</button>
      `;

      actions.querySelectorAll("[data-move-topic]").forEach((moveButton) => {
        moveButton.addEventListener("click", () => {
          const movedTopicId = moveButton.dataset.moveTopic;
          topics = window.LearningDataModel.moveTopic(topics, movedTopicId, Number(moveButton.dataset.moveDirection));
          saveItems(TOPIC_STORAGE_KEY, topics);
          render();
          const movedTopicSelectButton = Array.from(topicList.querySelectorAll("[data-select-topic]")).find(
            (button) => button.dataset.selectTopic === movedTopicId,
          );
          movedTopicSelectButton?.focus();
        });
      });

      article.appendChild(selectButton);
      article.appendChild(actions);
      group.appendChild(article);
    });

    topicList.appendChild(group);
  });
}

function renderArchivedTopicList() {
  archivedTopicsPanel.classList.toggle("hidden", !showArchivedTopics);

  if (!showArchivedTopics) {
    return;
  }

  const archivedTopics = topics.filter((topic) => topic.isArchived);
  const groupedTopics = groupByDirection(window.LearningDataModel.getOrderedTopics(archivedTopics));
  archivedTopicList.innerHTML = "";

  if (!archivedTopics.length) {
    archivedTopicList.innerHTML = "<p>当前没有已归档主题。</p>";
    return;
  }

  Object.entries(groupedTopics).forEach(([direction, directionTopics]) => {
    const group = document.createElement("section");
    group.className = "topic-group";

    const heading = document.createElement("h3");
    heading.textContent = direction;
    group.appendChild(heading);

    directionTopics.forEach((topic) => {
      const article = document.createElement("article");
      article.className = topic.id === selectedTopicId ? "topic-card topic-card-with-actions selected" : "topic-card topic-card-with-actions";

      const selectButton = document.createElement("button");
      selectButton.type = "button";
      selectButton.className = "topic-card-select";
      selectButton.dataset.selectArchivedTopic = topic.id;
      selectButton.setAttribute("aria-pressed", topic.id === selectedTopicId ? "true" : "false");
      selectButton.innerHTML = `
        <span class="topic-card-title">${escapeHtml(topic.name)}</span>
        <span class="topic-card-meta">已归档 · ${escapeHtml(topic.status)}</span>
        <span class="topic-card-description">${escapeHtml(topic.description || "暂时没有描述。")}</span>
      `;

      const actions = document.createElement("div");
      actions.className = "topic-order-actions";
      if (topic.archiveRootId === topic.id) {
        actions.innerHTML = `<button class="small-button" type="button" data-restore-topic="${escapeHtml(topic.id)}">恢复主题</button>`;
      } else {
        actions.innerHTML = "<span class=\"topic-card-meta\">随父主题归档</span>";
      }

      article.appendChild(selectButton);
      article.appendChild(actions);
      group.appendChild(article);
    });

    archivedTopicList.appendChild(group);
  });
}

function renderTopicDetail() {
  const topic = topics.find((item) => item.id === selectedTopicId);
  if (!topic) {
    topicDetail.innerHTML = "<h2>请选择一个主题</h2><p>点击左侧主题后，可以查看它的详情。</p>";
    return;
  }

  const parent = topics.find((item) => item.id === topic.parentId);
  const children = window.LearningDataModel.getOrderedTopics(topics.filter((item) => item.parentId === topic.id));
  const relatedResources = resources.filter((resource) => resource.topicId === topic.id);
  const relatedTodayPlans = getTodayPlans().filter((plan) => plan.topicId === topic.id);
  const relatedProgressRecords = getSortedProgressRecords().filter((progress) => progress.topicId === topic.id);
  const relatedDuration = getTotalDuration(relatedProgressRecords);
  const path = getTopicPath(topic);
  const topicActions = topic.isArchived
    ? topic.archiveRootId === topic.id
      ? `<div class="detail-actions"><button class="secondary-button" type="button" data-restore-topic="${escapeHtml(topic.id)}">恢复主题</button></div>`
      : "<p class=\"topic-card-meta\">该主题随父主题归档，请从归档组根主题恢复。</p>"
    : `<div class="detail-actions"><button class="secondary-button" type="button" data-edit-topic="${escapeHtml(topic.id)}">编辑主题</button><button class="danger-button" type="button" data-archive-topic="${escapeHtml(topic.id)}">归档主题</button></div>`;
  const relatedResourceHeading = topic.isArchived
    ? "<h3>相关资料</h3>"
    : `<div class="section-title-row"><h3>相关资料</h3><button class="small-button" type="button" data-add-resource-topic="${escapeHtml(topic.id)}">新增该主题的资料</button></div>`;

  topicDetail.innerHTML = `
    <div class="panel-heading">
      <p class="eyebrow">${escapeHtml(path)}</p>
      <h2>${escapeHtml(topic.name)}</h2>
      <span class="status-pill">${escapeHtml(topic.status)}</span>
      ${topic.isArchived ? '<span class="status-pill archive-status">已归档</span>' : ""}
    </div>
    <div class="detail-section">
      <h3>描述</h3>
      <p>${escapeHtml(topic.description || "还没有描述，可以后续补充。")}</p>
    </div>
    ${topicActions}
    <div class="detail-section">
      <h3>子主题</h3>
      ${children.length ? `<ul>${children.map((child) => `<li>${escapeHtml(child.name)} · ${escapeHtml(child.status)}</li>`).join("")}</ul>` : "<p>还没有子主题。</p>"}
    </div>
    <div class="detail-section">
      ${relatedResourceHeading}
      ${renderRelatedResources(relatedResources)}
    </div>
    <div class="detail-grid compact-grid">
      <div>
        <h3>今日计划</h3>
        <p>${relatedTodayPlans.length ? `今天有 ${relatedTodayPlans.length} 个任务。` : "今天还没有这个主题的计划。"}</p>
      </div>
      <div>
        <h3>学习笔记</h3>
        <p>${notes.filter((note) => note.topicId === topic.id).length ? `已有 ${notes.filter((note) => note.topicId === topic.id).length} 条笔记。` : "还没有这个主题的笔记。"}</p>
      </div>
      <div>
        <h3>学习进度</h3>
        <p>${relatedProgressRecords.length ? `累计 ${relatedDuration} 分钟，记录 ${relatedProgressRecords.length} 次。` : "还没有学习进度记录。"}</p>
      </div>
    </div>
    <div class="detail-section">
      <h3>最近学习进度</h3>
      ${renderRecentProgressRecords(relatedProgressRecords, "这个主题还没有学习进度记录。")}
    </div>
  `;
}

function renderRelatedResources(relatedResources) {
  if (!relatedResources.length) {
    return "<p>这个主题还没有关联资料。</p>";
  }

  return `
    <div class="mini-list">
      ${relatedResources
        .map(
          (resource) => `
            <button class="mini-card" type="button" data-view-resource="${escapeHtml(resource.id)}">
              <span>${escapeHtml(resource.title)}</span>
              <small>${escapeHtml(resource.type)} · 资料整体状态：${escapeHtml(resource.status)}</small>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderResourceSummary() {
  const activeCount = resources.filter((resource) => resource.status === "学习中").length;
  resourceSummary.textContent = `当前共有 ${resources.length} 份资料，其中 ${activeCount} 份正在学习。`;
}

function renderResourceList() {
  resourceList.innerHTML = "";

  resources.forEach((resource) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = resource.id === selectedResourceId ? "topic-card selected" : "topic-card";
    button.addEventListener("click", () => {
      selectedResourceId = resource.id;
      renderResourceList();
      renderResourceDetail();
    });

    button.innerHTML = `
      <span class="topic-card-title">${escapeHtml(resource.title)}</span>
      <span class="topic-card-meta">${escapeHtml(getTopicAssociationLabel(resource.topicId, "未找到主题"))} · ${escapeHtml(resource.type)} · 资料整体状态：${escapeHtml(resource.status)}</span>
      <span class="topic-card-description">这份资料用于支持对应学习主题。</span>
    `;
    resourceList.appendChild(button);
  });
}

function renderResourceDetail() {
  const resource = resources.find((item) => item.id === selectedResourceId);
  if (!resource) {
    resourceDetail.innerHTML = "<h2>请选择一份资料</h2><p>点击左侧资料后，可以查看它的详情。</p>";
    return;
  }

  const topicLabel = getTopicAssociationLabel(resource.topicId, "未找到主题");
  const relatedProgressRecords = getSortedProgressRecords().filter((progress) => progress.resourceId === resource.id);
  const todayPlanSummary = window.LearningDataModel.getResourceTodayPlanSummary(plans, resource.id, getToday());
  resourceDetail.innerHTML = `
    <div class="panel-heading">
      <p class="eyebrow">${escapeHtml(topicLabel)}</p>
      <h2>${escapeHtml(resource.title)}</h2>
      <div class="status-context">
        <span>资料整体状态</span>
        <span class="status-pill">${escapeHtml(resource.status)}</span>
      </div>
    </div>
    <div class="detail-actions">
      <button class="secondary-button" type="button" data-edit-resource="${escapeHtml(resource.id)}">编辑资料</button>
      <button class="danger-button" type="button" data-delete-resource="${escapeHtml(resource.id)}">删除资料</button>
    </div>
    <div class="detail-section">
      <h3>所属学习主题</h3>
      <p>${escapeHtml(topicLabel)}</p>
    </div>
    <div class="detail-section">
      <h3>资料类型</h3>
      <p>${escapeHtml(resource.type)}</p>
    </div>
    <div class="detail-section">
      <h3>今日关联任务状态</h3>
      <p>${todayPlanSummary.total ? `已完成 ${todayPlanSummary.completed}/${todayPlanSummary.total}` : "今天没有关联这份资料的任务。"}</p>
    </div>
    <div class="detail-section">
      <h3>学习进度</h3>
      <p>${relatedProgressRecords.length ? `已有 ${relatedProgressRecords.length} 条关联记录，累计 ${getTotalDuration(relatedProgressRecords)} 分钟。` : "还没有关联的学习进度记录。"}</p>
      ${renderRecentProgressRecords(relatedProgressRecords, "")}
    </div>
  `;
}

function renderPlanHeader() {
  setPlanDateDefaults();
  planDate.textContent = `今天是 ${getToday()}。普通计划用于今天或未来，过去遗漏的安排可选择“历史补录”。`;
}

function renderPlanList() {
  const visiblePlans = getPlansForSelectedView();
  const completedCount = visiblePlans.filter(({ plan }) => plan.isCompleted).length;
  const viewDetails = {
    today: { heading: "今天的任务", empty: "今天还没有学习计划，可以先添加一个小任务。" },
    future: { heading: "未来计划", empty: "还没有未来的学习计划。" },
    history: { heading: "历史计划", empty: "还没有可回看的历史计划。" },
  };
  const view = viewDetails[selectedPlanView];

  planListHeading.textContent = view.heading;
  planSummary.textContent = selectedPlanView === "today"
    ? `今天共有 ${visiblePlans.length} 个任务，已完成 ${completedCount} 个。`
    : `${view.heading}共有 ${visiblePlans.length} 个任务，已完成 ${completedCount} 个。`;
  Array.from(planViewTabs.querySelectorAll("[data-plan-view]")).forEach((button) => {
    const isSelected = button.dataset.planView === selectedPlanView;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-selected", String(isSelected));
  });
  planList.innerHTML = "";

  if (!visiblePlans.length) {
    planList.innerHTML = `<p class="empty-state">${view.empty}</p>`;
    return;
  }

  visiblePlans.forEach(({ plan, classification }) => {
    const resource = resources.find((item) => item.id === plan.resourceId);
    const relatedProgressRecords = getSortedProgressRecords().filter((progress) => progress.planId === plan.id);
    const article = document.createElement("article");
    article.className = `plan-card${plan.isCompleted ? " completed" : ""}${classification === "overdue" ? " overdue" : ""}`;

    article.innerHTML = `
      <div class="plan-card-main">
        <span class="plan-check">${plan.isCompleted ? "✓" : "□"}</span>
        <div>
          <div class="plan-card-title-row">
            <h3>${escapeHtml(plan.task)}</h3>
            ${plan.isBackfilled ? '<span class="status-pill backfill-status">事后补录</span>' : ""}
          </div>
          <p class="plan-status-text">${getPlanStatusLabel(plan, classification)}</p>
          <p>${getPlanDateLabel(plan, classification)}</p>
          <p>优先级：${escapeHtml(plan.priority)}${plan.estimatedMinutes ? ` · 预计时长：${plan.estimatedMinutes} 分钟` : ""}</p>
          <p>主题：${escapeHtml(getTopicAssociationLabel(plan.topicId, "未找到主题"))}</p>
          <p>资料：${escapeHtml(getPlanResourceLabel(plan, resource))}</p>
          <p>学习进度：${relatedProgressRecords.length ? `${relatedProgressRecords.length} 条，累计 ${getTotalDuration(relatedProgressRecords)} 分钟` : "暂无记录"}</p>
        </div>
      </div>
      <div class="detail-actions">
        <button class="secondary-button" type="button" data-toggle-plan="${escapeHtml(plan.id)}">${plan.isCompleted ? "取消完成" : "完成"}</button>
        <button class="danger-button" type="button" data-delete-plan="${escapeHtml(plan.id)}">删除</button>
      </div>
    `;

    planList.appendChild(article);
  });
}

function renderNoteSummary() {
  noteSummary.textContent = `当前共有 ${notes.length} 条笔记。`;
}

function renderNoteList() {
  const sortedNotes = [...notes].sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt));
  noteList.innerHTML = "";

  if (!sortedNotes.length) {
    noteList.innerHTML = '<p class="empty-state">还没有学习笔记，先记录一次学习收获吧。</p>';
    return;
  }

  sortedNotes.forEach((note) => {
    const button = document.createElement("button");
    button.className = note.id === selectedNoteId ? "topic-card selected" : "topic-card";
    button.type = "button";
    button.dataset.viewNote = note.id;
    button.innerHTML = `
      <span class="topic-card-title">${escapeHtml(note.title)}</span>
      <span class="topic-card-meta">${escapeHtml(getTopicAssociationLabel(note.topicId, "所属主题已删除"))}</span>
      <span class="topic-card-meta">更新于 ${escapeHtml(formatDateTime(note.updatedAt))}</span>
    `;
    noteList.appendChild(button);
  });
}

function renderNoteDetail() {
  const note = notes.find((item) => item.id === selectedNoteId);
  if (!note) {
    noteDetail.innerHTML = '<p class="empty-state">选择一条笔记后，可以在这里查看完整内容。</p>';
    return;
  }

  const resource = resources.find((item) => item.id === note.resourceId);
  const plan = plans.find((item) => item.id === note.planId);
  const resourceLabel = note.resourceId ? (resource ? resource.title : "关联资料已删除") : "未关联资料";
  const planLabel = note.planId ? (plan ? plan.task : "关联学习计划已删除") : "未关联学习计划";

  noteDetail.innerHTML = `
    <div class="panel-heading">
      <p class="eyebrow">${escapeHtml(getTopicAssociationLabel(note.topicId, "所属主题已删除"))}</p>
      <h2>${escapeHtml(note.title)}</h2>
    </div>
    <div class="detail-actions">
      <button class="secondary-button" type="button" data-edit-note="${escapeHtml(note.id)}">编辑笔记</button>
      <button class="danger-button" type="button" data-delete-note="${escapeHtml(note.id)}">删除笔记</button>
    </div>
    <div class="detail-section">
      <h3>笔记内容</h3>
      <p class="note-content">${escapeHtml(note.content)}</p>
    </div>
    <div class="detail-section">
      <h3>所属学习主题</h3>
      <p>${escapeHtml(getTopicAssociationLabel(note.topicId, "所属主题已删除"))}</p>
    </div>
    <div class="detail-section">
      <h3>关联学习资料</h3>
      <p>${escapeHtml(resourceLabel)}</p>
    </div>
    <div class="detail-section">
      <h3>关联学习计划</h3>
      <p>${escapeHtml(planLabel)}</p>
    </div>
    <div class="detail-section">
      <h3>记录时间</h3>
      <p>创建于 ${escapeHtml(formatDateTime(note.createdAt))}</p>
      <p>更新于 ${escapeHtml(formatDateTime(note.updatedAt))}</p>
    </div>
  `;
}

function startNoteEditing(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }

  editingNoteId = note.id;
  noteFormPanel.setAttribute("aria-label", "编辑学习笔记");
  noteFormTitle.textContent = "编辑笔记";
  noteFormDescription.textContent = "修改笔记内容或关联信息后，创建时间会保持不变。";
  noteSubmitButton.textContent = "保存修改";
  cancelNoteEditButton.classList.remove("hidden");
  noteSaveMessage.textContent = "";
  updateNoteTopicOptions();
  if (isTopicAssociationLocked(note)) {
    setLockedTopicSelect(noteTopicSelect, note.topicId, "所属主题已删除");
  } else {
    noteTopicSelect.value = note.topicId;
  }
  updateNoteRelatedOptions();
  noteResourceSelect.value = note.resourceId || "";
  notePlanSelect.value = note.planId || "";
  document.querySelector("#noteTitle").value = note.title;
  document.querySelector("#noteContent").value = note.content;
  noteFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#noteTitle").focus();
}

function resetNoteForm() {
  editingNoteId = "";
  noteForm.reset();
  noteFormPanel.setAttribute("aria-label", "新增学习笔记");
  noteFormTitle.textContent = "新增笔记";
  noteFormDescription.textContent = "先选择所属学习主题；资料和学习计划可以不选。";
  noteSubmitButton.textContent = "保存笔记";
  cancelNoteEditButton.classList.add("hidden");
  updateNoteTopicOptions();
  updateNoteRelatedOptions();
}

function deleteNote(noteId) {
  const note = notes.find((item) => item.id === noteId);
  if (!note) {
    return;
  }

  const confirmed = window.confirm(`确定要删除“${note.title}”吗？删除后无法恢复。`);
  if (!confirmed) {
    return;
  }

  notes = notes.filter((item) => item.id !== noteId);
  selectedNoteId = [...notes].sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))[0]?.id || "";
  saveItems(NOTE_STORAGE_KEY, notes);

  if (editingNoteId === noteId) {
    resetNoteForm();
  }

  noteSaveMessage.textContent = "笔记已删除。";
  renderNoteSummary();
  renderNoteList();
  renderNoteDetail();
}

function renderProgressOverview() {
  const totalDuration = getTotalDuration(progressRecords);
  const sortedProgressRecords = getSortedProgressRecords();
  const latestDate = sortedProgressRecords[0]?.date || "暂无记录";

  progressOverview.innerHTML = `
    <div>
      <h3>累计学习时长</h3>
      <p>${totalDuration} 分钟</p>
    </div>
    <div>
      <h3>进度记录次数</h3>
      <p>${progressRecords.length} 次</p>
    </div>
    <div>
      <h3>最近记录日期</h3>
      <p>${escapeHtml(latestDate)}</p>
    </div>
  `;
}

function renderProgressList() {
  const sortedProgressRecords = getSortedProgressRecords();
  progressSummary.textContent = `当前共有 ${sortedProgressRecords.length} 条进度记录。`;
  progressList.innerHTML = "";

  if (!sortedProgressRecords.length) {
    progressList.innerHTML = '<p class="empty-state">还没有学习进度记录，完成一次学习后就来记一笔吧。</p>';
    return;
  }

  sortedProgressRecords.forEach((progress) => {
    const article = document.createElement("article");
    article.className = "progress-card";
    article.innerHTML = renderProgressRecordCard(progress, true);
    progressList.appendChild(article);
  });
}

function renderRecentProgressRecords(progressRecordsToRender, emptyMessage) {
  if (!progressRecordsToRender.length) {
    return emptyMessage ? `<p>${escapeHtml(emptyMessage)}</p>` : "";
  }

  return `
    <div class="mini-list">
      ${progressRecordsToRender
        .slice(0, 3)
        .map((progress) => `<article class="progress-card">${renderProgressRecordCard(progress)}</article>`)
        .join("")}
    </div>
  `;
}

function renderProgressRecordCard(progress, includeActions = false) {
  const resource = resources.find((item) => item.id === progress.resourceId);
  const plan = plans.find((item) => item.id === progress.planId);
  const resourceLabel = progress.resourceId ? (resource ? resource.title : "原关联资料已删除") : "未关联资料";
  const planLabel = progress.planId ? (plan ? plan.task : "原关联计划已删除") : "未关联计划";
  const completion = getCompletionStatus(progress.completionPercent);

  return `
    <div class="progress-card-header">
      <h3>${escapeHtml(progress.date)} · ${escapeHtml(getTopicAssociationLabel(progress.topicId, "原关联主题已删除"))}</h3>
      <span class="completion-pill ${completion.className}">${escapeHtml(completion.label)} ${progress.completionPercent}%</span>
    </div>
    <div class="progress-card-meta">
      <span>时长：${progress.durationMinutes} 分钟</span>
      <span>资料：${escapeHtml(resourceLabel)}</span>
      <span>计划：${escapeHtml(planLabel)}</span>
    </div>
    ${progress.reflection ? `<p>总结：${escapeHtml(progress.reflection)}</p>` : ""}
    ${includeActions ? `<div class="detail-actions"><button class="secondary-button" type="button" data-edit-progress="${escapeHtml(progress.id)}">编辑</button><button class="danger-button" type="button" data-delete-progress="${escapeHtml(progress.id)}">删除</button></div>` : ""}
  `;
}

async function generateProgressDraftFromDescription() {
  const description = aiProgressDescription.value.trim();
  if (!description) {
    aiProgressStatus.textContent = "请先输入学习描述。";
    aiProgressStatus.classList.add("is-error");
    return;
  }

  if (isProgressDraftGenerating) {
    return;
  }

  isProgressDraftGenerating = true;
  generateProgressDraftButton.disabled = true;
  aiProgressStatus.classList.remove("is-error");
  aiProgressStatus.textContent = "正在生成进度草稿……";
  const requestToken = ++progressDraftRequestToken;

  try {
    const result = await window.AIService.generateProgressDraft({
      description,
      referenceDate: getToday(),
      context: { directions: learningDirections, topics: getActiveTopics(), resources, plans },
    });
    if (requestToken !== progressDraftRequestToken) {
      return;
    }
    applyProgressDraft(result);
  } catch {
    if (requestToken !== progressDraftRequestToken) {
      return;
    }
    aiProgressStatus.textContent = "草稿生成失败，请重试或手动填写。";
    aiProgressStatus.classList.add("is-error");
  } finally {
    if (requestToken === progressDraftRequestToken) {
      isProgressDraftGenerating = false;
      generateProgressDraftButton.disabled = false;
    }
  }
}

function applyProgressDraft(result) {
  const draft = result.draft;
  editingProgressId = "";
  progressForm.reset();
  progressFormPanel.setAttribute("aria-label", "新增学习进度记录");
  progressFormTitle.textContent = "新增进度记录";
  progressFormDescription.textContent = "可补录今天或过去的学习日期；先选择学习主题，资料和学习计划可以不选。";
  cancelProgressEditButton.classList.add("hidden");
  progressSaveMessage.textContent = "";
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
  isProgressDraftActive = true;
  progressSubmitButton.textContent = "确认并保存";
  discardProgressDraftButton.classList.remove("hidden");
  renderProgressDraftFeedback(result);
}

function renderProgressDraftFeedback(result) {
  const fieldLabels = {
    date: "记录日期",
    topicId: "学习主题",
    resourceId: "关联资料",
    planId: "关联计划",
    durationMinutes: "学习时长",
    completionPercent: "完成度",
    reflection: "简短总结",
  };
  const requiredFields = ["date", "topicId", "durationMinutes", "completionPercent"];
  const optionalAssociationFields = ["resourceId", "planId"];
  const optionalSummaryFields = ["reflection"];
  const requiredMissingLabels = result.missingFields.filter((field) => requiredFields.includes(field)).map((field) => fieldLabels[field]);
  const optionalMissingLabels = result.missingFields.filter((field) => optionalAssociationFields.includes(field)).map((field) => fieldLabels[field]);
  const optionalSummaryLabels = result.missingFields.filter((field) => optionalSummaryFields.includes(field)).map((field) => fieldLabels[field]);
  const feedback = [
    ...result.warnings,
    ...(requiredMissingLabels.length ? [`还需补充：${requiredMissingLabels.join("、")}。`] : []),
    ...(optionalMissingLabels.length ? [`可选关联：${optionalMissingLabels.join("、")}。`] : []),
    ...(optionalSummaryLabels.length ? [`可选补充：${optionalSummaryLabels.join("、")}。`] : []),
  ];

  aiProgressPanel.classList.add("is-draft-ready");
  aiProgressStatus.classList.remove("is-error");
  aiProgressStatus.textContent = feedback.length ? "草稿已生成，请检查并补充后确认保存。" : "草稿已生成，请检查后确认保存。";
  aiProgressWarnings.innerHTML = "";
  feedback.forEach((message) => {
    const item = document.createElement("li");
    item.textContent = message;
    aiProgressWarnings.appendChild(item);
  });
  aiProgressWarnings.classList.toggle("hidden", feedback.length === 0);
}

function clearProgressDraftState({ resetForm }) {
  invalidateProgressDraftRequest();
  isProgressDraftActive = false;
  aiProgressDescription.value = "";
  aiProgressStatus.textContent = "";
  aiProgressStatus.classList.remove("is-error");
  aiProgressWarnings.innerHTML = "";
  aiProgressWarnings.classList.add("hidden");
  aiProgressPanel.classList.remove("is-draft-ready");
  discardProgressDraftButton.classList.add("hidden");

  if (resetForm) {
    resetProgressForm();
  }
}

function invalidateProgressDraftRequest() {
  progressDraftRequestToken += 1;
  isProgressDraftGenerating = false;
  generateProgressDraftButton.disabled = false;
}

function startProgressEditing(progressId) {
  const progress = progressRecords.find((item) => item.id === progressId);
  if (!progress) {
    return;
  }

  clearProgressDraftState({ resetForm: false });
  aiProgressPanel.classList.add("hidden");
  editingProgressId = progress.id;
  progressFormPanel.setAttribute("aria-label", "编辑学习进度记录");
  progressFormTitle.textContent = "编辑进度记录";
  progressFormDescription.textContent = "可修改今天或过去的记录日期、时长、完成度、总结或关联信息。";
  progressSubmitButton.textContent = "保存修改";
  cancelProgressEditButton.classList.remove("hidden");
  progressSaveMessage.textContent = "";
  progressDate.max = getToday();
  progressDate.value = progress.date;
  updateProgressTopicOptions();
  if (isTopicAssociationLocked(progress)) {
    setLockedTopicSelect(progressTopicSelect, progress.topicId, "原关联主题已删除");
  } else {
    progressTopicSelect.value = progress.topicId;
  }
  updateProgressRelatedOptions(true, progress.resourceId || "", progress.planId || "");
  progressDuration.value = progress.durationMinutes;
  progressCompletion.value = progress.completionPercent;
  progressReflection.value = progress.reflection;
  progressFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#progressDuration").focus();
}

function resetProgressForm() {
  editingProgressId = "";
  progressForm.reset();
  aiProgressPanel.classList.remove("hidden");
  progressFormPanel.setAttribute("aria-label", "新增学习进度记录");
  progressFormTitle.textContent = "新增进度记录";
  progressFormDescription.textContent = "可补录今天或过去的学习日期；先选择学习主题，资料和学习计划可以不选。";
  progressSubmitButton.textContent = "保存进度";
  cancelProgressEditButton.classList.add("hidden");
  setProgressDateDefaults();
  updateProgressTopicOptions();
  updateProgressRelatedOptions();
}

function deleteProgress(progressId) {
  const progress = progressRecords.find((item) => item.id === progressId);
  if (!progress) {
    return;
  }

  const confirmed = window.confirm(`确定要删除 ${progress.date} 的这条学习进度记录吗？删除后无法恢复。`);
  if (!confirmed) {
    return;
  }

  progressRecords = progressRecords.filter((item) => item.id !== progressId);
  saveItems(PROGRESS_STORAGE_KEY, progressRecords);

  if (editingProgressId === progressId) {
    resetProgressForm();
  }

  progressSaveMessage.textContent = "进度记录已删除。";
  render();
}

function openResourceForm(topicId = "", resourceId = "") {
  resourceFormPanel.classList.remove("hidden");
  updateResourceTopicOptions();

  const resource = resources.find((item) => item.id === resourceId);
  if (resource) {
    editingResourceId = resource.id;
    resourceFormTitle.textContent = "编辑学习资料";
    resourceFormDescription.textContent = "修改资料基础信息后，资料列表和主题详情会同步更新。";
    resourceSubmitButton.textContent = "保存修改";
    document.querySelector("#resourceTitle").value = resource.title;
    if (isTopicAssociationLocked(resource)) {
      setLockedTopicSelect(resourceTopicSelect, resource.topicId, "未找到主题");
    } else {
      resourceTopicSelect.value = resource.topicId;
    }
    document.querySelector("#resourceType").value = resource.type;
    document.querySelector("#resourceStatus").value = resource.status;
  } else {
    editingResourceId = "";
    resourceForm.reset();
    resourceFormTitle.textContent = "新增学习资料";
    resourceFormDescription.textContent = "V1 只记录资料的基础信息，不做上传、OCR 或 AI 自动整理。";
    resourceSubmitButton.textContent = "保存资料";
    if (topicId) {
      resourceTopicSelect.value = topicId;
    }
  }

  document.querySelector("#resourceTitle").focus();
}

function closeResourceForm() {
  editingResourceId = "";
  resourceForm.reset();
  resourceFormPanel.classList.add("hidden");
  resourceFormTitle.textContent = "新增学习资料";
  resourceFormDescription.textContent = "V1 只记录资料的基础信息，不做上传、OCR 或 AI 自动整理。";
  resourceSubmitButton.textContent = "保存资料";
  updateResourceTopicOptions();
}

function deleteResource(resourceId) {
  const resource = resources.find((item) => item.id === resourceId);
  if (!resource) {
    return;
  }

  const confirmed = window.confirm(`确定要删除“${resource.title}”吗？删除后它会从资料列表和主题详情中消失。`);
  if (!confirmed) {
    return;
  }

  resources = resources.filter((item) => item.id !== resourceId);
  selectedResourceId = resources[0]?.id || "";
  saveItems(RESOURCE_STORAGE_KEY, resources);
  render();
}

function togglePlanCompleted(planId) {
  const selectedPlan = plans.find((plan) => plan.id === planId);
  if (!selectedPlan) {
    return;
  }

  const isCompleted = !selectedPlan.isCompleted;
  const planLabel = selectedPlanView === "today" ? "今日任务" : "学习计划";
  plans = plans.map((plan) => (plan.id === planId ? { ...plan, isCompleted } : plan));
  saveItems(PLAN_STORAGE_KEY, plans);
  render();
  planSaveMessage.textContent = isCompleted ? `${planLabel}已完成并保存。` : `已取消${planLabel}的完成状态。`;
}

function deletePlan(planId) {
  const plan = plans.find((item) => item.id === planId);
  if (!plan) {
    return;
  }

  const confirmed = window.confirm(`确定要删除“${plan.task}”吗？`);
  if (!confirmed) {
    return;
  }

  plans = plans.filter((item) => item.id !== planId);
  saveItems(PLAN_STORAGE_KEY, plans);
  render();
}

function openTopicForm(topicId = "") {
  const topic = topics.find((item) => item.id === topicId);
  topicForm.reset();
  topicFormPanel.classList.remove("hidden");
  closeAddDirectionPanel({ restoreFocus: false });

  if (topic) {
    editingTopicId = topic.id;
    topicFormPanel.setAttribute("aria-label", "编辑学习主题");
    topicFormTitle.textContent = "编辑学习主题";
    topicFormDescription.textContent = "可修改主题名称、学习状态、父主题和描述；学习方向不能修改。";
    topicSubmitButton.textContent = "保存修改";
    document.querySelector("#topicName").value = topic.name;
    renderTopicDirectionOptions(topic.direction);
    directionSelect.disabled = true;
    showAddDirectionButton.classList.add("hidden");
    updateParentOptions();
    parentSelect.value = topic.parentId;
    document.querySelector("#topicStatus").value = topic.status;
    const topicDescription = document.querySelector("#topicDescription");
    topicDescription.value = topic.description || "";
    topicDescription.disabled = true;
  } else {
    editingTopicId = "";
    topicFormPanel.setAttribute("aria-label", "新建学习主题");
    topicFormTitle.textContent = "新建学习主题";
    topicFormDescription.textContent = "只填写最必要的信息，先让系统能用起来。";
    topicSubmitButton.textContent = "保存主题";
    renderTopicDirectionOptions();
    directionSelect.disabled = false;
    showAddDirectionButton.classList.remove("hidden");
    document.querySelector("#topicDescription").disabled = false;
    updateParentOptions();
  }

  document.querySelector("#topicName").focus();
}

function closeTopicForm() {
  editingTopicId = "";
  topicForm.reset();
  closeAddDirectionPanel({ restoreFocus: false });
  directionSelect.disabled = false;
  showAddDirectionButton.classList.remove("hidden");
  document.querySelector("#topicDescription").disabled = false;
  topicFormPanel.setAttribute("aria-label", "新建学习主题");
  topicFormTitle.textContent = "新建学习主题";
  topicFormDescription.textContent = "只填写最必要的信息，先让系统能用起来。";
  topicSubmitButton.textContent = "保存主题";
  topicFormPanel.classList.add("hidden");
  updateParentOptions();
}

function renderTopicDirectionOptions(selectedDirection = "") {
  directionSelect.innerHTML = "";

  const directionsToRender = selectedDirection && !learningDirections.includes(selectedDirection)
    ? [...learningDirections, selectedDirection]
    : learningDirections;

  directionsToRender.forEach((direction) => {
    const option = document.createElement("option");
    option.value = direction;
    option.textContent = direction;
    directionSelect.appendChild(option);
  });

  directionSelect.value = directionsToRender.includes(selectedDirection) ? selectedDirection : learningDirections[0];
  updateParentOptions();
}

function openAddDirectionPanel() {
  if (editingTopicId) {
    return;
  }

  addDirectionPanel.classList.remove("hidden");
  addDirectionMessage.textContent = "";
  addDirectionMessage.classList.remove("is-error");
  newDirectionName.focus();
}

function closeAddDirectionPanel({ restoreFocus = true } = {}) {
  addDirectionPanel.classList.add("hidden");
  newDirectionName.value = "";
  addDirectionMessage.textContent = "";
  addDirectionMessage.classList.remove("is-error");

  if (restoreFocus && !editingTopicId) {
    showAddDirectionButton.focus();
  }
}

function addDirectionFromForm() {
  const result = window.LearningDataModel.addLearningDirection(learningDirections, newDirectionName.value);

  if (result.error) {
    addDirectionMessage.textContent = result.error === "empty" ? "请输入学习方向名称。" : "该学习方向已存在。";
    addDirectionMessage.classList.add("is-error");
    return;
  }

  learningDirections = result.directions;
  saveItems(LEARNING_DIRECTION_STORAGE_KEY, learningDirections);
  renderTopicDirectionOptions(result.addedDirection);
  newDirectionName.value = "";
  addDirectionMessage.textContent = `已新增学习方向：${result.addedDirection}。`;
  addDirectionMessage.classList.remove("is-error");
  document.querySelector("#topicName").focus();
}

function archiveTopic(topicId) {
  const topic = topics.find((item) => item.id === topicId);
  if (!topic || topic.isArchived) {
    return;
  }

  const topicIds = window.LearningDataModel.getTopicDescendantIds(topics, topicId);
  const impact = window.LearningDataModel.getTopicArchiveImpact(topicIds, resources, plans, notes, progressRecords);
  const confirmed = window.confirm(
    `将归档 ${impact.topics} 个主题（含全部子主题）。\n关联资料：${impact.resources} 条；计划：${impact.plans} 条；笔记：${impact.notes} 条；进度：${impact.progressRecords} 条。\n历史数据会保留，但归档后不能新增或改关联到这些主题。\n本次不会删除任何数据。是否继续？`,
  );

  if (!confirmed) {
    return;
  }

  const result = window.LearningDataModel.archiveTopicTree(topics, topicId, new Date().toISOString());
  topics = result.topics;
  if (topicIds.includes(selectedTopicId)) {
    selectedTopicId = window.LearningDataModel.getOrderedTopics(window.LearningDataModel.getActiveTopics(topics))[0]?.id || "";
  }
  if (topicIds.includes(editingTopicId)) {
    closeTopicForm();
  }
  saveItems(TOPIC_STORAGE_KEY, topics);
  render();
}

function restoreTopic(archiveRootId) {
  const archiveRoot = topics.find(
    (topic) => topic.id === archiveRootId && topic.isArchived && topic.archiveRootId === archiveRootId,
  );
  if (!archiveRoot) {
    return;
  }

  const confirmed = window.confirm(`确定要恢复“${archiveRoot.name}”及其全部子主题吗？恢复后可再次编辑并用于新的学习关联。`);
  if (!confirmed) {
    return;
  }

  const result = window.LearningDataModel.restoreTopicTree(topics, archiveRootId);
  if (!result.restored) {
    return;
  }

  topics = result.topics;
  selectedTopicId = archiveRootId;
  saveItems(TOPIC_STORAGE_KEY, topics);
  render();
}

function updateParentOptions() {
  const direction = directionSelect.value;
  const parentOptions = editingTopicId
    ? window.LearningDataModel.getAllowedParentTopics(topics, editingTopicId, direction)
    : window.LearningDataModel.getActiveTopics(topics).filter((topic) => topic.direction === direction);
  parentSelect.innerHTML = '<option value="">无</option>';

  parentOptions.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = topic.name;
    parentSelect.appendChild(option);
  });
}

function getActiveTopics() {
  return window.LearningDataModel.getActiveTopics(topics);
}

function isActiveTopicId(topicId) {
  return getActiveTopics().some((topic) => topic.id === topicId);
}

function getTopicAssociationLabel(topicId, missingLabel = "原关联主题已删除") {
  const topic = topics.find((item) => item.id === topicId);
  if (!topic) {
    return missingLabel;
  }

  return `${getTopicPath(topic)}${topic.isArchived ? " · 已归档" : ""}`;
}

function isTopicAssociationLocked(record) {
  return Boolean(record && !isActiveTopicId(record.topicId));
}

function preserveLockedTopicAssociation(record, submittedTopicId) {
  return isTopicAssociationLocked(record) ? record.topicId : submittedTopicId;
}

function setLockedTopicSelect(select, topicId, missingLabel) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = topicId;
  option.textContent = `${getTopicAssociationLabel(topicId, missingLabel)}（关联不可修改）`;
  option.selected = true;
  select.appendChild(option);
  select.disabled = true;
}

function setEmptyTopicOption(select) {
  select.innerHTML = '<option value="">请先创建或恢复学习主题</option>';
  select.disabled = true;
}

function updateResourceTopicOptions() {
  const activeTopics = getActiveTopics();
  resourceTopicSelect.innerHTML = "";

  if (!activeTopics.length) {
    setEmptyTopicOption(resourceTopicSelect);
    resourceSubmitButton.disabled = !editingResourceId;
    return;
  }

  resourceTopicSelect.disabled = false;
  resourceSubmitButton.disabled = false;
  window.LearningDataModel.getOrderedTopics(activeTopics).forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    resourceTopicSelect.appendChild(option);
  });
}

function updatePlanTopicOptions() {
  const currentValue = planTopicSelect.value;
  const activeTopics = getActiveTopics();
  planTopicSelect.innerHTML = "";

  if (!activeTopics.length) {
    setEmptyTopicOption(planTopicSelect);
    planResourceSelect.disabled = true;
    planTaskInput.disabled = true;
    updatePlanSubmitAvailability();
    return;
  }

  planTopicSelect.disabled = false;
  planTaskInput.disabled = false;

  window.LearningDataModel.getOrderedTopics(activeTopics).forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    planTopicSelect.appendChild(option);
  });

  if (activeTopics.some((topic) => topic.id === currentValue)) {
    planTopicSelect.value = currentValue;
  }

  updatePlanSubmitAvailability();
}

function updatePlanResourceOptions() {
  const topicId = planTopicSelect.value;
  const relatedResources = resources.filter((resource) => resource.topicId === topicId);
  planResourceSelect.innerHTML = '<option value="">不关联资料</option>';

  relatedResources.forEach((resource) => {
    const option = document.createElement("option");
    option.value = resource.id;
    option.textContent = resource.title;
    planResourceSelect.appendChild(option);
  });

  planResourceSelect.disabled = !getActiveTopics().length;
}

function updateNoteTopicOptions() {
  const currentValue = noteTopicSelect.value;
  const activeTopics = getActiveTopics();
  noteTopicSelect.innerHTML = "";

  if (!activeTopics.length) {
    setEmptyTopicOption(noteTopicSelect);
    noteResourceSelect.disabled = true;
    notePlanSelect.disabled = true;
    noteSubmitButton.disabled = !editingNoteId;
    return;
  }

  noteTopicSelect.disabled = false;
  noteSubmitButton.disabled = false;
  window.LearningDataModel.getOrderedTopics(activeTopics).forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    noteTopicSelect.appendChild(option);
  });

  if (activeTopics.some((topic) => topic.id === currentValue)) {
    noteTopicSelect.value = currentValue;
  }
}

function updateNoteRelatedOptions() {
  const topicId = noteTopicSelect.value;
  const relatedResources = resources.filter((resource) => resource.topicId === topicId);
  const relatedPlans = plans.filter((plan) => plan.topicId === topicId);

  noteResourceSelect.innerHTML = '<option value="">不关联资料</option>';
  relatedResources.forEach((resource) => {
    const option = document.createElement("option");
    option.value = resource.id;
    option.textContent = resource.title;
    noteResourceSelect.appendChild(option);
  });

  notePlanSelect.innerHTML = '<option value="">不关联学习计划</option>';
  relatedPlans.forEach((plan) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = plan.task;
    notePlanSelect.appendChild(option);
  });

  noteResourceSelect.disabled = !getActiveTopics().length && !editingNoteId;
  notePlanSelect.disabled = !getActiveTopics().length && !editingNoteId;
}

function updateProgressTopicOptions({ allowEmpty = false } = {}) {
  const currentValue = progressTopicSelect.value;
  const activeTopics = getActiveTopics();
  progressTopicSelect.innerHTML = "";

  if (!activeTopics.length) {
    setEmptyTopicOption(progressTopicSelect);
    progressResourceSelect.disabled = true;
    progressPlanSelect.disabled = true;
    progressSubmitButton.disabled = !editingProgressId;
    return;
  }

  progressTopicSelect.disabled = false;
  progressSubmitButton.disabled = false;
  if (allowEmpty) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请选择学习主题";
    progressTopicSelect.appendChild(option);
  }
  window.LearningDataModel.getOrderedTopics(activeTopics).forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    progressTopicSelect.appendChild(option);
  });

  if (activeTopics.some((topic) => topic.id === currentValue)) {
    progressTopicSelect.value = currentValue;
  }
  if (allowEmpty) {
    progressTopicSelect.value = "";
  }
}

function updateProgressRelatedOptions(preserveMissingAssociations = false, preservedResourceId = "", preservedPlanId = "") {
  const topicId = progressTopicSelect.value;
  const progressDateValue = progressDate.value;
  const currentResourceId = preservedResourceId || progressResourceSelect.value;
  const currentPlanId = preservedPlanId || progressPlanSelect.value;
  const relatedResources = resources.filter((resource) => resource.topicId === topicId);
  const eligiblePlans = window.LearningDataModel.getEligiblePlansForProgress(plans, topicId, progressDateValue);

  progressResourceSelect.innerHTML = '<option value="">不关联资料</option>';
  relatedResources.forEach((resource) => {
    const option = document.createElement("option");
    option.value = resource.id;
    option.textContent = resource.title;
    progressResourceSelect.appendChild(option);
  });

  if (preserveMissingAssociations && currentResourceId && !resources.some((resource) => resource.id === currentResourceId)) {
    const option = document.createElement("option");
    option.value = currentResourceId;
    option.textContent = "原关联资料已删除";
    progressResourceSelect.appendChild(option);
  }

  progressPlanSelect.innerHTML = '<option value="">不关联学习计划</option>';
  eligiblePlans.forEach((plan) => {
    const option = document.createElement("option");
    option.value = plan.id;
    option.textContent = `${plan.date} · ${plan.task}`;
    progressPlanSelect.appendChild(option);
  });

  if (preserveMissingAssociations && currentPlanId) {
    const currentPlan = plans.find((plan) => plan.id === currentPlanId);

    if (!currentPlan) {
      const option = document.createElement("option");
      option.value = currentPlanId;
      option.textContent = "原关联学习计划已删除";
      progressPlanSelect.appendChild(option);
    } else if (!eligiblePlans.some((plan) => plan.id === currentPlanId)) {
      const option = document.createElement("option");
      option.value = currentPlanId;
      option.textContent = "原关联学习计划不符合当前主题或日期，请清除关联或修改日期";
      progressPlanSelect.appendChild(option);
    }
  }

  if (relatedResources.some((resource) => resource.id === currentResourceId) || (preserveMissingAssociations && currentResourceId && !resources.some((resource) => resource.id === currentResourceId))) {
    progressResourceSelect.value = currentResourceId;
  }

  if (eligiblePlans.some((plan) => plan.id === currentPlanId) || (preserveMissingAssociations && currentPlanId)) {
    progressPlanSelect.value = currentPlanId;
  }

  progressResourceSelect.disabled = !getActiveTopics().length && !editingProgressId;
  progressPlanSelect.disabled = !getActiveTopics().length && !editingProgressId;
}

function groupByDirection(items) {
  return items.reduce((groups, topic) => {
    if (!groups[topic.direction]) {
      groups[topic.direction] = [];
    }
    groups[topic.direction].push(topic);
    return groups;
  }, {});
}

function getTopicPath(topic) {
  const parent = topics.find((item) => item.id === topic.parentId);
  return parent ? `${topic.direction} > ${parent.name} > ${topic.name}` : `${topic.direction} > ${topic.name}`;
}

function getLocalDate(dayOffset = 0) {
  const date = new Date();
  date.setDate(date.getDate() + dayOffset);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getToday() {
  return getLocalDate();
}

function isPlanBackfillMode() {
  return planEntryModeSelect.value === "backfill";
}

function setPlanDateDefaults({ resetInvalidDate = false } = {}) {
  const today = getToday();
  const yesterday = getLocalDate(-1);

  if (isPlanBackfillMode()) {
    planScheduleDate.removeAttribute("min");
    planScheduleDate.max = yesterday;
    if (!planScheduleDate.value || (resetInvalidDate && planScheduleDate.value >= today)) {
      planScheduleDate.value = yesterday;
    }
  } else {
    planScheduleDate.min = today;
    planScheduleDate.removeAttribute("max");
    if (!planScheduleDate.value || (resetInvalidDate && planScheduleDate.value < today)) {
      planScheduleDate.value = today;
    }
  }

  validatePlanScheduleDate();
}

function isAllowedPlanScheduleDate() {
  const date = planScheduleDate.value;
  const today = getToday();

  if (!isValidPlanDateValue(date)) {
    return false;
  }

  return isPlanBackfillMode() ? date < today : date >= today;
}

function updatePlanSubmitAvailability() {
  planSubmitButton.disabled = !getActiveTopics().length || !isAllowedPlanScheduleDate();
}

function validatePlanScheduleDate() {
  const isAllowedDate = isAllowedPlanScheduleDate();
  const message = !planScheduleDate.value || isAllowedDate
    ? ""
    : isPlanBackfillMode()
      ? "历史补录只能选择过去日期；今天或未来请使用“普通计划”。"
      : "普通计划只能选择今天或未来；如需补记过去，请选择“历史补录”。";
  planScheduleDate.setCustomValidity(message);
  planScheduleDate.setAttribute("aria-invalid", String(Boolean(planScheduleDate.value) && !isAllowedDate));
  planDateError.textContent = message;
  updatePlanSubmitAvailability();
  return isAllowedDate;
}

function setProgressDateDefaults() {
  const today = getToday();
  progressDate.max = today;
  if (!progressDate.value) {
    progressDate.value = today;
  }
}

function getTodayPlans() {
  const today = getToday();
  return plans.filter((plan) => plan.date === today);
}

function getPlansForSelectedView() {
  const today = getToday();
  const entries = plans.map((plan, index) => ({
    plan,
    index,
    classification: window.LearningDataModel.classifyPlanDate(plan, today),
  }));

  if (selectedPlanView === "today") {
    return entries.filter((entry) => entry.classification === "today");
  }

  if (selectedPlanView === "future") {
    return entries
      .filter((entry) => entry.classification === "future")
      .sort((first, second) => first.plan.date.localeCompare(second.plan.date) || first.index - second.index);
  }

  return entries
    .filter((entry) => ["overdue", "history"].includes(entry.classification))
    .sort((first, second) => {
      const firstHasValidDate = isValidPlanDateValue(first.plan.date);
      const secondHasValidDate = isValidPlanDateValue(second.plan.date);

      if (firstHasValidDate && secondHasValidDate) {
        return second.plan.date.localeCompare(first.plan.date) || first.index - second.index;
      }

      if (firstHasValidDate !== secondHasValidDate) {
        return firstHasValidDate ? -1 : 1;
      }

      return first.index - second.index;
    });
}

function isValidPlanDateValue(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return false;
  }

  const [year, month, day] = date.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function getPlanStatusLabel(plan, classification) {
  if (classification === "today") {
    return `今日任务状态：${plan.isCompleted ? "已完成" : "未完成"}`;
  }

  if (classification === "overdue") {
    return "计划状态：已逾期";
  }

  return `计划状态：${plan.isCompleted ? "已完成" : "未完成"}`;
}

function getPlanDateLabel(plan, classification) {
  if (!isValidPlanDateValue(plan.date)) {
    return `日期异常：${escapeHtml(typeof plan.date === "string" && plan.date ? plan.date : "未设置")}`;
  }

  if (classification === "overdue") {
    return `原计划日期：${escapeHtml(plan.date)}（已逾期）`;
  }

  return `计划日期：${escapeHtml(plan.date)}`;
}

function getPlanResourceLabel(plan, resource) {
  if (!plan.resourceId) {
    return "未关联资料";
  }

  return resource ? resource.title : "资料已删除";
}

function getSortedProgressRecords() {
  return [...progressRecords].sort((first, second) => {
    const dateDifference = second.date.localeCompare(first.date);
    return dateDifference || new Date(second.updatedAt) - new Date(first.updatedAt);
  });
}

function getTotalDuration(items) {
  return items.reduce((total, item) => total + item.durationMinutes, 0);
}

function getCompletionStatus(completionPercent) {
  if (completionPercent === 100) {
    return { label: "已完成", className: "completed" };
  }

  if (completionPercent > 0) {
    return { label: "进行中", className: "in-progress" };
  }

  return { label: "未完成", className: "not-started" };
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
