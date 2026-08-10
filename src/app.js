const TOPIC_STORAGE_KEY = "personal-learning-system-topics";
const RESOURCE_STORAGE_KEY = "personal-learning-system-resources";
const PLAN_STORAGE_KEY = "personal-learning-system-plans";

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

let topics = loadItems(TOPIC_STORAGE_KEY, defaultTopics);
let resources = loadItems(RESOURCE_STORAGE_KEY, defaultResources);
let plans = loadItems(PLAN_STORAGE_KEY, []);
let selectedTopicId = topics[0]?.id || "";
let selectedResourceId = resources[0]?.id || "";
let editingResourceId = "";

const topicList = document.querySelector("#topicList");
const topicDetail = document.querySelector("#topicDetail");
const topicSummary = document.querySelector("#topicSummary");
const topicFormPanel = document.querySelector("#topicFormPanel");
const topicForm = document.querySelector("#topicForm");
const showFormButton = document.querySelector("#showFormButton");
const cancelFormButton = document.querySelector("#cancelFormButton");
const parentSelect = document.querySelector("#topicParent");
const directionSelect = document.querySelector("#topicDirection");

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
const planTaskInput = document.querySelector("#planTask");
const planSummary = document.querySelector("#planSummary");
const planList = document.querySelector("#planList");

showFormButton.addEventListener("click", () => {
  topicFormPanel.classList.remove("hidden");
  document.querySelector("#topicName").focus();
});

cancelFormButton.addEventListener("click", () => {
  topicForm.reset();
  topicFormPanel.classList.add("hidden");
  updateParentOptions();
});

directionSelect.addEventListener("change", updateParentOptions);

topicForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(topicForm);
  const now = getToday();
  const topic = {
    id: `topic-${Date.now()}`,
    name: formData.get("name").trim(),
    direction: formData.get("direction"),
    parentId: formData.get("parentId"),
    description: formData.get("description").trim(),
    status: formData.get("status"),
    createdAt: now,
    updatedAt: now,
  };

  topics = [topic, ...topics];
  selectedTopicId = topic.id;
  saveItems(TOPIC_STORAGE_KEY, topics);
  topicForm.reset();
  topicFormPanel.classList.add("hidden");
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

  if (editingResourceId) {
    resources = resources.map((resource) => {
      if (resource.id !== editingResourceId) {
        return resource;
      }

      return {
        ...resource,
        title: formData.get("title").trim(),
        topicId: formData.get("topicId"),
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
      topicId: formData.get("topicId"),
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

planForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const formData = new FormData(planForm);
  const topicId = formData.get("topicId");
  const task = formData.get("task").trim();

  if (!topicId || !task) {
    return;
  }

  const resourceId = formData.get("resourceId") || null;
  const plan = {
    id: `plan-${Date.now()}`,
    date: getToday(),
    topicId,
    resourceId,
    task,
    isCompleted: false,
    createdAt: new Date().toISOString(),
  };

  plans = [plan, ...plans];
  saveItems(PLAN_STORAGE_KEY, plans);
  planForm.reset();
  planTopicSelect.value = topicId;
  updatePlanResourceOptions();
  render();
});

topicDetail.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-resource-topic]");
  const resourceButton = event.target.closest("[data-view-resource]");

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

function render() {
  updateParentOptions();
  updateResourceTopicOptions();
  updatePlanTopicOptions();
  updatePlanResourceOptions();
  renderTopicSummary();
  renderTopicList();
  renderTopicDetail();
  renderResourceSummary();
  renderResourceList();
  renderResourceDetail();
  renderPlanHeader();
  renderPlanList();
}

function renderTopicSummary() {
  const activeCount = topics.filter((topic) => topic.status === "学习中").length;
  topicSummary.textContent = `当前共有 ${topics.length} 个主题，其中 ${activeCount} 个正在学习。`;
}

function renderTopicList() {
  const groupedTopics = groupByDirection(topics);
  topicList.innerHTML = "";

  Object.entries(groupedTopics).forEach(([direction, directionTopics]) => {
    const group = document.createElement("section");
    group.className = "topic-group";

    const heading = document.createElement("h3");
    heading.textContent = direction;
    group.appendChild(heading);

    directionTopics.forEach((topic) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = topic.id === selectedTopicId ? "topic-card selected" : "topic-card";
      button.addEventListener("click", () => {
        selectedTopicId = topic.id;
        renderTopicList();
        renderTopicDetail();
      });

      const parent = topics.find((item) => item.id === topic.parentId);
      button.innerHTML = `
        <span class="topic-card-title">${escapeHtml(topic.name)}</span>
        <span class="topic-card-meta">${escapeHtml(parent ? parent.name : topic.direction)} · ${escapeHtml(topic.status)}</span>
        <span class="topic-card-description">${escapeHtml(topic.description || "暂时没有描述。")}</span>
      `;
      group.appendChild(button);
    });

    topicList.appendChild(group);
  });
}

function renderTopicDetail() {
  const topic = topics.find((item) => item.id === selectedTopicId);
  if (!topic) {
    topicDetail.innerHTML = "<h2>请选择一个主题</h2><p>点击左侧主题后，可以查看它的详情。</p>";
    return;
  }

  const parent = topics.find((item) => item.id === topic.parentId);
  const children = topics.filter((item) => item.parentId === topic.id);
  const relatedResources = resources.filter((resource) => resource.topicId === topic.id);
  const relatedTodayPlans = getTodayPlans().filter((plan) => plan.topicId === topic.id);
  const path = getTopicPath(topic);

  topicDetail.innerHTML = `
    <div class="panel-heading">
      <p class="eyebrow">${escapeHtml(path)}</p>
      <h2>${escapeHtml(topic.name)}</h2>
      <span class="status-pill">${escapeHtml(topic.status)}</span>
    </div>
    <div class="detail-section">
      <h3>描述</h3>
      <p>${escapeHtml(topic.description || "还没有描述，可以后续补充。")}</p>
    </div>
    <div class="detail-section">
      <h3>子主题</h3>
      ${children.length ? `<ul>${children.map((child) => `<li>${escapeHtml(child.name)} · ${escapeHtml(child.status)}</li>`).join("")}</ul>` : "<p>还没有子主题。</p>"}
    </div>
    <div class="detail-section">
      <div class="section-title-row">
        <h3>相关资料</h3>
        <button class="small-button" type="button" data-add-resource-topic="${escapeHtml(topic.id)}">新增该主题的资料</button>
      </div>
      ${renderRelatedResources(relatedResources)}
    </div>
    <div class="detail-grid compact-grid">
      <div>
        <h3>今日计划</h3>
        <p>${relatedTodayPlans.length ? `今天有 ${relatedTodayPlans.length} 个任务。` : "今天还没有这个主题的计划。"}</p>
      </div>
      <div>
        <h3>学习笔记</h3>
        <p>后续功能中添加。</p>
      </div>
      <div>
        <h3>学习进度</h3>
        <p>后续功能中添加。</p>
      </div>
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
              <small>${escapeHtml(resource.type)} · ${escapeHtml(resource.status)}</small>
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
    const topic = topics.find((item) => item.id === resource.topicId);
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
      <span class="topic-card-meta">${escapeHtml(topic ? getTopicPath(topic) : "未找到主题")} · ${escapeHtml(resource.type)} · ${escapeHtml(resource.status)}</span>
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

  const topic = topics.find((item) => item.id === resource.topicId);
  resourceDetail.innerHTML = `
    <div class="panel-heading">
      <p class="eyebrow">${escapeHtml(topic ? getTopicPath(topic) : "未找到主题")}</p>
      <h2>${escapeHtml(resource.title)}</h2>
      <span class="status-pill">${escapeHtml(resource.status)}</span>
    </div>
    <div class="detail-actions">
      <button class="secondary-button" type="button" data-edit-resource="${escapeHtml(resource.id)}">编辑资料</button>
      <button class="danger-button" type="button" data-delete-resource="${escapeHtml(resource.id)}">删除资料</button>
    </div>
    <div class="detail-section">
      <h3>所属学习主题</h3>
      <p>${escapeHtml(topic ? getTopicPath(topic) : "未找到主题")}</p>
    </div>
    <div class="detail-section">
      <h3>资料类型</h3>
      <p>${escapeHtml(resource.type)}</p>
    </div>
    <div class="detail-section">
      <h3>后续关联</h3>
      <p>相关计划、学习笔记和学习进度会在后续功能中添加。</p>
    </div>
  `;
}

function renderPlanHeader() {
  planDate.textContent = `今天是 ${getToday()}，只记录今天要完成的学习任务。`;
}

function renderPlanList() {
  const todayPlans = getTodayPlans();
  const completedCount = todayPlans.filter((plan) => plan.isCompleted).length;
  planSummary.textContent = `今天共有 ${todayPlans.length} 个任务，已完成 ${completedCount} 个。`;
  planList.innerHTML = "";

  if (!todayPlans.length) {
    planList.innerHTML = '<p class="empty-state">今天还没有学习计划，可以先添加一个小任务。</p>';
    return;
  }

  todayPlans.forEach((plan) => {
    const topic = topics.find((item) => item.id === plan.topicId);
    const resource = resources.find((item) => item.id === plan.resourceId);
    const article = document.createElement("article");
    article.className = plan.isCompleted ? "plan-card completed" : "plan-card";

    article.innerHTML = `
      <div class="plan-card-main">
        <span class="plan-check">${plan.isCompleted ? "✓" : "□"}</span>
        <div>
          <h3>${escapeHtml(plan.task)}</h3>
          <p>主题：${escapeHtml(topic ? getTopicPath(topic) : "未找到主题")}</p>
          <p>资料：${escapeHtml(getPlanResourceLabel(plan, resource))}</p>
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
    resourceTopicSelect.value = resource.topicId;
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
  plans = plans.map((plan) => (plan.id === planId ? { ...plan, isCompleted: !plan.isCompleted } : plan));
  saveItems(PLAN_STORAGE_KEY, plans);
  render();
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

function updateParentOptions() {
  const direction = directionSelect.value;
  const parentOptions = topics.filter((topic) => topic.direction === direction);
  parentSelect.innerHTML = '<option value="">无</option>';

  parentOptions.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = topic.name;
    parentSelect.appendChild(option);
  });
}

function updateResourceTopicOptions() {
  resourceTopicSelect.innerHTML = "";

  topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    resourceTopicSelect.appendChild(option);
  });
}

function updatePlanTopicOptions() {
  const currentValue = planTopicSelect.value;
  planTopicSelect.innerHTML = "";

  if (!topics.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "请先创建学习主题";
    planTopicSelect.appendChild(option);
    planTopicSelect.disabled = true;
    planResourceSelect.disabled = true;
    planTaskInput.disabled = true;
    return;
  }

  planTopicSelect.disabled = false;
  planTaskInput.disabled = false;

  topics.forEach((topic) => {
    const option = document.createElement("option");
    option.value = topic.id;
    option.textContent = getTopicPath(topic);
    planTopicSelect.appendChild(option);
  });

  if (topics.some((topic) => topic.id === currentValue)) {
    planTopicSelect.value = currentValue;
  }
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

  planResourceSelect.disabled = !topics.length;
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

function getToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTodayPlans() {
  const today = getToday();
  return plans.filter((plan) => plan.date === today);
}

function getPlanResourceLabel(plan, resource) {
  if (!plan.resourceId) {
    return "未关联资料";
  }

  return resource ? resource.title : "资料已删除";
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
