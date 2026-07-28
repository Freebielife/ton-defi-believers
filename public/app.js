const state = {
  language: "en",
  filter: "all",
  search: "",
  sort: "tvl",
  opportunities: [],
  protocols: [],
  categories: [],
  dataset: null,
};

const translations = {
  en: {
    pilot: "Market catalog · daily snapshot",
    title: "TON DeFi market at a glance",
    subtitle: "Current yield, 7-day average and TVL for concrete TON DeFi products — grouped by asset, not ranked as investment advice.",
    marketTvl: "Market TVL",
    protocols: "Protocols",
    opportunities: "Opportunities",
    snapshot: "Snapshot",
    noticePrefix: "Data snapshot:",
    notice: "values change and are not guaranteed. Low TVL means less than $10K. The default order is by TVL, not by the highest yield.",
    market: "Market catalog",
    marketTitle: "Yield opportunities",
    searchLabel: "Search",
    searchPlaceholder: "Search protocol, asset or product",
    all: "All assets",
    gram: "GRAM",
    stablecoins: "Stablecoins",
    gramUsdt: "GRAM–USDT",
    btc: "BTC",
    eth: "ETH",
    sort: "Sort",
    sortTvl: "TVL: high to low",
    sortAverage: "7d average: high to low",
    sortCurrent: "Current yield: high to low",
    sortProtocol: "Protocol: A–Z",
    protocol: "Protocol",
    product: "Product / pool",
    asset: "Asset",
    current: "Current",
    average7d: "7d average",
    data: "Updated",
    open: "Open",
    loading: "Loading market data…",
    unavailable: "Data unavailable",
    emptyTitle: "Nothing found",
    emptyText: "Try another search or asset category.",
    result: "results",
    oneResult: "result",
    lowTvl: "Low TVL",
    noUr: "—",
    source: "Source",
    disclaimer: "Information only. Yield, incentives and TVL can change. DeFi involves smart-contract, liquidity, market and counterparty risks.",
    type: {
      "liquid-staking": "Liquid staking",
      staking: "Staking",
      lending: "Lending",
      "liquidity-pool": "Liquidity pool",
      vault: "Vault",
      "yield-token": "Yield token",
    },
  },
  ru: {
    pilot: "Каталог рынка · ежедневный снимок",
    title: "Рынок TON DeFi одним взглядом",
    subtitle: "Текущая доходность, среднее за 7 дней и TVL конкретных продуктов TON DeFi — с группировкой по активам, без выдачи максимального APY за лучший вариант.",
    marketTvl: "TVL рынка",
    protocols: "Протоколов",
    opportunities: "Возможностей",
    snapshot: "Снимок",
    noticePrefix: "Снимок данных:",
    notice: "значения меняются и не гарантированы. Низкий TVL — менее $10 тыс. По умолчанию список отсортирован по TVL, а не по максимальной доходности.",
    market: "Каталог рынка",
    marketTitle: "Доходные возможности",
    searchLabel: "Поиск",
    searchPlaceholder: "Протокол, актив или продукт",
    all: "Все активы",
    gram: "GRAM",
    stablecoins: "Стейблкоины",
    gramUsdt: "GRAM–USDT",
    btc: "BTC",
    eth: "ETH",
    sort: "Сортировка",
    sortTvl: "TVL: по убыванию",
    sortAverage: "Среднее за 7 дней: по убыванию",
    sortCurrent: "Текущая доходность: по убыванию",
    sortProtocol: "Протокол: А–Я",
    protocol: "Протокол",
    product: "Продукт / пул",
    asset: "Актив",
    current: "Сейчас",
    average7d: "Среднее 7д",
    data: "Обновлено",
    open: "Открыть",
    loading: "Загрузка данных…",
    unavailable: "Данные недоступны",
    emptyTitle: "Ничего не найдено",
    emptyText: "Измените запрос или категорию активов.",
    result: "результатов",
    oneResult: "результат",
    lowTvl: "Низкий TVL",
    noUr: "—",
    source: "Источник",
    disclaimer: "Только для ознакомления. Доходность, награды и TVL меняются. DeFi связан с рисками смарт-контрактов, ликвидности, рынка и контрагентов.",
    type: {
      "liquid-staking": "Ликвидный стейкинг",
      staking: "Стейкинг",
      lending: "Лендинг",
      "liquidity-pool": "Пул ликвидности",
      vault: "Хранилище",
      "yield-token": "Доходный токен",
    },
  },
};

const elements = {
  languageButton: document.querySelector("#languageButton"),
  searchInput: document.querySelector("#searchInput"),
  filters: document.querySelector("#filters"),
  sortSelect: document.querySelector("#sortSelect"),
  marketRows: document.querySelector("#marketRows"),
  rowTemplate: document.querySelector("#rowTemplate"),
  categoryTemplate: document.querySelector("#categoryTemplate"),
  protocolCount: document.querySelector("#protocolCount"),
  opportunityCount: document.querySelector("#opportunityCount"),
  marketTvl: document.querySelector("#marketTvl"),
  lastUpdated: document.querySelector("#lastUpdated"),
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
  tableShell: document.querySelector(".table-shell"),
  sourceLink: document.querySelector("#sourceLink"),
};

function text(key) {
  return translations[state.language][key] ?? key;
}

function typeText(type) {
  return translations[state.language].type[type] ?? type ?? "—";
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function initials(name) {
  return String(name)
    .split(/\s|\./)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function formatPercent(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(value)}%`;
}

function formatMoney(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  return new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : value >= 10_000 ? 0 : 1,
  }).format(value);
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" } : {}),
  }).format(date);
}

function categoryLabel(id) {
  const category = state.categories.find((item) => item.id === id);
  return category?.label?.[state.language] || category?.label?.en || id;
}

function sorted(items) {
  return [...items].sort((a, b) => {
    if (state.sort === "average") return (b.apy?.average7d ?? -1) - (a.apy?.average7d ?? -1);
    if (state.sort === "current") return (b.apy?.current ?? -1) - (a.apy?.current ?? -1);
    if (state.sort === "protocol") return a.protocol.localeCompare(b.protocol) || a.product.localeCompare(b.product);
    return (b.tvlUsd ?? -1) - (a.tvlUsd ?? -1);
  });
}

function filteredOpportunities() {
  const query = normalize(state.search);
  return state.opportunities.filter((item) => {
    const matchesFilter = state.filter === "all" || item.category === state.filter;
    const haystack = [item.protocol, item.product, item.asset, typeText(item.type)].map(normalize).join(" ");
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function trendSymbol(item) {
  if (item.apy?.trend === "up") return "↑";
  if (item.apy?.trend === "down") return "↓";
  return "";
}

function renderRow(item) {
  const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
  const link = item.links?.app || item.links?.official;

  row.querySelector(".protocol-icon").textContent = initials(item.protocol);
  row.querySelector(".protocol-name").textContent = item.protocol;
  row.querySelector(".opportunity-type").textContent = typeText(item.type);
  row.querySelector(".product-name").textContent = item.product;
  row.querySelector(".asset-pill").textContent = item.asset || "—";

  const current = row.querySelector(".current-value");
  current.textContent = `${formatPercent(item.apy?.current, 2)} ${trendSymbol(item)}`.trim();
  current.classList.toggle("is-up", item.apy?.trend === "up");
  current.classList.toggle("is-down", item.apy?.trend === "down");

  const note = row.querySelector(".yield-note");
  const noteText = item.apy?.note?.[state.language] || item.apy?.note?.en || "";
  note.textContent = noteText;
  note.hidden = !noteText;

  row.querySelector(".average-value").textContent = formatPercent(item.apy?.average7d, 2);

  const tvlWrap = row.querySelector(".tvl-wrap");
  row.querySelector(".tvl-value").textContent = formatMoney(item.tvlUsd);
  if (item.status?.lowTvl) {
    const badge = document.createElement("span");
    badge.className = "low-tvl-badge";
    badge.textContent = text("lowTvl");
    tvlWrap.append(badge);
  }

  const ur = row.querySelector(".ur-value");
  ur.textContent = Number.isFinite(item.utilizationRate) ? formatPercent(item.utilizationRate, 1) : text("noUr");
  if (Number.isFinite(item.utilizationRate) && item.utilizationRate >= 95) ur.classList.add("is-hot");

  row.querySelector(".updated-value").textContent = formatDate(item.source?.lastChecked, true);

  const action = row.querySelector(".open-link");
  action.querySelector(".open-link-label").textContent = text("open");
  action.setAttribute("aria-label", `${text("open")}: ${item.protocol} — ${item.product}`);
  if (link) action.href = link;
  else {
    action.removeAttribute("href");
    action.classList.add("is-disabled");
    action.setAttribute("aria-disabled", "true");
  }

  const labels = [text("protocol"), text("product"), text("asset"), text("current"), text("average7d"), "TVL", "UR", text("data")];
  row.querySelectorAll("td").forEach((cell, index) => {
    if (labels[index]) cell.dataset.label = labels[index];
  });
  return row;
}

function renderRows() {
  const items = filteredOpportunities();
  elements.marketRows.replaceChildren();

  if (items.length) {
    const order = state.dataset?.settings?.categoryOrder ?? ["gram", "stablecoins", "gram-usdt", "btc", "eth"];
    const categories = state.filter === "all"
      ? order.filter((category) => items.some((item) => item.category === category))
      : [state.filter];

    for (const category of categories) {
      const group = sorted(items.filter((item) => item.category === category));
      if (!group.length) continue;
      const categoryRow = elements.categoryTemplate.content.firstElementChild.cloneNode(true);
      categoryRow.querySelector(".category-name").textContent = categoryLabel(category);
      categoryRow.querySelector(".category-count").textContent = String(group.length);
      elements.marketRows.append(categoryRow);
      group.forEach((item) => elements.marketRows.append(renderRow(item)));
    }
  }

  const countLabel = items.length === 1 ? text("oneResult") : text("result");
  elements.resultCount.textContent = `${items.length} ${countLabel}`;
  elements.emptyState.hidden = items.length > 0;
  elements.tableShell.hidden = items.length === 0;
}

function updateSummary() {
  const snapshot = state.dataset?.snapshot ?? {};
  elements.marketTvl.textContent = formatMoney(snapshot.marketTvlUsd);
  elements.protocolCount.textContent = state.protocols.length;
  elements.opportunityCount.textContent = state.opportunities.length;
  elements.lastUpdated.textContent = formatDate(snapshot.publishedAt || state.dataset?.updatedAt, true);
  elements.sourceLink.href = snapshot.sourceUrl || "https://t.me/ton_yields_daily";
  elements.sourceLink.textContent = snapshot.source || "TON Yields Daily";
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[state.language][key]) element.textContent = translations[state.language][key];
  });
  elements.searchInput.placeholder = text("searchPlaceholder");
  elements.languageButton.textContent = state.language === "en" ? "RU" : "EN";
  updateSummary();
  renderRows();
}

async function loadData() {
  try {
    const response = await fetch("./data/market-catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const document = await response.json();
    state.dataset = document;
    state.opportunities = (document.opportunities ?? []).filter((item) => item.status?.active !== false);
    state.protocols = document.protocols ?? [];
    state.categories = document.categories ?? [];
    state.sort = document.settings?.defaultSort || "tvl";
    elements.sortSelect.value = state.sort;
    updateSummary();
    renderRows();
  } catch (error) {
    console.error(error);
    elements.marketRows.innerHTML = `<tr class="loading-row"><td colspan="9">${text("unavailable")}</td></tr>`;
    elements.resultCount.textContent = "";
  }
}

elements.languageButton.addEventListener("click", () => {
  state.language = state.language === "en" ? "ru" : "en";
  applyTranslations();
});

elements.searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderRows();
});

elements.filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;
  state.filter = button.dataset.filter;
  elements.filters.querySelectorAll(".filter-button").forEach((item) => item.classList.toggle("is-active", item === button));
  renderRows();
});

elements.sortSelect.addEventListener("change", (event) => {
  state.sort = event.target.value;
  renderRows();
});

loadData();
