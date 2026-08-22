# AI-Learning-System V1.1 Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重做 V1 核心闭环的前提下，优先解决真实测试中的状态理解和主题排序问题，再补齐连续使用、数据安全和基础回看能力。

**Architecture:** 保持当前纯前端 HTML/CSS/JavaScript 与浏览器 `localStorage` 架构，不引入后端、账号或云同步。新增字段必须向后兼容现有五类本地数据；与排序、迁移、备份相关的纯数据逻辑放入独立模块并使用 Node.js 内置测试工具验证，页面交互仍由现有 `src/app.js` 组织。

**Tech Stack:** HTML5、CSS3、原生 JavaScript、浏览器 Local Storage、Node.js 内置 `node:test`。

**Spec:** 相邻测试仓库 `AI-Learning-System-Test` 中的 `AI-Review-V1.md`、`Day1.md`、`Day2.md`、`Day3.md`、`test-rule.md`，以及 `docs/superpowers/specs/2026-08-22-v1-1-requirements-design.md`。

## Global Constraints

- 保持现有纯前端结构，不增加框架、数据库、登录、云同步或 AI 功能。
- 现有五个 Local Storage key 必须继续可读：topics、resources、plans、notes、progress-records。
- 现有用户数据不得因字段升级、排序、导入或删除功能而静默丢失。
- 资料整体状态、今日任务状态、单次进度完成度保持三个不同概念。
- 完成任务不得自动把资料整体状态改为“已完成”。
- 所有删除、覆盖导入等破坏性操作必须先展示影响并由用户确认。
- 每个优先级完成后执行 Day1、Day2、Day3 场景回归，再更新项目文档并进行 Git 保存。
- Git 提交前检查提交范围和 `.gitignore`，不得提交 Token、API Key、`.env` 或私密配置。

**P0 阶段执行说明（2026-08-22）：** 用户明确将第一阶段限定为“状态语义区分”和“主题稳定排序”。因此 Task 1 本阶段只建立这两项功能实际需要的主题兼容、排序和今日资料任务摘要测试；`normalizePlans`、`normalizeResources`、`validateBackup` 随对应 P1/P2 任务实现，不提前接入本分支。

**P1 核心阶段执行说明（2026-08-22）：** 用户明确将本分支限定为按日期计划、今天/未来/历史回看、进度日期基础支持和计划与进度基础关联。因此本分支执行 Task 4 和下方收窄后的 Task 5；100% 进度后的显式计划完成选择、本地备份与安全恢复及全部 P2 功能均不在本分支实现。

---

## 文件结构规划

| 文件 | 责任 | 计划动作 |
| --- | --- | --- |
| `index.html` | 表单、状态文案、筛选和备份入口 | 按各任务增补控件与说明 |
| `src/app.js` | 页面事件、渲染、Local Storage 调用 | 接入新字段、视图和交互 |
| `src/styles.css` | 状态、排序、筛选和反馈样式 | 增加少量组件样式 |
| `src/data-model.js` | 兼容升级、排序、筛选、备份校验等纯函数 | 新建，避免继续把所有数据规则塞入 `app.js` |
| `tests/data-model.test.cjs` | 数据规则的自动化回归测试 | 新建 |
| `package.json` | 提供无第三方依赖的测试命令 | 新建，使用 `node --test` |
| `tests/manual-v1.1-regression.md` | Day1–Day3 和跨日场景手工验收 | 新建 |
| `README.md`、`docs/feature-list.md`、`docs/project-status.md` | 对外说明与版本状态 | 发布前更新 |

---

## P0：真实反馈优先

### Task 1：建立数据规则测试基线

**修改范围：** 建立不依赖第三方库的最小测试环境，将后续需要复用的纯数据规则放入 `src/data-model.js`。本任务不改变页面功能和现有数据。

**涉及已有模块：** 全局数据加载、主题、计划、进度、资料；仅建立它们共同使用的测试边界。

**开发风险：中。** 当前 `src/app.js` 约 49 KB 且直接依赖 DOM。一次性重构会增加回归风险，因此只抽取新规则，不搬迁现有渲染代码。

**Files:**
- Create: `package.json`
- Create: `src/data-model.js`
- Create: `tests/data-model.test.cjs`
- Modify: `index.html`，在 `src/app.js` 前加载 `src/data-model.js`

**Interfaces:**
- Produces: `window.LearningDataModel` 浏览器接口和 `module.exports` Node.js 测试接口。
- Produces: `normalizeTopics(topics)`、`normalizePlans(plans)`、`normalizeResources(resources)`、`validateBackup(payload)`。

- [ ] **Step 1: 创建失败测试，覆盖旧数据兼容**

```javascript
const test = require("node:test");
const assert = require("node:assert/strict");
const model = require("../src/data-model.js");

test("旧主题数据升级后保留原顺序并获得 sortOrder", () => {
  const topics = [{ id: "a", direction: "AI", parentId: "" }, { id: "b", direction: "AI", parentId: "" }];
  assert.deepEqual(model.normalizeTopics(topics).map((item) => item.sortOrder), [0, 1]);
});

test("旧计划数据升级后保留日期并补齐可选字段", () => {
  const plans = [{ id: "p1", date: "2026-08-13", isCompleted: false }];
  const [plan] = model.normalizePlans(plans);
  assert.equal(plan.date, "2026-08-13");
  assert.equal(plan.priority, "中");
  assert.equal(plan.estimatedMinutes, null);
});
```

- [ ] **Step 2: 运行测试并确认因接口不存在而失败**

Run: `npm test`

Expected: FAIL，提示 `normalizeTopics` 或模块尚未定义。

- [ ] **Step 3: 实现最小数据模块和双环境导出**

```javascript
(function attachLearningDataModel(globalScope) {
  const api = { normalizeTopics, normalizePlans, normalizeResources, validateBackup };
  globalScope.LearningDataModel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
```

- [ ] **Step 4: 运行测试并确认通过**

Run: `npm test`

Expected: PASS，旧数据字段保持不变，新字段获得安全默认值。

- [ ] **Step 5: 浏览器回归 V1 五个模块**

打开 `index.html`，确认主题、资料、计划、笔记和进度均能正常显示，控制台无错误。

- [ ] **Step 6: 提交本任务**

```powershell
git add package.json index.html src/data-model.js tests/data-model.test.cjs
git commit -m "test: add V1.1 data compatibility baseline"
```

### Task 2：明确资料、任务和进度的状态语义

**修改范围：** 调整界面名称和完成反馈；在资料详情增加“今日关联任务”摘要。资料状态本身不随一次任务完成而自动变化。

**涉及已有模块：** 学习资料、今日计划、学习进度、主题详情中的关联摘要。

**开发风险：低。** 主要是文案和渲染变化，不修改现有数据结构。风险点是把三个完成概念错误合并。

**Files:**
- Modify: `index.html`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/manual-v1.1-regression.md`

**Interfaces:**
- Consumes: 现有 `resource.status`、`plan.isCompleted`、`progress.completionPercent`。
- Produces: `getResourceTodayPlanSummary(resourceId)`，返回 `{ total: number, completed: number }`。

- [ ] **Step 1: 写入 Day1/Day2 失败验收场景**

```markdown
- 完成一项关联资料的今日任务后，任务卡显示“今日任务已完成”。
- 资料详情继续显示“资料整体状态：学习中”。
- 资料详情另行显示“今日关联任务：已完成 1/1”。
- 页面出现“今日任务已完成并保存”的即时反馈。
```

- [ ] **Step 2: 在浏览器复现旧行为**

Expected: 任务有勾选，但资料详情没有独立的今日任务完成摘要，用户仍需自行推断两个状态的区别。

- [ ] **Step 3: 修改界面文案与资料详情摘要**

```javascript
function getResourceTodayPlanSummary(resourceId) {
  const relatedPlans = getTodayPlans().filter((plan) => plan.resourceId === resourceId);
  return {
    total: relatedPlans.length,
    completed: relatedPlans.filter((plan) => plan.isCompleted).length,
  };
}
```

- [ ] **Step 4: 增加可访问的保存反馈区域**

在计划区域增加 `role="status"` 输出；完成或取消完成后写入明确反馈，但不弹出阻断式窗口。

- [ ] **Step 5: 执行 Day1 和 Day2 回归**

Expected: 用户无需查看资料状态即可确认任务完成，同时能理解资料仍处于长期“学习中”。

- [ ] **Step 6: 提交本任务**

```powershell
git add index.html src/app.js src/styles.css tests/manual-v1.1-regression.md
git commit -m "feat: clarify resource and daily task status"
```

### Task 3：支持主题稳定排序

**修改范围：** 为主题增加 `sortOrder`；同一学习方向和同一父主题范围内提供“上移/下移”；刷新后保持顺序。V1.1 不做拖拽。

**涉及已有模块：** 学习主题列表、父子主题、主题新增、Local Storage 数据加载。

**开发风险：中。** 涉及已有主题数据升级和父子层级。排序范围处理错误可能导致不同方向或不同父主题互相影响。

**Files:**
- Modify: `src/data-model.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/data-model.test.cjs`
- Create/Test: `tests/manual-v1.1-p1-regression.md`

**Interfaces:**
- Consumes: `normalizeTopics(topics)`。
- Produces: `getTopicSiblings(topics, topicId)`、`moveTopic(topics, topicId, delta)`。

- [ ] **Step 1: 写失败测试，限制排序作用域**

```javascript
test("上移主题只改变同方向同父级的顺序", () => {
  const topics = [
    { id: "a", direction: "AI", parentId: "", sortOrder: 0 },
    { id: "b", direction: "AI", parentId: "", sortOrder: 1 },
    { id: "c", direction: "IELTS", parentId: "", sortOrder: 0 },
  ];
  const result = model.moveTopic(topics, "b", -1);
  assert.deepEqual(result.filter((item) => item.direction === "AI").map((item) => item.id), ["b", "a"]);
  assert.equal(result.find((item) => item.id === "c").sortOrder, 0);
});
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test`

Expected: FAIL，提示 `moveTopic` 尚未定义。

- [ ] **Step 3: 实现稳定排序和边界规则**

第一项的“上移”和最后一项的“下移”按钮禁用；重新编号时仅修改同方向、同父主题的兄弟项。

- [ ] **Step 4: 在主题卡片接入排序按钮**

按钮必须包含主题名称的可访问说明，例如 `aria-label="上移 AI 基础"`，并阻止点击排序按钮时触发主题卡片选择事件。

- [ ] **Step 5: 运行自动测试和 Day3 回归**

Run: `npm test`

Expected: PASS；刷新页面后仍保持“AI 基础 → Prompt Engineering → AI 工作流 → AI 产品设计”。

- [ ] **Step 6: 提交本任务**

```powershell
git add src/data-model.js src/app.js src/styles.css tests/data-model.test.cjs tests/manual-v1.1-regression.md
git commit -m "feat: add persistent topic ordering"
```

---

## P1：连续使用与数据安全

### Task 4：升级为按日期的学习计划

**修改范围：** 计划表单允许选择日期，增加可选预计时长和高/中/低优先级；计划视图分为今天、未来、历史，过去未完成任务显示逾期。

**涉及已有模块：** 今日计划、主题与资料选择、主题详情的今日计划摘要、Local Storage 计划数据。

**开发风险：高。** 会改变计划创建、筛选和展示的主流程；必须兼容已有 `date` 字段，不能让旧计划消失。

**Files:**
- Modify: `index.html`
- Modify: `src/data-model.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Modify: `docs/project-status.md`
- Test: `tests/data-model.test.cjs`
- Create/Test: `tests/manual-v1.1-p1-regression.md`

**Interfaces:**
- Produces plan fields: `date: string`、`priority: "高" | "中" | "低"`、`estimatedMinutes: number | null`。
- Produces: `classifyPlanDate(plan, today)`，返回 `today | future | overdue | history`。

- [ ] **Step 1: 写日期分类和旧数据兼容失败测试**
- [ ] **Step 2: 运行 `npm test` 确认失败**
- [ ] **Step 3: 实现计划默认值和日期分类纯函数**
- [ ] **Step 4: 增加日期、预计时长、优先级表单字段**
- [ ] **Step 5: 实现今天、未来、历史三个视图及逾期标签**
- [ ] **Step 6: 回归主题、资料关联和完成/取消完成功能**
- [ ] **Step 7: 运行 `npm test` 并执行跨日手工场景**
- [ ] **Step 8: 提交 `feat: add dated plans and history views`**

**验收重点：** 今天计划默认仍选择当天；旧计划可见；未来计划不会混入今天；昨天未完成显示逾期；历史已完成任务可以回看。

### Task 5：支持进度补录与计划基础关联

**修改范围：** 进度日期由只读输出改为可选择日期；计划关联项只显示同一主题下、计划日期不晚于实际学习日期的计划，并按日期由近到远排列。本阶段保存进度不会自动或选择性修改计划完成状态，也不会修改资料整体状态。

**涉及已有模块：** 学习进度、今日计划、资料状态、主题/资料/计划关联选项。

**开发风险：中到高。** 主要风险是日期变化后错误隐藏已有计划关联，或在编辑旧记录时静默清除 `planId`。关联校验必须显式反馈，并保留编辑记录原有的缺失关联显示。

**Files:**
- Modify: `index.html`
- Modify: `src/data-model.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/data-model.test.cjs`
- Test: `tests/manual-v1.1-regression.md`

**Interfaces:**
- Produces: `getEligiblePlansForProgress(plans, topicId, progressDate)`。
- Rule: 只返回 `plan.topicId === topicId` 且 `plan.date <= progressDate` 的计划，并按计划日期从近到远稳定排序。

- [ ] **Step 1: 写进度日期和可关联计划范围失败测试**
- [ ] **Step 2: 运行 `npm test` 确认失败**
- [ ] **Step 3: 实现计划关联筛选和稳定排序纯函数**
- [ ] **Step 4: 将进度日期改为可编辑日期输入，并在编辑旧记录时保持原日期**
- [ ] **Step 5: 根据主题和实际学习日期更新计划关联项，并在提交时校验关联有效性**
- [ ] **Step 6: 编辑旧进度时保留原日期和仍有效的 `planId`，对已删除关联继续显示原有缺失提示**
- [ ] **Step 7: 验证保存 100% 进度也不会自动修改计划或资料状态**
- [ ] **Step 8: 完成 P1 页面回归记录并更新 `docs/project-status.md`**
- [ ] **Step 9: 提交 `feat: support progress backfill and plan association`**

### Task 6：增加本地备份导出与安全恢复

**修改范围：** 一次导出五类数据；导入时校验版本和字段，先展示数量摘要，再由用户确认覆盖。覆盖前自动下载当前数据快照。

**涉及已有模块：** 主题、资料、计划、笔记、进度、Local Storage。

**开发风险：高。** 导入覆盖属于破坏性操作；任何校验疏漏都可能损坏全部学习数据。

**Files:**
- Modify: `index.html`
- Modify: `src/data-model.js`
- Modify: `src/app.js`
- Modify: `src/styles.css`
- Test: `tests/data-model.test.cjs`
- Test: `tests/manual-v1.1-regression.md`

**Interfaces:**
- Backup shape:

```javascript
{
  schemaVersion: 1,
  exportedAt: "2026-08-22T00:00:00.000Z",
  data: { topics: [], resources: [], plans: [], notes: [], progressRecords: [] }
}
```

- Produces: `createBackup(data)`、`validateBackup(payload)`。

- [ ] **Step 1: 写合法备份、错误版本、缺少数组、无效 JSON 的失败测试**
- [ ] **Step 2: 运行 `npm test` 确认失败**
- [ ] **Step 3: 实现备份生成和严格校验**
- [ ] **Step 4: 增加导出按钮，文件名包含本地日期**
- [ ] **Step 5: 增加导入文件选择和数据数量预览**
- [ ] **Step 6: 覆盖前先导出当前快照，再执行一次明确确认**
- [ ] **Step 7: 用空数据、现有数据和损坏文件完成恢复测试**
- [ ] **Step 8: 提交 `feat: add validated local backup and restore`**

---

## P2：完善管理与回看

### Task 7：补充资料来源和学习位置

**修改范围：** 资料新增可选来源链接、来源名称、章节/页码或学习位置、备注；详情页安全展示链接。

**涉及已有模块：** 学习资料新增、编辑、详情、主题详情中的资料入口。

**开发风险：低到中。** 数据均为可选字段，兼容性风险低；需要防止不安全链接协议。

**Files:** `index.html`、`src/data-model.js`、`src/app.js`、`src/styles.css`、相关测试。

**Interfaces:** `sourceUrl: string`、`sourceName: string`、`location: string`、`note: string`；只允许空值、`http:` 和 `https:` 链接变为可点击链接。

- [ ] **Step 1: 写旧资料默认值和 URL 协议校验失败测试**
- [ ] **Step 2: 实现字段兼容和安全 URL 判断**
- [ ] **Step 3: 修改资料表单、编辑回填和详情展示**
- [ ] **Step 4: 验证 YouTube、PDF 页码、纸质资料三类场景**
- [ ] **Step 5: 提交 `feat: add resource source and learning position`**

### Task 8：增加归档与删除影响提示

**修改范围：** 主题支持编辑和归档；删除资料或计划前统计关联笔记、进度和计划数量；存在关联时优先推荐归档或取消。

**涉及已有模块：** 学习主题、学习资料、今日计划、学习笔记、学习进度及全部关联选择器。

**开发风险：高。** 关联数据较多，错误删除可能造成历史上下文永久丢失。V1.1 不实施自动迁移到其他主题或资料。

**Files:** `index.html`、`src/data-model.js`、`src/app.js`、`src/styles.css`、相关测试。

**Interfaces:** `archivedAt: string | null`；`getDeletionImpact(entityType, entityId, data)` 返回各关联类型数量。

- [ ] **Step 1: 写关联数量和归档过滤失败测试**
- [ ] **Step 2: 实现归档字段和删除影响统计**
- [ ] **Step 3: 默认列表隐藏已归档项并提供“查看归档”入口**
- [ ] **Step 4: 将简单确认框替换为带关联数量的影响说明**
- [ ] **Step 5: 验证归档不会删除历史笔记和进度**
- [ ] **Step 6: 提交 `feat: add archive and deletion impact safeguards`**

### Task 9：增加基础筛选与学习回看

**修改范围：** 在进度页提供主题、资料、计划和日期范围筛选；在计划页复用日期分类。本任务不做全局全文搜索、图表、周报或 AI 总结。

**涉及已有模块：** 学习进度、计划、主题、资料。

**开发风险：中。** 主要风险是筛选条件组合后错误隐藏记录，需要纯函数测试覆盖。

**Files:** `index.html`、`src/data-model.js`、`src/app.js`、`src/styles.css`、相关测试。

**Interfaces:** `filterProgressRecords(records, filters)`；空筛选返回全部记录，日期边界包含起止当天。

- [ ] **Step 1: 写单条件、组合条件和空条件失败测试**
- [ ] **Step 2: 实现纯筛选函数并通过测试**
- [ ] **Step 3: 增加筛选控件、清除筛选和结果数量**
- [ ] **Step 4: 验证已删除关联项仍可按日期回看**
- [ ] **Step 5: 提交 `feat: add basic learning record filters`**

---

## Task 10：版本回归、文档与发布准备

**修改范围：** 完整执行自动测试与手工测试；同步 README、功能清单和项目状态；只提交 V1.1 相关文件。

**涉及已有模块：** 全部五个核心模块、文档与 Git 保存流程。

**开发风险：中。** 最大风险是功能分批完成但文档、测试记录和实际页面不一致。

**Files:**
- Modify: `README.md`
- Modify: `docs/feature-list.md`
- Modify: `docs/project-status.md`
- Finalize: `tests/manual-v1.1-regression.md`

- [ ] **Step 1: 运行全部自动测试**

Run: `npm test`

Expected: 所有测试 PASS，无跳过项。

- [ ] **Step 2: 执行 Day1、Day2、Day3 原场景**

Expected: 原核心流程仍可用；状态困惑和主题排序问题不再复现。

- [ ] **Step 3: 执行跨日、补录、备份恢复和删除保护场景**

Expected: 旧数据可见；未来/历史计划分类正确；损坏备份不会覆盖数据；删除影响数量正确。

- [ ] **Step 4: 检查浏览器控制台和移动端布局**

Expected: 无 JavaScript 错误，窄屏下表单、排序按钮、筛选控件和状态提示可用。

- [ ] **Step 5: 更新版本文档**

README 不再显示“准备进入 V1 开发”；项目状态明确列出 V1.1 已完成范围、未完成范围和测试结果。

- [ ] **Step 6: 检查 Git 提交范围与敏感文件**

Run: `git status --short`

Run: `git diff --check`

Expected: 仅包含 V1.1 代码、测试和文档；没有 `.env`、Token、私密配置或无关文件。

- [ ] **Step 7: 提交发布准备**

```powershell
git add README.md docs/feature-list.md docs/project-status.md tests/manual-v1.1-regression.md
git commit -m "docs: complete V1.1 release review"
```

---

## 建议发布边界

- **V1.1 必须完成：** Task 1–6，即 P0 与 P1。
- **V1.1 可选完成：** Task 7–9；如果任一高风险任务影响测试稳定性，应独立延期到 V1.2。
- **明确延期：** 全局全文搜索、拖拽排序、云同步、复杂统计、周报月报、提醒、AI 总结与推荐。

## 总体风险判断

| 优先级 | 主要风险 | 综合风险 | 控制方式 |
| --- | --- | --- | --- |
| P0 | 旧主题排序迁移、状态概念被误合并 | 中 | 先建立兼容测试；排序仅限同方向同父级 |
| P1 | 跨日期逻辑、状态联动、备份覆盖全部数据 | 高 | 显式同步、严格校验、覆盖前快照、跨日回归 |
| P2 | 关联删除和筛选组合复杂度增加 | 中到高 | 归档优先、显示影响数量、纯函数组合测试 |
