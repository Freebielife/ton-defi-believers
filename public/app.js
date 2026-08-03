const savedLanguage = (() => {
  try { return localStorage.getItem("tdb-language"); } catch { return null; }
})();

const DATA_SOURCES = [
  {
    id: "github-raw",
    kind: "online",
    url: "https://raw.githubusercontent.com/Freebielife/ton-defi-believers/main/public/data/market-catalog.json",
  },
  {
    id: "github-pages",
    kind: "online",
    url: "https://freebielife.github.io/ton-defi-believers/data/market-catalog.json",
  },
  { id: "local", kind: "local", url: "./data/market-catalog.json" },
];

const DATA_RECHECK_INTERVAL_MS = 10 * 60 * 1000;
const DATA_REQUEST_TIMEOUT_MS = 12 * 1000;

const state = {
  language: savedLanguage === "ru" || savedLanguage === "en"
    ? savedLanguage
    : (navigator.language?.toLowerCase().startsWith("ru") ? "ru" : "en"),
  filter: "all",
  search: "",
  sort: "tvl",
  opportunities: [],
  protocols: [],
  categories: [],
  dataset: null,
  dataSource: null,
  initialized: false,
  loading: false,
};


const protocolIconMap = {
  "Tonstakers": "./assets/protocols/tonstakers.svg",
  "Stakee": "./assets/protocols/stakee.svg",
  "Hipo": "./assets/protocols/hipo.svg",
  "Bemo": "./assets/protocols/bemo.svg",
  "KTON": "./assets/protocols/kton.svg",
  "Affluent": "./assets/protocols/affluent.svg",
  "Storm Trade": "./assets/protocols/storm-trade.svg",
  "EVAA": "./assets/protocols/evaa.svg",
  "STON.fi": "./assets/protocols/stonfi.svg",
  "GTC": "./assets/protocols/gtc.svg",
  "Morpho": "./assets/protocols/morpho.svg",
  "Ethena": "./assets/protocols/ethena.svg",
  "Telegram Wallet": "./assets/protocols/telegram-wallet.svg",
  "Euler": "./assets/protocols/euler.svg",
  "DeDust": "./assets/protocols/dedust.svg",
};

const translations = {
  en: {
    pilot: "TON DeFi market catalog",
    title: "TON DeFi market at a glance",
    subtitle: "Current yield, 7-day average and TVL for concrete TON DeFi products — grouped by asset and ordered by liquidity by default.",
    protocols: "Protocols",
    opportunities: "Opportunities",
    lowTvlSummary: "Low TVL",
    snapshot: "Snapshot",
    dataModelTitle: "How the data is formed",
    dataModelText: "TON DeFi Believers brings protocol data into one catalog. Official sources and APIs are used where available, while TON Yields Daily supports daily market monitoring and cross-checking.",
    dataModelNote: "TON Yields Daily is not presented as the only source of yield data. Source and verification time are preserved for every opportunity.",
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
    yield: "Yield",
    current: "Current",
    average7d: "7d average",
    averageShort: "7d",
    utilization: "UR",
    data: "Updated",
    open: "Open",
    visitProtocol: "Open protocol",
    loading: "Loading market data…",
    unavailable: "Data unavailable",
    emptyTitle: "Nothing found",
    emptyText: "Try another search or asset category.",
    result: "results",
    oneResult: "result",
    lowTvl: "Low TVL",
    hourlyChecks: "Source check every hour",
    onlineData: "Online data",
    localBackup: "Local backup",
    dataRefreshing: "Refreshing data…",
    freshnessChecking: "Checking freshness…",
    freshnessFresh: "Fresh snapshot",
    freshnessWarning: "Data may be outdated",
    freshnessStale: "Outdated snapshot",
    ageHours: "{value}h old",
    ageDays: "{value}d old",
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
    pilot: "Каталог рынка TON DeFi",
    title: "Рынок TON DeFi одним взглядом",
    subtitle: "Текущая доходность, среднее за 7 дней и TVL конкретных продуктов TON DeFi — с группировкой по активам и сортировкой по ликвидности по умолчанию.",
    protocols: "Протоколов",
    opportunities: "Возможностей",
    lowTvlSummary: "Низкий TVL",
    snapshot: "Снимок",
    dataModelTitle: "Как формируются данные",
    dataModelText: "TON DeFi Believers объединяет данные протоколов в одном каталоге. Официальные источники и API используются по мере доступности, а TON Yields Daily помогает с ежедневным мониторингом и сверкой рынка.",
    dataModelNote: "TON Yields Daily не является единственным источником доходности. Для каждой возможности сохраняются источник и время проверки.",
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
    yield: "Доходность",
    current: "Сейчас",
    average7d: "Среднее 7д",
    averageShort: "7 дней",
    utilization: "UR",
    data: "Обновлено",
    open: "Открыть",
    visitProtocol: "Открыть протокол",
    loading: "Загрузка данных…",
    unavailable: "Данные недоступны",
    emptyTitle: "Ничего не найдено",
    emptyText: "Измените запрос или категорию активов.",
    result: "результатов",
    oneResult: "результат",
    lowTvl: "Низкий TVL",
    hourlyChecks: "Проверка источников каждый час",
    onlineData: "Онлайн-данные",
    localBackup: "Резервный снимок",
    dataRefreshing: "Обновление данных…",
    freshnessChecking: "Проверка актуальности…",
    freshnessFresh: "Актуальный снимок",
    freshnessWarning: "Данные могут быть устаревшими",
    freshnessStale: "Устаревший снимок",
    ageHours: "{value} ч назад",
    ageDays: "{value} дн. назад",
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
  lowTvlCount: document.querySelector("#lowTvlCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
  tableShell: document.querySelector(".table-shell"),
  sourceLink: document.querySelector("#sourceLink"),
  freshnessBadge: document.querySelector("#freshnessBadge"),
  dataSourceBadge: document.querySelector("#dataSourceBadge"),
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

function hoursSince(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, (Date.now() - time) / 3_600_000);
}

function ageText(hours) {
  if (!Number.isFinite(hours)) return "";
  if (hours < 48) return text("ageHours").replace("{value}", String(Math.max(1, Math.round(hours))));
  return text("ageDays").replace("{value}", String(Math.max(2, Math.floor(hours / 24))));
}

function freshnessInfo(value) {
  const hours = hoursSince(value);
  const policy = state.dataset?.settings?.freshness ?? {};
  const freshHours = Number.isFinite(policy.freshHours) ? policy.freshHours : 24;
  const warningHours = Number.isFinite(policy.warningHours) ? policy.warningHours : 48;
  if (!Number.isFinite(hours)) return { level: "unknown", label: text("freshnessChecking"), hours };
  if (hours <= freshHours) return { level: "fresh", label: text("freshnessFresh"), hours };
  if (hours <= warningHours) return { level: "warning", label: text("freshnessWarning"), hours };
  return { level: "stale", label: text("freshnessStale"), hours };
}

function categoryLabel(id) {
  const category = state.categories.find((item) => item.id === id);
  return category?.label?.[state.language] || category?.label?.en || id;
}

function datasetTimestamp(document) {
  const value = document?.snapshot?.publishedAt || document?.updatedAt;
  const timestamp = new Date(value || 0).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function validateDataset(document) {
  if (!document || typeof document !== "object") throw new Error("Invalid market document");
  if (!Array.isArray(document.opportunities) || document.opportunities.length === 0) {
    throw new Error("Market document has no opportunities");
  }
  if (!Array.isArray(document.protocols) || !Array.isArray(document.categories)) {
    throw new Error("Market document has an invalid catalog structure");
  }
  return document;
}

function withCacheBuster(url) {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${Date.now()}`;
}

async function fetchDataset(source) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), DATA_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(withCacheBuster(source.url), {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${source.id}: HTTP ${response.status}`);
    const document = validateDataset(await response.json());
    return { source, document, timestamp: datasetTimestamp(document) };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function resolveLatestDataset(sources = DATA_SOURCES) {
  const results = await Promise.allSettled(sources.map((source) => fetchDataset(source)));
  const available = results
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value)
    .sort((a, b) => b.timestamp - a.timestamp || sources.indexOf(a.source) - sources.indexOf(b.source));

  if (!available.length) {
    const failures = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason?.message || String(result.reason));
    throw new Error(failures.join("; ") || "No market data source is available");
  }

  return available[0];
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

  row.dataset.category = item.category || "other";
  const protocolLink = row.querySelector(".protocol-link");
  const logo = row.querySelector(".protocol-logo");
  const iconUrl = protocolIconMap[item.protocol];
  logo.src = iconUrl || "./assets/brand/favicon.png";
  logo.addEventListener("error", () => {
    logo.src = "./assets/brand/favicon.png";
  }, { once: true });
  row.querySelector(".protocol-name").textContent = item.protocol;
  row.querySelector(".opportunity-type").textContent = typeText(item.type);
  protocolLink.setAttribute("aria-label", `${text("visitProtocol")}: ${item.protocol}`);
  protocolLink.title = `${text("visitProtocol")}: ${item.protocol}`;
  if (link) protocolLink.href = link;
  else {
    protocolLink.removeAttribute("href");
    protocolLink.classList.add("is-disabled");
    protocolLink.setAttribute("aria-disabled", "true");
  }
  row.querySelector(".product-name").textContent = item.product;
  row.querySelector(".asset-pill").textContent = item.asset || "—";

  const current = row.querySelector(".current-value");
  current.textContent = `${formatPercent(item.apy?.current, 2)} ${trendSymbol(item)}`.trim();
  current.classList.toggle("is-down", item.apy?.trend === "down");

  row.querySelector(".metric-label").textContent = String(item.apy?.metric || "apy").toUpperCase();
  row.querySelector(".average-value").textContent = `${text("averageShort")}: ${formatPercent(item.apy?.average7d, 2)}`;

  const urChip = row.querySelector(".ur-chip");
  if (Number.isFinite(item.utilizationRate)) {
    urChip.hidden = false;
    urChip.textContent = `${text("utilization")} ${formatPercent(item.utilizationRate, 1)}`;
    urChip.classList.toggle("is-hot", item.utilizationRate >= 95);
  }

  const note = row.querySelector(".yield-note");
  const noteText = item.apy?.note?.[state.language] || item.apy?.note?.en || "";
  note.textContent = noteText;
  note.hidden = !noteText;

  const tvlWrap = row.querySelector(".tvl-wrap");
  row.querySelector(".tvl-value").textContent = formatMoney(item.tvlUsd);
  if (item.status?.lowTvl) {
    const badge = document.createElement("span");
    badge.className = "low-tvl-badge";
    badge.textContent = text("lowTvl");
    tvlWrap.append(badge);
  }

  const updated = row.querySelector(".updated-value");
  updated.textContent = formatDate(item.source?.lastChecked, true);
  const itemFreshness = freshnessInfo(item.source?.lastChecked);
  updated.classList.toggle("is-warning", itemFreshness.level === "warning");
  updated.classList.toggle("is-stale", itemFreshness.level === "stale");
  updated.title = `${itemFreshness.label}${ageText(itemFreshness.hours) ? ` · ${ageText(itemFreshness.hours)}` : ""}`;

  const labels = [text("protocol"), text("product"), text("asset"), text("yield"), "TVL", text("data")];
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
      categoryRow.dataset.category = category;
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
  elements.protocolCount.textContent = state.protocols.length;
  elements.opportunityCount.textContent = state.opportunities.length;
  elements.lowTvlCount.textContent = state.opportunities.filter((item) => item.status?.lowTvl).length;
  elements.lastUpdated.textContent = formatDate(snapshot.publishedAt || state.dataset?.updatedAt, true);
  elements.sourceLink.href = snapshot.sourceUrl || "https://t.me/ton_yields_daily";
  elements.sourceLink.textContent = snapshot.source || "TON Yields Daily";

  const isOnline = state.dataSource?.kind === "online";
  elements.dataSourceBadge.textContent = isOnline ? text("onlineData") : text("localBackup");
  elements.dataSourceBadge.className = `data-source-badge ${isOnline ? "is-online" : "is-local"}`;
  elements.dataSourceBadge.title = state.dataSource?.id || "";

  const freshness = freshnessInfo(snapshot.publishedAt || state.dataset?.updatedAt);
  const age = ageText(freshness.hours);
  elements.freshnessBadge.textContent = `${freshness.label}${age ? ` · ${age}` : ""}`;
  elements.freshnessBadge.className = `freshness-badge is-${freshness.level}`;
  elements.freshnessBadge.title = snapshot.publishedAt || state.dataset?.updatedAt || "";
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

function applySelectedDataset(selected, { preserveSort = true } = {}) {
  const document = selected.document;
  const previousTimestamp = datasetTimestamp(state.dataset);
  const nextTimestamp = datasetTimestamp(document);
  const sourceChanged = state.dataSource?.id !== selected.source.id;
  const dataChanged = !state.initialized || nextTimestamp !== previousTimestamp;

  state.dataset = document;
  state.dataSource = selected.source;
  state.opportunities = (document.opportunities ?? []).filter((item) => item.status?.active !== false);
  state.protocols = document.protocols ?? [];
  state.categories = document.categories ?? [];

  if (!state.initialized || !preserveSort) {
    state.sort = document.settings?.defaultSort || "tvl";
    elements.sortSelect.value = state.sort;
  }
  state.initialized = true;

  if (dataChanged || sourceChanged) applyTranslations();
  else updateSummary();
}

async function loadData({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;

  try {
    if (!state.initialized) {
      try {
        const local = await fetchDataset(DATA_SOURCES.find((source) => source.kind === "local"));
        applySelectedDataset(local, { preserveSort: false });
      } catch (localError) {
        console.warn("Local market backup is unavailable:", localError);
      }
    }

    if (!silent && elements.dataSourceBadge) {
      elements.dataSourceBadge.textContent = text("dataRefreshing");
      elements.dataSourceBadge.className = "data-source-badge is-loading";
    }

    const onlineSources = DATA_SOURCES.filter((source) => source.kind === "online");
    const online = await resolveLatestDataset(onlineSources);
    const onlineIsNewer = !state.dataset || online.timestamp >= datasetTimestamp(state.dataset);
    if (onlineIsNewer) applySelectedDataset(online);
    else updateSummary();
  } catch (error) {
    console.warn("Online market data is unavailable; local backup remains active:", error);
    if (!state.initialized) {
      elements.marketRows.innerHTML = `<tr class="loading-row"><td colspan="6">${text("unavailable")}</td></tr>`;
      elements.resultCount.textContent = "";
    } else {
      updateSummary();
    }
  } finally {
    state.loading = false;
  }
}

function scheduleDataRefresh() {
  window.setInterval(() => loadData({ silent: true }), DATA_RECHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") loadData({ silent: true });
  });
  window.addEventListener("online", () => loadData({ silent: true }));
}

elements.languageButton.addEventListener("click", () => {
  state.language = state.language === "en" ? "ru" : "en";
  try { localStorage.setItem("tdb-language", state.language); } catch { /* no-op */ }
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

loadData().finally(scheduleDataRefresh);
