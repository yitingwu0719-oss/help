// translate.js
let isEnglish = false; // 預設中文

function bindToggleLang() {
  const toggleBtn = document.getElementById("toggle-lang");
  if (!toggleBtn) return;

  // 避免重複綁定事件
  toggleBtn.replaceWith(toggleBtn.cloneNode(true));
  const newToggleBtn = document.getElementById("toggle-lang");

  newToggleBtn.addEventListener("click", function (e) {
    e.preventDefault();
    isEnglish = !isEnglish;

    // 更新導覽列按鈕文字
    newToggleBtn.textContent = isEnglish ? "繁體中文" : "English";

    // 切換所有有 data-zh & data-en 的元素
document.querySelectorAll("[data-zh][data-en]").forEach(el => {
  let text = isEnglish ? el.getAttribute("data-en") : el.getAttribute("data-zh");
  el.innerHTML = text.replace(/\|/g, "<br>");
});
  });
}

// 等待 menu 載入完成後綁定
document.addEventListener("menuLoaded", () => {
  bindToggleLang();
});

// 如果 menu 是同步載入，保險起見也監聽 DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
  bindToggleLang();
});
