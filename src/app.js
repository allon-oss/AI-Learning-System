const STORAGE_KEY = "personal-learning-system-topics";

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
];

let topics = loadTopics();
let selectedTopicId = topics[0]?.id || "";

const topicList = document.querySelector("#topicList");
const topicDetail = document.querySelector("#topicDetail");
const topicSummary = document.querySelector("#topicSummary");
const topicFormPanel = document.querySelector("#topicFormPanel");
const topicForm = document.querySelector("#topicForm");
const showFormButton = document.querySelector("#showFormButton");
const cancelFormButton = document.querySelector("#cancelFormButton");
const parentSelect = document.querySelector("#topicParent");
const directionSelect = document.querySelector("#topicDirection");

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
  const now = new Date().toISOString().slice(0, 10);
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
  saveTopics();
  topicForm.reset();
  topicFormPanel.classList.add("hidden");
  render();
});

function loadTopics() {
  const storedTopics = localStorage.getItem(STORAGE_KEY);
  if (!storedTopics) {
    return defaultTopics;
  }

  try {
    return JSON.parse(storedTopics);
  } catch {
    return defaultTopics;
  }
}

function saveTopics() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(topics));
}

function render() {
  updateParentOptions();
  renderSummary();
  renderTopicList();
  renderTopicDetail();
}

function renderSummary() {
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
        render();
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
  const path = parent ? `${topic.direction} > ${parent.name} > ${topic.name}` : `${topic.direction} > ${topic.name}`;

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
    <div class="detail-grid">
      <div>
        <h3>相关资料</h3>
        <p>后续功能中添加。</p>
      </div>
      <div>
        <h3>今日计划</h3>
        <p>后续功能中添加。</p>
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

function groupByDirection(items) {
  return items.reduce((groups, topic) => {
    if (!groups[topic.direction]) {
      groups[topic.direction] = [];
    }
    groups[topic.direction].push(topic);
    return groups;
  }, {});
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
