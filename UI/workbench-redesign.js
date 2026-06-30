    const pageMeta = {
      projects: {
        section: "projects",
        title: "项目",
        subtitle: "管理本地开发项目并快速启动",
        crumb: ["项目", "项目列表"],
        placeholder: "搜索项目名称或路径",
        filters: ["全部标签", "全部状态"],
        root: "",
        actions: ["添加项目"],
        moduleTabs: [["projects", "项目列表"], ["project-skills", "项目 Skills"], ["project-log", "启动日志"]]
      },
      "project-skills": {
        section: "projects",
        title: "项目",
        subtitle: "AIRadar / 项目 Skills",
        crumb: ["项目", "项目 Skills"],
        placeholder: "搜索当前项目的 Skill",
        filters: ["全部 Skills", "已启用", "异常", "当前工具"],
        root: "按当前项目管理项目级 Skills 启用状态",
        actions: ["重新检查", "启用推荐工具"],
        moduleTabs: [["projects", "项目列表"], ["project-skills", "项目 Skills"], ["project-log", "启动日志"]]
      },
      "project-log": {
        section: "projects",
        title: "项目",
        subtitle: "AIRadar / 启动日志",
        crumb: ["项目", "启动日志"],
        placeholder: "搜索日志内容",
        filters: ["全部输出", "运行中", "本次会话"],
        root: "AIRadar · uvicorn · 当前进程内存日志",
        actions: ["停止全部", "重新启动"],
        moduleTabs: [["projects", "项目列表"], ["project-skills", "项目 Skills"], ["project-log", "启动日志"]]
      },
      skills: {
        section: "skills",
        title: "Skills",
        subtitle: "统一根目录 · 55 个 Skills",
        crumb: ["Skills", "本地 Skills"],
        placeholder: "搜索名称或描述",
        filters: ["编程开发", "全部状态", "全部项目"],
        root: "C:\\Users\\胡运宽\\.workbench\\skills",
        actions: ["同步", "导入"],
        moduleTabs: [["skills", "表格管理"], ["skills-cards", "卡片浏览"], ["skills-projects", "Skill 项目"], ["skills-market", "技能市场"], ["skills-updates", "更新"]]
      },
      "skills-cards": {
        section: "skills",
        title: "Skills",
        subtitle: "卡片浏览 · 标签和 Preset 筛选",
        crumb: ["Skills", "卡片浏览"],
        placeholder: "搜索卡片中的 Skill",
        filters: ["全部", "已启用", "已停用", "卡片视图"],
        root: "卡片适合浏览；表格适合管理和横向比较",
        actions: ["同步", "导入"],
        moduleTabs: [["skills", "表格管理"], ["skills-cards", "卡片浏览"], ["skills-projects", "Skill 项目"], ["skills-market", "技能市场"], ["skills-updates", "更新"]]
      },
      "skills-projects": {
        section: "skills",
        title: "Skills",
        subtitle: "frontend-design / Skill 项目",
        crumb: ["Skills", "Skill 项目"],
        placeholder: "搜索项目或工具",
        filters: ["全部项目", "已启用", "异常", "支持项目级"],
        root: "当前 Skill 对应全部项目；按项目管理该 Skill 的项目级工具启用状态",
        actions: ["重新检查", "启用推荐工具"],
        moduleTabs: [["skills", "表格管理"], ["skills-cards", "卡片浏览"], ["skills-projects", "Skill 项目"], ["skills-market", "技能市场"], ["skills-updates", "更新"]]
      },
      "skills-market": {
        section: "skills",
        title: "Skills",
        subtitle: "技能市场 · skills.sh",
        crumb: ["Skills", "技能市场"],
        placeholder: "搜索市场 Skill",
        filters: ["全部来源", "全部状态", "支持当前平台"],
        root: "市场数据只在当前应用进程内缓存",
        actions: ["刷新市场"],
        moduleTabs: [["skills", "表格管理"], ["skills-cards", "卡片浏览"], ["skills-projects", "Skill 项目"], ["skills-market", "技能市场"], ["skills-updates", "更新"]]
      },
      "skills-updates": {
        section: "skills",
        title: "Skills",
        subtitle: "来源更新 · 3 个可更新",
        crumb: ["Skills", "更新"],
        placeholder: "搜索可更新 Skill",
        filters: ["全部来源", "全部状态"],
        root: "更新前会备份统一根目录中的旧版本",
        actions: ["检查全部", "更新选中"],
        moduleTabs: [["skills", "表格管理"], ["skills-cards", "卡片浏览"], ["skills-projects", "Skill 项目"], ["skills-market", "技能市场"], ["skills-updates", "更新"]]
      },
      radar: {
        section: "radar",
        title: "资源 Radar",
        subtitle: "220 条本地记录",
        crumb: ["资源 Radar", "资源列表"],
        placeholder: "搜索名称、标签或备注",
        filters: ["全部分类", "全部领域", "全部来源", "更多筛选"],
        root: "",
        actions: ["同步 GitHub Stars", "添加条目"],
        moduleTabs: [["radar", "资源列表"], ["radar-cards", "卡片浏览"], ["radar-merge", "重复合并"]]
      },
      "radar-cards": {
        section: "radar",
        title: "资源 Radar",
        subtitle: "资源卡片浏览",
        crumb: ["资源 Radar", "卡片浏览"],
        placeholder: "搜索资源卡片",
        filters: ["全部分类", "GitHub Stars", "手动添加", "仅收藏"],
        root: "卡片用于阅读和收藏；合并与批量维护进入专用视图",
        actions: ["同步 GitHub Stars", "添加条目"],
        moduleTabs: [["radar", "资源列表"], ["radar-cards", "卡片浏览"], ["radar-merge", "重复合并"]]
      },
      "radar-merge": {
        section: "radar",
        title: "资源 Radar",
        subtitle: "重复资源合并",
        crumb: ["资源 Radar", "重复合并"],
        placeholder: "搜索候选资源",
        filters: ["待处理重复组", "GitHub Stars"],
        root: "合并只在用户确认后删除副资源记录",
        actions: ["跳过", "合并到主资源"],
        moduleTabs: [["radar", "资源列表"], ["radar-cards", "卡片浏览"], ["radar-merge", "重复合并"]]
      }
    };

    const switchButtons = [...document.querySelectorAll("[data-switch]")];
    const pages = [...document.querySelectorAll("[data-page]")];
    const title = document.querySelector("#page-title");
    const subtitle = document.querySelector("#page-subtitle");
    const breadcrumb = document.querySelector("#breadcrumb");
    const moduleTabs = document.querySelector("#module-tabs");
    const placeholder = document.querySelector("#search-placeholder");
    const filters = document.querySelector("#filters");
    const rootPath = document.querySelector("#root-path");
    const actions = document.querySelector("#actions");

    function setPage(name) {
      const meta = pageMeta[name];
      switchButtons.forEach((button) => {
        const target = pageMeta[button.dataset.switch];
        button.classList.toggle("is-active", button.dataset.switch === name || target?.section === meta.section);
      });
      pages.forEach((page) => page.classList.toggle("is-active", page.dataset.page === name));
      title.textContent = meta.title;
      subtitle.textContent = meta.subtitle;
      breadcrumb.innerHTML = `<b>${meta.crumb[0]}</b><span>/</span><span>${meta.crumb[1]}</span>`;
      moduleTabs.innerHTML = meta.moduleTabs.map(([target, label]) => `<button class="${target === name ? "is-active" : ""}" data-switch="${target}">${label}</button>`).join("");
      placeholder.placeholder = meta.placeholder;
      filters.innerHTML = meta.filters.map((label) => `<button class="button">${label}</button>`).join("");
      rootPath.textContent = meta.root;
      actions.innerHTML = meta.actions.map((label, index) => `<button class="button ${index === meta.actions.length - 1 ? "primary" : ""}">${label}</button>`).join("");
    }

    document.addEventListener("click", (event) => {
      const button = event.target.closest("[data-switch]");
      if (!button) return;
      const target = button.dataset.switch;
      if (!pageMeta[target]) return;
      setPage(target);
    });
    setPage("skills");
