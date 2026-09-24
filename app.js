// お買い物リスト
// データはブラウザの localStorage に保存します（サーバーは使いません）

const STORAGE_KEY = "okaimono-list-v1";

const DEFAULT_STORES = [
  { id: "store-1", name: "スーパー", color: "mint" },
  { id: "store-2", name: "ドラッグストア", color: "pink" },
  { id: "store-3", name: "100均", color: "sky" },
  { id: "store-4", name: "その他", color: "lavender" }
];

const STORE_COLORS = [
  { id: "pink", label: "ピンク" },
  { id: "rose", label: "ローズ" },
  { id: "peach", label: "ピーチ" },
  { id: "lemon", label: "レモン" },
  { id: "mint", label: "ミント" },
  { id: "sage", label: "セージ" },
  { id: "aqua", label: "アクア" },
  { id: "sky", label: "スカイ" },
  { id: "ice", label: "アイス" },
  { id: "lavender", label: "ラベンダー" },
  { id: "lilac", label: "ライラック" },
  { id: "beige", label: "ベージュ" }
];

function createId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function defaultState() {
  return {
    stores: DEFAULT_STORES.map((store) => ({ ...store })),
    currentStoreId: "store-1",
    items: [],
    favorites: [],
    history: [],
    historyFromDelete: true
  };
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return defaultState();
  try {
    const data = JSON.parse(raw);
    if (!data.stores || data.stores.length === 0) {
      data.stores = DEFAULT_STORES;
    }
    if (
      data.currentStoreId !== "all" &&
      (!data.currentStoreId || !data.stores.some((store) => store.id === data.currentStoreId))
    ) {
      data.currentStoreId = data.stores[0].id;
    }
    data.stores.forEach((store) => {
      if (!store.color) store.color = colorFromLegacyName(store.name);
    });
    data.items = data.items || [];
    data.favorites = data.favorites || [];
    if (data.historyFromDelete !== true) {
      data.history = [];
      data.historyFromDelete = true;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } else {
      data.history = data.history || [];
    }
    return data;
  } catch (error) {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let state = loadState();
let currentScreen = "list";
let toastTimer = null;
let modalCallback = null;
const boughtOpenByStore = Object.create(null);
const selectedFavoriteIds = new Set();
const selectedHistoryIds = new Set();

function isBoughtOpen(storeId) {
  return boughtOpenByStore[storeId] !== false;
}

const PAGE_TITLES = {
  list: "お買い物リスト",
  favorites: "よく買うもの",
  history: "ゴミ箱",
  settings: "設定"
};

const PAGE_BACKGROUNDS = {
  list: "#FFF7F9",
  favorites: "#FFFCF2",
  history: "#F2F8FD",
  settings: "#F1FAF5"
};

function applyPageTheme() {
  document.documentElement.dataset.page = currentScreen;
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.setAttribute("content", PAGE_BACKGROUNDS[currentScreen] || PAGE_BACKGROUNDS.list);
}

function renderPageTitle() {
  const text = PAGE_TITLES[currentScreen] || PAGE_TITLES.list;
  document.getElementById("page-title").textContent = text;
  document.title = text;
}

let ignoreClickUntil = 0;

function isAllStoresView() {
  return state.currentStoreId === "all";
}

function currentStore() {
  if (isAllStoresView()) return { id: "all", name: "すべて" };
  return state.stores.find((store) => store.id === state.currentStoreId) || state.stores[0];
}

let selectedAddColor = "mint";
let selectedModalColor = "mint";

function colorFromLegacyName(name) {
  const value = name || "";
  if (value.includes("ドラッグ")) return "pink";
  if (value.includes("スーパー")) return "mint";
  if (value.includes("100")) return "sky";
  if (value.includes("その他")) return "lavender";
  return "beige";
}

function storeColor(store) {
  if (store && STORE_COLORS.some((color) => color.id === store.color)) return store.color;
  return colorFromLegacyName(store && store.name);
}

function fillColorPicker(container, selected) {
  if (!container) return;
  container.innerHTML = STORE_COLORS.map(
    (color) => `
      <button type="button" class="color-dot ${color.id === selected ? "selected" : ""}" data-pick-color="${color.id}" aria-label="${color.label}"></button>
    `
  ).join("");
}

function itemsInStore(storeId) {
  return state.items.filter((item) => item.storeId === storeId);
}

function uncheckedCount(storeId) {
  return state.items.filter((item) => item.storeId === storeId && !item.checked).length;
}

function totalUncheckedCount() {
  return state.items.filter((item) => !item.checked).length;
}

function currentItems() {
  if (isAllStoresView()) return state.items;
  return itemsInStore(state.currentStoreId);
}

function reindexStore(storeId) {
  state.items
    .filter((item) => item.storeId === storeId && !item.checked)
    .sort((a, b) => a.order - b.order)
    .forEach((item, index) => {
      item.order = index;
    });
}

function reindexUnchecked() {
  reindexStore(state.currentStoreId);
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 1600);
}

function openModal({ text, value, okLabel, onOk, color, maxLength }) {
  const modal = document.getElementById("modal");
  const input = document.getElementById("modal-input");
  const colors = document.getElementById("modal-colors");
  document.getElementById("modal-text").textContent = text;
  document.getElementById("modal-ok").textContent = okLabel || "OK";
  modalCallback = onOk;
  input.maxLength = maxLength || 20;
  if (value === undefined) {
    input.classList.add("hidden");
    input.value = "";
  } else {
    input.classList.remove("hidden");
    input.value = value;
  }
  if (color) {
    selectedModalColor = color;
    colors.classList.remove("hidden");
    fillColorPicker(colors, selectedModalColor);
  } else {
    colors.classList.add("hidden");
  }
  modal.classList.remove("hidden");
  if (value !== undefined) {
    setTimeout(() => input.focus(), 50);
  }
}

function closeModal() {
  document.getElementById("modal").classList.add("hidden");
  document.getElementById("modal-colors").classList.add("hidden");
  document.getElementById("modal-input").maxLength = 20;
  modalCallback = null;
}

function openNameEditor(source, id) {
  const record =
    source === "item"
      ? state.items.find((entry) => entry.id === id)
      : source === "favorite"
        ? state.favorites.find((entry) => entry.id === id)
        : state.history.find((entry) => entry.id === id);
  if (!record) return;
  openModal({
    text: "商品名を編集",
    value: record.name,
    okLabel: "保存",
    maxLength: 40,
    onOk: (value) => {
      const name = (value || "").trim();
      if (!name || name === record.name) return;
      record.name = name;
      saveState();
      render();
    }
  });
}

function itemNameHtml(item, source) {
  return `<button type="button" class="item-name" data-action="edit-name" data-source="${source}" data-id="${item.id}">${escapeHtml(item.name)}</button>`;
}

function rememberHistory(name) {
  state.history = state.history.filter((item) => item.name !== name);
  state.history.unshift({ id: createId(), name, addedAt: Date.now() });
  state.history = state.history.slice(0, 40);
}

function addItemToStore(storeId, name) {
  const storeItems = itemsInStore(storeId);
  const existing = storeItems.find((item) => item.name === name);
  if (existing) {
    if (existing.checked) {
      existing.checked = false;
      reindexStore(storeId);
      return "restored";
    }
    return "exists";
  }

  const unchecked = storeItems.filter((item) => !item.checked);
  const nextOrder = unchecked.reduce((max, item) => Math.max(max, item.order), -1) + 1;
  state.items.push({
    id: createId(),
    storeId,
    name,
    checked: false,
    order: nextOrder
  });
  reindexStore(storeId);
  return "added";
}

function currentStoreIds() {
  return isAllStoresView() ? state.stores.map((store) => store.id) : [state.currentStoreId];
}

function toastAddResults(results, source) {
  if (results.every((result) => result === "exists")) {
    showToast("すでにリストにあります");
    return;
  }
  if (isAllStoresView()) {
    showToast("すべてのお店に追加しました");
    return;
  }
  if (results.includes("restored")) {
    showToast("リストに戻しました");
    return;
  }
  if (source) {
    showToast("リストに追加しました");
  }
}

function addItemToCurrentStore(name, source) {
  const trimmed = name.trim();
  if (!trimmed) return;
  const results = currentStoreIds().map((storeId) => addItemToStore(storeId, trimmed));
  saveState();
  render();
  toastAddResults(results, source);
}

function addNamesToCurrentStore(names, source) {
  const storeIds = currentStoreIds();
  const results = [];
  names.forEach((name) => {
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    storeIds.forEach((storeId) => results.push(addItemToStore(storeId, trimmed)));
  });
  if (results.length === 0) return;
  saveState();
  render();
  toastAddResults(results, source);
}

function reorderFavorites(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const moved = state.favorites.splice(fromIndex, 1)[0];
  state.favorites.splice(toIndex, 0, moved);
  saveState();
  render();
}

function reorderStores(fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const moved = state.stores.splice(fromIndex, 1)[0];
  state.stores.splice(toIndex, 0, moved);
  saveState();
  render();
}

function reorderItems(storeId, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  const items = itemsInStore(storeId)
    .filter((item) => !item.checked)
    .sort((a, b) => a.order - b.order);
  const moved = items.splice(fromIndex, 1)[0];
  items.splice(toIndex, 0, moved);
  items.forEach((item, index) => {
    item.order = index;
  });
  saveState();
  render();
}

function renderTabs() {
  const tabs = document.getElementById("store-tabs");
  document.getElementById("app").dataset.storeColor = isAllStoresView()
    ? "all"
    : storeColor(currentStore());
  if (currentScreen === "settings") {
    tabs.classList.add("hidden");
    return;
  }
  tabs.classList.remove("hidden");
  const allTab = `
    <button type="button" class="store-tab ${isAllStoresView() ? "active" : ""}" data-action="select-store" data-id="all" data-color="all">
      <span class="tab-name">すべて</span>
      <span class="tab-count">${totalUncheckedCount()}</span>
    </button>
  `;
  const storeTabs = state.stores
    .map(
      (store) => `
        <button type="button" class="store-tab ${store.id === state.currentStoreId ? "active" : ""}" data-action="select-store" data-id="${store.id}" data-color="${storeColor(store)}">
          <span class="tab-name">${escapeHtml(store.name)}</span>
          <span class="tab-count">${uncheckedCount(store.id)}</span>
        </button>
      `
    )
    .join("");
  tabs.innerHTML = allTab + storeTabs;
}

function isFavoriteName(name) {
  return state.favorites.some((item) => item.name === name);
}

function addFavoriteName(name) {
  if (!name || isFavoriteName(name)) return;
  state.favorites.unshift({ id: createId(), name });
}

function removeFavoriteName(name) {
  state.favorites = state.favorites.filter((item) => item.name !== name);
}

function dragHandleHtml() {
  return `
    <button type="button" class="drag-handle" data-drag-handle aria-label="長押しして並び替え">
      <span></span><span></span><span></span>
    </button>
  `;
}

function deleteButtonHtml(action, id) {
  return `
    <button type="button" class="icon-btn delete" data-action="${action}" data-id="${id}" aria-label="削除">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.2 3.2 20.8 20.8M20.8 3.2 3.2 20.8"/>
      </svg>
    </button>
  `;
}

function starButtonHtml(item) {
  const on = isFavoriteName(item.name);
  return `
    <button type="button" class="star-btn ${on ? "on" : ""}" data-action="toggle-star" data-id="${item.id}" aria-label="${on ? "よく買うから外す" : "よく買うに追加"}">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 17.3 6.8 20l1-5.7L3.5 10.3l5.8-.8L12 4.5l2.7 5 5.8.8-4.3 3.9 1 5.7z"/>
      </svg>
    </button>
  `;
}

function itemCardHtml(item, draggable) {
  return `
    <article class="item-card ${item.checked ? "checked" : ""}" ${draggable ? `data-sort-item data-id="${item.id}"` : ""}>
      <button type="button" class="check-btn" data-action="toggle-item" data-id="${item.id}" aria-label="購入チェック">
        ${item.checked ? "✓" : ""}
      </button>
      <div class="item-main">
        ${itemNameHtml(item, "item")}
      </div>
      <div class="side-actions">
        ${starButtonHtml(item)}
        ${deleteButtonHtml("delete-item", item.id)}
        ${draggable ? dragHandleHtml() : ""}
      </div>
    </article>
  `;
}

function renderStoreItemLists(storeId) {
  const items = itemsInStore(storeId);
  const unchecked = items.filter((item) => !item.checked).sort((a, b) => a.order - b.order);
  const checked = items.filter((item) => item.checked);
  return `
    ${
      unchecked.length
        ? `<div class="item-list" data-sort-list="item" data-store-id="${storeId}">
             ${unchecked.map((item) => itemCardHtml(item, true)).join("")}
           </div>`
        : ""
    }
    ${
      checked.length
        ? `<section class="bought-block ${isBoughtOpen(storeId) ? "is-open" : ""}">
             <button type="button" class="bought-toggle" data-action="toggle-bought" data-store-id="${storeId}" aria-expanded="${isBoughtOpen(storeId) ? "true" : "false"}">
               <span class="bought-toggle-inner">
                 <span class="bought-toggle-text">購入済み  ${checked.length}件</span>
                 <span class="bought-chevron" aria-hidden="true">▼</span>
               </span>
             </button>
             <div class="bought-panel">
               <div class="bought-panel-inner">
                 <div class="item-list">
                   ${checked.map((item) => itemCardHtml(item, false)).join("")}
                 </div>
               </div>
             </div>
           </section>`
        : ""
    }
  `;
}

function listStatusHtml(remainCount) {
  return `
    <div class="list-status">
      <p class="remain">残り ${remainCount} 件</p>
      <p class="current-store-name">${escapeHtml(currentStore().name)}</p>
    </div>
  `;
}

function progressHtml(items) {
  const total = items.length;
  const bought = items.filter((item) => item.checked).length;
  const percent = total === 0 ? 0 : Math.round((bought / total) * 100);
  return `
    <div class="list-progress">
      <p class="list-progress-label">購入済み ${bought} / ${total}</p>
      <div class="list-progress-row">
        <div class="list-progress-track" role="progressbar" aria-label="購入の進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}">
          <div class="list-progress-fill" style="width: ${percent}%"></div>
        </div>
        <span class="list-progress-percent">${percent}%</span>
      </div>
    </div>
  `;
}

function renderList() {
  const root = document.getElementById("list-content");

  if (isAllStoresView()) {
    const hasItems = state.items.length > 0;
    if (!hasItems) {
      root.innerHTML = `
        <div class="empty">
          <span class="emoji">🛒</span>
          まだ商品がありません<br>お店を選ぶか、下の欄から追加してみましょう
        </div>
      `;
      return;
    }
    root.innerHTML = `
      ${listStatusHtml(totalUncheckedCount())}
      ${state.stores
        .map((store) => {
          const items = itemsInStore(store.id);
          if (items.length === 0) return "";
          const color = storeColor(store);
          return `
            <section class="store-group" data-color="${color}">
              <h2 class="store-heading" data-color="${color}">${escapeHtml(store.name)}（${uncheckedCount(store.id)}）</h2>
              ${progressHtml(items)}
              ${renderStoreItemLists(store.id)}
            </section>
          `;
        })
        .join("")}
    `;
    return;
  }

  const items = currentItems();
  const unchecked = items.filter((item) => !item.checked);
  if (items.length === 0) {
    root.innerHTML = `
      ${listStatusHtml(0)}
      ${progressHtml(items)}
      <div class="empty">
        <span class="emoji">🛒</span>
        まだ商品がありません<br>下の欄から追加してみましょう
      </div>
    `;
    return;
  }

  root.innerHTML = `
    ${listStatusHtml(unchecked.length)}
    ${progressHtml(items)}
    ${renderStoreItemLists(state.currentStoreId)}
  `;
}

function updateSelectBar(barId, selectedIds, items, screen, bodyClass) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const ids = new Set(items.map((item) => item.id));
  [...selectedIds].forEach((id) => {
    if (!ids.has(id)) selectedIds.delete(id);
  });
  const count = selectedIds.size;
  const show = currentScreen === screen && count > 0;
  bar.textContent = `選択した${count}件を追加`;
  bar.classList.toggle("hidden", !show);
  document.body.classList.toggle(bodyClass, show);
}

function updateFavoriteSelectBar() {
  updateSelectBar("favorite-add-selected", selectedFavoriteIds, state.favorites, "favorites", "has-favorite-selection");
}

function updateHistorySelectBar() {
  updateSelectBar("history-add-selected", selectedHistoryIds, state.history, "history", "has-history-selection");
}

function toggleSelectButton(selectedIds, id, target, updateBar) {
  if (selectedIds.has(id)) selectedIds.delete(id);
  else selectedIds.add(id);
  const on = selectedIds.has(id);
  const button = target.closest(".check-btn");
  if (button) {
    button.classList.toggle("is-on", on);
    button.textContent = on ? "✓" : "";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.classList.add("is-pop");
    button.addEventListener("animationend", () => button.classList.remove("is-pop"), { once: true });
  }
  updateBar();
}

function renderFavorites() {
  const root = document.getElementById("favorites-content");
  if (state.favorites.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <span class="emoji">⭐</span>
        よく買うものを登録すると<br>次からすぐ追加できます
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="favorite-list" data-sort-list="favorite">
      ${state.favorites
        .map((item) => {
          const selected = selectedFavoriteIds.has(item.id);
          return `
            <div class="favorite-row" data-sort-item data-id="${item.id}">
              <button type="button" class="check-btn fav-select-btn ${selected ? "is-on" : ""}" data-action="toggle-favorite-select" data-id="${item.id}" aria-pressed="${selected ? "true" : "false"}" aria-label="追加する商品を選択">
                ${selected ? "✓" : ""}
              </button>
              <article class="simple-card">
                <div class="item-main">
                  ${itemNameHtml(item, "favorite")}
                </div>
                <div class="side-actions">
                  ${starButtonHtml(item)}
                  ${dragHandleHtml()}
                </div>
              </article>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderHistory() {
  const root = document.getElementById("history-content");
  if (state.history.length === 0) {
    root.innerHTML = `
      <div class="empty">
        <span class="emoji">📝</span>
        まだ削除した商品はありません
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="history-list">
      ${state.history
        .map((item) => {
          const selected = selectedHistoryIds.has(item.id);
          return `
            <div class="history-row">
              <button type="button" class="check-btn fav-select-btn ${selected ? "is-on" : ""}" data-action="toggle-history-select" data-id="${item.id}" aria-pressed="${selected ? "true" : "false"}" aria-label="追加する商品を選択">
                ${selected ? "✓" : ""}
              </button>
              <article class="simple-card">
                <div class="item-main">
                  ${itemNameHtml(item, "history")}
                </div>
                ${deleteButtonHtml("delete-history", item.id)}
              </article>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderStores() {
  const root = document.getElementById("stores-content");
  root.innerHTML = `
    <div class="simple-list" data-sort-list="store">
      ${state.stores
        .map(
          (store) => `
            <article class="simple-card" data-color="${storeColor(store)}" data-sort-item data-id="${store.id}">
              <span class="item-name">${escapeHtml(store.name)}</span>
              <div class="store-actions">
                <button type="button" class="icon-btn edit" data-action="edit-store" data-id="${store.id}" aria-label="編集"><span>✎</span></button>
                ${deleteButtonHtml("delete-store", store.id)}
                ${dragHandleHtml()}
              </div>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function render() {
  applyPageTheme();
  const currentScreenId = `screen-${currentScreen}`;
  if (!keepItemInputFocused) {
    document.querySelectorAll(".screen").forEach((screen) => {
      screen.classList.toggle("hidden", screen.id !== currentScreenId);
    });
  }
  document.querySelectorAll(".nav-btn").forEach((button) => {
    button.classList.toggle("active", button.dataset.screen === currentScreen);
  });
  renderPageTitle();
  renderTabs();
  if (currentScreen === "list") renderList();
  if (currentScreen === "favorites") renderFavorites();
  if (currentScreen === "history") renderHistory();
  if (currentScreen === "settings") {
    renderStores();
    fillColorPicker(document.getElementById("add-color-picker"), selectedAddColor);
  }
  updateFavoriteSelectBar();
  updateHistorySelectBar();
}

const itemInput = document.getElementById("item-input");
let keepItemInputFocused = false;
let itemInputIsComposing = false;
let clearingItemInput = false;
let ignoreEnterSubmitUntil = 0;
let lockedKeyboardH = null;
let actionLockUntil = 0;

function isPhoneComposer() {
  return window.matchMedia("(pointer: coarse)").matches || /iPhone|iPod/i.test(navigator.userAgent);
}

function applyComposerMetrics() {
  const root = document.documentElement;
  if (!document.body.classList.contains("is-composing")) {
    lockedKeyboardH = null;
    root.style.removeProperty("--keyboard-h");
    root.style.removeProperty("--list-max-h");
    return;
  }
  const viewport = window.visualViewport;
  const vvHeight = viewport ? viewport.height : window.innerHeight;
  const vvOffset = viewport ? viewport.offsetTop : 0;
  const keyboardH = Math.max(0, Math.round(window.innerHeight - vvOffset - vvHeight));
  const keyboardChanged = lockedKeyboardH == null || Math.abs(keyboardH - lockedKeyboardH) >= 80;
  if (!keyboardChanged) return;
  lockedKeyboardH = keyboardH;
  root.style.setProperty("--keyboard-h", `${lockedKeyboardH}px`);
  const topBar = document.querySelector(".top-bar");
  const addBar = document.querySelector("#screen-list .add-bar");
  const nav = document.querySelector(".bottom-nav");
  const topH = topBar ? topBar.getBoundingClientRect().height : 0;
  const addH = addBar ? addBar.getBoundingClientRect().height : 76;
  const navH = nav ? nav.getBoundingClientRect().height : 64;
  const listMax = Math.max(72, Math.round(vvHeight - topH - addH - navH));
  root.style.setProperty("--list-max-h", `${listMax}px`);
}

function revealLatestItemsWhileComposing() {
  if (!document.body.classList.contains("is-composing")) return;
  const scroller = document.getElementById("list-content");
  if (!scroller) return;
  const last = [...scroller.querySelectorAll(".item-card:not(.checked)")].at(-1);
  if (!last) return;
  const delta = last.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom + 8;
  scroller.scrollTop = Math.max(0, scroller.scrollTop + delta);
}

function scheduleRevealLatestItems() {
  requestAnimationFrame(() => revealLatestItemsWhileComposing());
}

function startComposing() {
  if (!isPhoneComposer() || currentScreen !== "list") return;
  if (document.body.classList.contains("is-composing")) return;
  document.documentElement.classList.add("is-composing");
  document.body.classList.add("is-composing");
  applyComposerMetrics();
  scheduleRevealLatestItems();
}

function stopComposing(force) {
  if (!force && keepItemInputFocused) return;
  if (!document.body.classList.contains("is-composing") && !force) return;
  keepItemInputFocused = false;
  itemInputIsComposing = false;
  document.documentElement.classList.remove("is-composing");
  document.body.classList.remove("is-composing");
  applyComposerMetrics();
}

function beginActionLock() {
  const now = Date.now();
  if (now < actionLockUntil) return false;
  actionLockUntil = now + 400;
  return true;
}

function submitCurrentItem() {
  if (!beginActionLock()) return;
  if (!itemInput) return;
  keepItemInputFocused = true;
  addItemToCurrentStore(itemInput.value);
  clearingItemInput = true;
  itemInput.value = "";
  clearingItemInput = false;
  revealLatestItemsWhileComposing();
  if (document.activeElement === itemInput) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!keepItemInputFocused || itemInputIsComposing) return;
      if (document.activeElement === itemInput) return;
      itemInput.focus({ preventScroll: true });
    });
  });
}

function bindActionPress(button) {
  if (!button) return;
  const press = (event) => {
    if (event.button) return;
    button.classList.add("is-pressed");
  };
  const release = () => button.classList.remove("is-pressed");
  button.addEventListener("pointerdown", press);
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
  button.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse") release();
  });
}

document.getElementById("add-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitCurrentItem();
});

itemInput.addEventListener("pointerdown", startComposing);
itemInput.addEventListener("focus", startComposing);
itemInput.addEventListener("compositionstart", () => {
  itemInputIsComposing = true;
  keepItemInputFocused = false;
});
itemInput.addEventListener("compositionend", () => {
  itemInputIsComposing = false;
  ignoreEnterSubmitUntil = Date.now() + 50;
});
itemInput.addEventListener("beforeinput", () => {
  if (clearingItemInput) return;
  keepItemInputFocused = false;
});
itemInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  if (event.isComposing || itemInputIsComposing || event.keyCode === 229) return;
  if (Date.now() < ignoreEnterSubmitUntil) return;
  event.preventDefault();
  submitCurrentItem();
});
itemInput.addEventListener("blur", () => {
  const restore = keepItemInputFocused;
  setTimeout(() => {
    if (document.activeElement === itemInput) return;
    if (itemInputIsComposing) return;
    if (restore) return;
    if (document.activeElement && document.activeElement.closest("#add-form")) return;
    keepItemInputFocused = false;
    stopComposing();
  }, 0);
});

function onAddButtonPress(event) {
  if (event.button) return;
  event.preventDefault();
  keepItemInputFocused = true;
  submitCurrentItem();
}

const addSubmitButton = document.querySelector("#add-form .add-btn");
addSubmitButton.addEventListener("pointerdown", onAddButtonPress, { passive: false });
addSubmitButton.addEventListener("touchend", (event) => {
  event.preventDefault();
}, { passive: false });
bindActionPress(addSubmitButton);
bindActionPress(document.querySelector("#store-form .add-btn"));
bindActionPress(document.getElementById("modal-ok"));
bindActionPress(document.getElementById("favorite-add-selected"));
bindActionPress(document.getElementById("history-add-selected"));

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    if (!document.body.classList.contains("is-composing")) return;
    if (itemInputIsComposing) return;
    applyComposerMetrics();
  });
}

document.getElementById("favorite-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.getElementById("favorite-input");
  const name = input.value.trim();
  if (!name) return;
  if (state.favorites.some((item) => item.name === name)) {
    showToast("すでに登録されています");
    return;
  }
  state.favorites.unshift({ id: createId(), name });
  input.value = "";
  saveState();
  render();
});

document.getElementById("store-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!beginActionLock()) return;
  const input = document.getElementById("store-input");
  const name = input.value.trim();
  if (!name) return;
  const store = { id: createId(), name, color: selectedAddColor };
  state.stores.push(store);
  state.currentStoreId = store.id;
  input.value = "";
  saveState();
  render();
});

document.getElementById("clear-checked-btn").addEventListener("click", () => {
  openModal({
    text: "購入済みの商品をすべて削除しますか？",
    okLabel: "削除",
    onOk: () => {
      state.items = state.items.filter((item) => !item.checked);
      saveState();
      render();
      showToast("購入済みを削除しました");
    }
  });
});

document.getElementById("reset-btn").addEventListener("click", () => {
  openModal({
    text: "すべてのデータを消して、最初の状態に戻しますか？",
    okLabel: "消す",
    onOk: () => {
      state = defaultState();
      saveState();
      currentScreen = "list";
      render();
      showToast("初期状態に戻しました");
    }
  });
});

document.getElementById("modal-colors").addEventListener("click", (event) => {
  const colorDot = event.target.closest("[data-pick-color]");
  if (!colorDot) return;
  selectedModalColor = colorDot.dataset.pickColor;
  fillColorPicker(document.getElementById("modal-colors"), selectedModalColor);
});
document.getElementById("modal-cancel").addEventListener("click", closeModal);
document.getElementById("modal-ok").addEventListener("click", () => {
  if (!modalCallback) return;
  if (!beginActionLock()) return;
  const input = document.getElementById("modal-input");
  const value = input.classList.contains("hidden") ? undefined : input.value;
  const callback = modalCallback;
  closeModal();
  callback(value);
});
document.getElementById("modal").addEventListener("click", (event) => {
  if (event.target.id !== "modal") return;
  if (Date.now() < ignoreClickUntil) return;
  closeModal();
});

document.querySelector(".bottom-nav").addEventListener("click", (event) => {
  const button = event.target.closest(".nav-btn");
  if (!button) return;
  stopComposing(true);
  currentScreen = button.dataset.screen;
  render();
});

document.getElementById("app").addEventListener("click", (event) => {
  const colorDot = event.target.closest("[data-pick-color]");
  if (colorDot) {
    const picker = colorDot.closest(".color-picker");
    const color = colorDot.dataset.pickColor;
    if (picker && picker.id === "add-color-picker") {
      selectedAddColor = color;
      fillColorPicker(picker, selectedAddColor);
    }
    if (picker && picker.id === "modal-colors") {
      selectedModalColor = color;
      fillColorPicker(picker, selectedModalColor);
    }
    return;
  }
  if (Date.now() < ignoreClickUntil) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  const id = target.dataset.id;

  if (action === "select-store") {
    state.currentStoreId = id;
    saveState();
    render();
    return;
  }

  if (action === "toggle-bought") {
    const storeId = target.dataset.storeId;
    const block = target.closest(".bought-block");
    if (!storeId || !block) return;
    const open = !block.classList.contains("is-open");
    boughtOpenByStore[storeId] = open;
    block.classList.toggle("is-open", open);
    target.setAttribute("aria-expanded", open ? "true" : "false");
    return;
  }

  if (action === "toggle-item") {
    const item = state.items.find((entry) => entry.id === id);
    if (!item) return;
    item.checked = !item.checked;
    if (!item.checked) {
      const maxOrder = itemsInStore(item.storeId)
        .filter((entry) => !entry.checked && entry.id !== item.id)
        .reduce((max, entry) => Math.max(max, entry.order), -1);
      item.order = maxOrder + 1;
    }
    reindexStore(item.storeId);
    saveState();
    const button = target.closest(".check-btn");
    const card = target.closest(".item-card");
    if (card) card.classList.toggle("checked", item.checked);
    if (button) {
      button.classList.add("is-pressed");
      button.textContent = item.checked ? "✓" : "";
    }
    setTimeout(() => {
      render();
      const nextButton = document.querySelector(`#list-content .check-btn[data-id="${id}"]`);
      if (!nextButton) return;
      nextButton.classList.add("is-pop");
      nextButton.addEventListener("animationend", () => nextButton.classList.remove("is-pop"), { once: true });
    }, 90);
    return;
  }

  if (action === "edit-name") {
    openNameEditor(target.dataset.source, id);
    return;
  }

  if (action === "toggle-favorite-select") {
    toggleSelectButton(selectedFavoriteIds, id, target, updateFavoriteSelectBar);
    return;
  }

  if (action === "toggle-history-select") {
    toggleSelectButton(selectedHistoryIds, id, target, updateHistorySelectBar);
    return;
  }

  if (action === "add-selected-favorites") {
    const selected = state.favorites.filter((item) => selectedFavoriteIds.has(item.id));
    if (selected.length === 0) return;
    const count = selected.length;
    const text = isAllStoresView()
      ? `選択した${count}件を\nすべてのお店の買い物リストに追加しますか？`
      : `選択した${count}件を\n「${currentStore().name}」の買い物リストに追加しますか？`;
    openModal({
      text,
      okLabel: "追加する",
      onOk: () => {
        const names = selected.map((item) => item.name);
        selectedFavoriteIds.clear();
        addNamesToCurrentStore(names, "favorite");
      }
    });
    return;
  }

  if (action === "add-selected-history") {
    const selected = state.history.filter((item) => selectedHistoryIds.has(item.id));
    if (selected.length === 0) return;
    const count = selected.length;
    const text = isAllStoresView()
      ? `選択した${count}件を\nすべてのお店の買い物リストに追加しますか？`
      : `選択した${count}件を\n「${currentStore().name}」の買い物リストに追加しますか？`;
    openModal({
      text,
      okLabel: "追加する",
      onOk: () => {
        const names = selected.map((item) => item.name);
        selectedHistoryIds.clear();
        addNamesToCurrentStore(names, "history");
      }
    });
    return;
  }

  if (action === "toggle-star") {
    const listItem = state.items.find((entry) => entry.id === id);
    const favorite = state.favorites.find((entry) => entry.id === id);
    const name = listItem?.name || favorite?.name;
    if (!name) return;
    if (isFavoriteName(name)) {
      removeFavoriteName(name);
    } else {
      addFavoriteName(name);
    }
    saveState();
    render();
    return;
  }

  if (action === "delete-item") {
    const item = state.items.find((entry) => entry.id === id);
    openModal({
      text: `「${item ? item.name : "この商品"}」を削除しますか？`,
      okLabel: "削除",
      onOk: () => {
        if (item) rememberHistory(item.name);
        state.items = state.items.filter((entry) => entry.id !== id);
        saveState();
        render();
      }
    });
    return;
  }

  if (action === "delete-history") {
    const historyItem = state.history.find((entry) => entry.id === id);
    openModal({
      text: `「${historyItem ? historyItem.name : "この商品"}」を削除しますか？`,
      okLabel: "削除",
      onOk: () => {
        state.history = state.history.filter((entry) => entry.id !== id);
        saveState();
        render();
      }
    });
    return;
  }

  if (action === "edit-store") {
    const store = state.stores.find((entry) => entry.id === id);
    if (!store) return;
    openModal({
      text: "お店を編集",
      value: store.name,
      color: storeColor(store),
      okLabel: "保存",
      onOk: (value) => {
        const name = (value || "").trim();
        if (!name) return;
        store.name = name;
        store.color = selectedModalColor;
        saveState();
        render();
      }
    });
    return;
  }

  if (action === "delete-store") {
    if (state.stores.length === 1) {
      showToast("お店は1つ以上必要です");
      return;
    }
    const store = state.stores.find((entry) => entry.id === id);
    openModal({
      text: `「${store ? store.name : "このお店"}」を削除しますか？このお店の買い物リストも消えます。`,
      okLabel: "削除",
      onOk: () => {
        state.stores = state.stores.filter((entry) => entry.id !== id);
        state.items = state.items.filter((item) => item.storeId !== id);
        if (state.currentStoreId === id) {
          state.currentStoreId = state.stores[0].id;
        }
        saveState();
        render();
      }
    });
  }
});

function otherSortItems(list, dragged) {
  return [...list.querySelectorAll("[data-sort-item]")].filter((item) => item !== dragged);
}

function dropIndexFromPointer(items, clientY) {
  for (let i = 0; i < items.length; i += 1) {
    const rect = items[i].getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return i;
  }
  return items.length;
}

function movePlaceholder(placeholder, list, dragged, insertIndex) {
  const rest = otherSortItems(list, dragged);
  if (insertIndex >= rest.length) {
    const last = rest[rest.length - 1];
    if (last) last.after(placeholder);
    else list.append(placeholder);
    return;
  }
  rest[insertIndex].before(placeholder);
}

let pressedRow = null;

function releasePressedRow() {
  if (!pressedRow) return;
  pressedRow.classList.remove("is-pressed");
  pressedRow = null;
}

document.addEventListener("pointerdown", (event) => {
  if (event.button) return;
  const checkButton = event.target.closest("#list-content .check-btn, #favorites-content .check-btn, #history-content .check-btn");
  if (checkButton) checkButton.classList.add("is-pressed");
  if (event.target.closest(".star-btn, .icon-btn, [data-drag-handle], .item-name[data-action='edit-name'], #favorites-content .check-btn, #history-content .check-btn")) {
    releasePressedRow();
    return;
  }
});

document.addEventListener("pointercancel", (event) => {
  const checkButton = event.target.closest("#list-content .check-btn, #favorites-content .check-btn, #history-content .check-btn");
  if (checkButton) checkButton.classList.remove("is-pressed");
});

window.addEventListener("pointerup", () => {
  document.querySelectorAll("#list-content .check-btn.is-pressed, #favorites-content .check-btn.is-pressed, #history-content .check-btn.is-pressed").forEach((button) => {
    button.classList.remove("is-pressed");
  });
  releasePressedRow();
});
window.addEventListener("pointercancel", releasePressedRow);

document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-drag-handle]");
  if (!handle || event.button) return;

  const row = handle.closest("[data-sort-item]");
  const list = handle.closest("[data-sort-list]");
  if (!row || !list) return;

  const startX = event.clientX;
  const startY = event.clientY;
  const pointerId = event.pointerId;
  let started = false;
  let ghost = null;
  let placeholder = null;
  let fromIndex = 0;
  let toIndex = 0;
  let offsetY = 0;
  let latestX = startX;
  let latestY = startY;
  const listType = list.dataset.sortList;
  const storeId = list.dataset.storeId;

  const timer = setTimeout(() => {
    started = true;
    const rows = [...list.querySelectorAll("[data-sort-item]")];
    fromIndex = rows.indexOf(row);
    toIndex = fromIndex;
    const rect = row.getBoundingClientRect();
    offsetY = latestY - rect.top;

    ghost = row.cloneNode(true);
    ghost.classList.remove("is-drag-origin");
    ghost.classList.add("drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.position = "fixed";
    ghost.style.left = `${rect.left}px`;
    ghost.style.top = `${rect.top}px`;
    ghost.style.width = `${rect.width}px`;
    ghost.style.zIndex = "80";
    ghost.style.margin = "0";
    ghost.style.display = "flex";
    ghost.style.pointerEvents = "none";
    document.body.appendChild(ghost);

    placeholder = document.createElement("div");
    placeholder.className = "sort-placeholder";
    placeholder.style.height = `${rect.height}px`;
    row.before(placeholder);
    row.classList.add("is-drag-origin");

    document.body.classList.add("is-sorting");
    if (navigator.vibrate) navigator.vibrate(12);
    try {
      handle.setPointerCapture(pointerId);
    } catch (error) {
      // 一部のブラウザでは capture できないので無視
    }
  }, 280);

  function onMove(moveEvent) {
    latestX = moveEvent.clientX;
    latestY = moveEvent.clientY;
    if (!started) {
      if (Math.abs(latestX - startX) > 10 || Math.abs(latestY - startY) > 10) {
        clearTimeout(timer);
      }
      return;
    }
    moveEvent.preventDefault();
    ghost.style.top = `${latestY - offsetY}px`;
    const rest = otherSortItems(list, row);
    const nextIndex = dropIndexFromPointer(rest, latestY);
    if (nextIndex === toIndex) return;
    toIndex = nextIndex;
    movePlaceholder(placeholder, list, row, toIndex);
  }

  function onUp() {
    clearTimeout(timer);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    if (!started) return;
    ignoreClickUntil = Date.now() + 400;
    if (ghost) ghost.remove();
    if (placeholder) placeholder.remove();
    row.classList.remove("is-drag-origin");
    document.body.classList.remove("is-sorting");
    if (listType === "store") reorderStores(fromIndex, toIndex);
    if (listType === "item") reorderItems(storeId, fromIndex, toIndex);
    if (listType === "favorite") reorderFavorites(fromIndex, toIndex);
  }

  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
});

state.stores.forEach((store) => reindexStore(store.id));
render();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js?v=77", { updateViaCache: "none" }).then((registration) => {
    registration.update();
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") registration.update();
    });
  });
}
