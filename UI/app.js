const navItems = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const themeToggles = document.querySelectorAll(".theme-toggle");
const themeLabels = document.querySelectorAll(".theme-label, .theme-current");

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  const label = theme === "dark" ? "深色主题" : "浅色主题";
  themeLabels.forEach((item) => {
    item.textContent = label;
  });
  localStorage.setItem("workbench-ui-theme", theme);
}

applyTheme(localStorage.getItem("workbench-ui-theme") || "light");

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    navItems.forEach((nav) => nav.classList.remove("active"));
    views.forEach((view) => view.classList.remove("active"));
    item.classList.add("active");
    document.getElementById(item.dataset.view).classList.add("active");
  });
});

document.querySelectorAll("[data-dialog]").forEach((button) => {
  button.addEventListener("click", () => {
    document.getElementById(button.dataset.dialog).showModal();
  });
});

themeToggles.forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(document.body.dataset.theme === "dark" ? "light" : "dark");
  });
});

document.querySelectorAll(".table-row").forEach((row) => {
  row.addEventListener("click", () => {
    const panel = row.closest(".list-panel");
    panel.querySelectorAll(".table-row").forEach((item) => item.classList.remove("selected"));
    row.classList.add("selected");
  });
});

document.querySelectorAll(".row-card").forEach((row) => {
  row.addEventListener("click", () => {
    const panel = row.closest(".list-panel");
    panel.querySelectorAll(".row-card").forEach((item) => item.classList.remove("selected"));
    row.classList.add("selected");
  });
});

document.querySelectorAll(".launch-demo").forEach((button) => {
  button.addEventListener("click", () => {
    const toast = document.querySelector(".toast");
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2200);
  });
});
