const tabs = Array.from(document.querySelectorAll("[data-settings-tab]"));
const pages = new Map(
  Array.from(document.querySelectorAll(".settings-page")).map((page) => [
    page.id.replace("settings-", ""),
    page
  ])
);

function activateSettingsPage(key) {
  for (const tab of tabs) {
    tab.classList.toggle("active", tab.dataset.settingsTab === key);
  }
  for (const [pageKey, page] of pages) {
    page.classList.toggle("active", pageKey === key);
  }
}

for (const tab of tabs) {
  tab.addEventListener("click", () => activateSettingsPage(tab.dataset.settingsTab));
}
