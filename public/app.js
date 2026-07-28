const state = {
  language: "en",
  filter: "all",
  search: "",
  sort: "tvl",
  protocols: [],
  opportunities: [],
  dataset: null,
};

const translations = {
  en: {
    pilot: "Pilot version · 15 selected protocols",
    title: "A quick view of TON DeFi",
    subtitle: "Compare selected staking, lending, liquidity and vault opportunities without opening many different apps.",
    protocols: "Protocols",
    opportunities: "Opportunities",
    snapshot: "Dataset snapshot",
    notice: "Values published by official sources are shown even when they are variable, expected or available only as a dated snapshot. Each such value is clearly marked.",
    selectedMarket: "Selected market",
    marketTitle: "TON DeFi opportunities",
    searchLabel: "Search",
    searchPlaceholder: "Search protocol, asset or pool",
    all: "All",
    staking: "Staking",
    lending: "Lending",
    liquidity: "Liquidity",
    vaults: "Vaults",
    sort: "Sort",
    sortTvl: "TVL: high to low",
    sortApy: "Yield: high to low",
    sortProtocol: "Protocol: A–Z",
    protocol: "Protocol",
    product: "Product / pool",
    asset: "Asset",
    data: "Data",
    open: "Open",
    loading: "Loading market data…",
    emptyTitle: "Nothing found",
    emptyText: "Try another search or category.",
    coverage: "Coverage",
    coverageTitle: "The 15 protocols in this pilot",
    disclaimer: "Information only. Yield can change and DeFi involves smart-contract, liquidity and market risks.",
    live: "API",
    snapshotLabel: "Snapshot",
    unavailable: "Unavailable",
    noData: "No verified opportunity available",
    available: "opportunities",
    result: "results",
    oneResult: "result",
    updated: "Updated",
    notVerified: "Manual snapshot",
    verified: "Verified",
    upTo: "Up to",
    yield: "Yield",
    unknownDate: "Unknown",
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
    pilot: "Пилотная версия · 15 выбранных протоколов",
    title: "Быстрый обзор DeFi в TON",
    subtitle: "Сравните выбранные возможности стейкинга, лендинга, пулов ликвидности и хранилищ без перехода между множеством приложений.",
    protocols: "Протоколов",
    opportunities: "Возможностей",
    snapshot: "Снимок данных",
    notice: "Показываем значения из официальных источников, даже если ставка переменная, ожидаемая или доступна только как датированный снимок. Такие значения всегда отмечены пояснением.",
    selectedMarket: "Выбранный рынок",
    marketTitle: "Возможности TON DeFi",
    searchLabel: "Поиск",
    searchPlaceholder: "Протокол, актив или пул",
    all: "Все",
    staking: "Стейкинг",
    lending: "Лендинг",
    liquidity: "Ликвидность",
    vaults: "Хранилища",
    sort: "Сортировка",
    sortTvl: "TVL: по убыванию",
    sortApy: "Доходность: по убыванию",
    sortProtocol: "Протокол: А–Я",
    protocol: "Протокол",
    product: "Продукт / пул",
    asset: "Актив",
    data: "Данные",
    open: "Открыть",
    loading: "Загрузка данных…",
    emptyTitle: "Ничего не найдено",
    emptyText: "Измените запрос или категорию.",
    coverage: "Охват",
    coverageTitle: "15 протоколов пилотной версии",
    disclaimer: "Только для ознакомления. Доходность меняется, а DeFi связан с рисками смарт-контрактов, ликвидности и рынка.",
    live: "API",
    snapshotLabel: "Снимок",
    unavailable: "Нет данных",
    noData: "Нет проверенной доходной возможности",
    available: "возможностей",
    result: "результатов",
    oneResult: "результат",
    updated: "Обновлено",
    notVerified: "Ручной снимок",
    verified: "Проверено",
    upTo: "до",
    yield: "Доходность",
    unknownDate: "Неизвестно",
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
  protocolGrid: document.querySelector("#protocolGrid"),
  protocolCount: document.querySelector("#protocolCount"),
  opportunityCount: document.querySelector("#opportunityCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
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

function protocolKey(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}

function formatMoney(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  return new Intl.NumberFormat(state.language === "ru" ? "ru-RU" : "en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: value >= 1_000_000 ? 1 : 0,
  }).format(value);
}

function formatYield(opportunity) {
  const apy = opportunity?.apy ?? {};
  const value = apy.current;
  if (!Number.isFinite(value)) {
    return apy.display?.[state.language] || apy.display?.en || "—";
  }
  const metric = String(apy.metric || "apy").toUpperCase();
  const number = value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  const prefix = apy.isMaximum ? `${text("upTo")} ` : apy.isApproximate ? "≈" : "";
  return `${prefix}${number}% ${metric}`;
}

function formatYieldNote(opportunity) {
  const apy = opportunity?.apy ?? {};
  return apy.note?.[state.language] || apy.note?.en || "";
}

function verificationNote(opportunity) {
  const note = opportunity?.verification?.note;
  return note?.[state.language] || note?.en || "";
}

function formatDate(value, short = false) {
  if (!value) return text("unknownDate");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text("unknownDate");
  return new Intl.DateTimeFormat(state.language === "ru" ? "ru-RU" : "en-GB", {
    day: "2-digit",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
  }).format(date);
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

function categoryFor(type) {
  if (["liquid-staking", "staking"].includes(type)) return "staking";
  if (type === "lending") return "lending";
  if (type === "liquidity-pool") return "liquidity";
  if (["vault", "yield-token"].includes(type)) return "vault";
  return "other";
}

function getSource(opportunity) {
  if (!opportunity) {
    return { label: text("unavailable"), className: "is-unavailable", detail: text("noData") };
  }

  const source = opportunity.source ?? {};
  const status = opportunity.status ?? {};
  if (status.sourceError || status.stale) {
    return { label: text("unavailable"), className: "is-unavailable", detail: text("unavailable") };
  }

  if (["api", "official-api", "onchain"].includes(source.type) && source.lastChecked) {
    return {
      label: text("live"),
      className: "is-live",
      detail: `${text("updated")} ${formatDate(source.lastChecked, true)}`,
    };
  }

  if (["official-page", "official-announcement", "official-product"].includes(source.type)) {
    return {
      label: text("verified"),
      className: "is-verified",
      detail: source.lastChecked
        ? `${text("updated")} ${formatDate(source.lastChecked, true)}`
        : text("verified"),
    };
  }

  return {
    label: text("snapshotLabel"),
    className: "is-snapshot",
    detail: text("notVerified"),
  };
}

function buildEntries() {
  const opportunityMap = new Map();
  for (const opportunity of state.opportunities) {
    const key = protocolKey(opportunity.protocol);
    if (!opportunityMap.has(key)) opportunityMap.set(key, []);
    opportunityMap.get(key).push(opportunity);
  }

  const entries = [];
  for (const protocol of state.protocols) {
    const opportunities = opportunityMap.get(protocolKey(protocol.name)) ?? [];
    if (opportunities.length === 0) {
      entries.push({ protocol, opportunity: null, category: "all" });
      continue;
    }

    for (const opportunity of opportunities) {
      entries.push({ protocol, opportunity, category: categoryFor(opportunity.type) });
    }
  }
  return entries;
}

function filteredEntries() {
  const query = normalize(state.search);
  const filtered = buildEntries().filter(({ protocol, opportunity, category }) => {
    const matchesFilter = state.filter === "all" || category === state.filter;
    const haystack = [protocol.name, opportunity?.product, opportunity?.asset, opportunity?.type]
      .map(normalize)
      .join(" ");
    return matchesFilter && (!query || haystack.includes(query));
  });

  return filtered.sort((a, b) => {
    if (state.sort === "apy") {
      return (b.opportunity?.apy?.current ?? -1) - (a.opportunity?.apy?.current ?? -1);
    }
    if (state.sort === "protocol") {
      return a.protocol.name.localeCompare(b.protocol.name);
    }
    return (b.opportunity?.tvlUsd ?? -1) - (a.opportunity?.tvlUsd ?? -1);
  });
}

function renderRows() {
  const entries = filteredEntries();
  elements.marketRows.replaceChildren();

  for (const { protocol, opportunity } of entries) {
    const row = elements.rowTemplate.content.firstElementChild.cloneNode(true);
    const source = getSource(opportunity);
    const link = opportunity?.links?.app || opportunity?.links?.official || protocol.links?.app || protocol.links?.website;

    row.querySelector(".protocol-icon").textContent = initials(protocol.name);
    row.querySelector(".protocol-name").textContent = protocol.name;
    row.querySelector(".opportunity-type").textContent = opportunity ? typeText(opportunity.type) : text("unavailable");
    row.querySelector(".product-name").textContent = opportunity?.product || text("noData");
    row.querySelector(".asset-pill").textContent = opportunity?.asset || "—";

    const yieldCell = row.querySelector(".yield-cell");
    const apy = row.querySelector(".apy-value");
    const yieldNote = row.querySelector(".yield-note");
    apy.textContent = formatYield(opportunity);
    const visibleYieldNote = formatYieldNote(opportunity) || verificationNote(opportunity);
    yieldNote.textContent = visibleYieldNote;
    yieldNote.hidden = !visibleYieldNote;
    yieldCell.title = verificationNote(opportunity);
    if (!opportunity || (!Number.isFinite(opportunity?.apy?.current) && !opportunity?.apy?.display)) {
      apy.classList.add("is-muted");
    }

    const tvl = row.querySelector(".tvl-value");
    tvl.textContent = formatMoney(opportunity?.tvlUsd);
    if (!opportunity || !Number.isFinite(opportunity?.tvlUsd)) tvl.classList.add("is-muted");

    const badge = row.querySelector(".source-badge");
    badge.textContent = source.label;
    badge.classList.add(source.className);
    badge.title = source.detail;

    const sourceDetail = row.querySelector(".source-detail");
    sourceDetail.textContent = source.detail;
    sourceDetail.hidden = !source.detail;

    const action = row.querySelector(".open-link");
    const actionLabel = action.querySelector(".open-link-label");
    actionLabel.textContent = text("open");
    action.setAttribute("aria-label", `${text("open")}: ${protocol.name}`);
    if (link) {
      action.href = link;
    } else {
      action.removeAttribute("href");
      action.classList.add("is-disabled");
      action.setAttribute("aria-disabled", "true");
    }

    const labels = [text("protocol"), text("product"), text("asset"), text("yield"), "TVL", text("data")];
    row.querySelectorAll("td").forEach((cell, index) => {
      if (labels[index]) cell.dataset.label = labels[index];
    });

    elements.marketRows.append(row);
  }

  const countLabel = entries.length === 1 ? text("oneResult") : text("result");
  elements.resultCount.textContent = `${entries.length} ${countLabel}`;
  elements.emptyState.hidden = entries.length > 0;
  document.querySelector(".table-shell").hidden = entries.length === 0;
}

function renderProtocolGrid() {
  elements.protocolGrid.replaceChildren();
  const entries = buildEntries();

  for (const protocol of state.protocols) {
    const count = entries.filter((entry) => entry.protocol.id === protocol.id && entry.opportunity).length;
    const card = document.createElement("article");
    card.className = "protocol-card";
    card.innerHTML = `
      <div class="protocol-card-top">
        <span class="protocol-icon" aria-hidden="true">${initials(protocol.name)}</span>
        <span class="protocol-status ${count ? "is-available" : ""}">${count ? `${count} ${text("available")}` : text("unavailable")}</span>
      </div>
      <h3>${protocol.name}</h3>
      <p>${protocol.description?.[state.language] || protocol.description?.en || ""}</p>
    `;
    elements.protocolGrid.append(card);
  }
}

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (translations[state.language][key]) element.textContent = translations[state.language][key];
  });
  elements.searchInput.placeholder = text("searchPlaceholder");
  elements.languageButton.textContent = state.language === "en" ? "RU" : "EN";
  renderRows();
  renderProtocolGrid();
  updateSummary();
}

function updateSummary() {
  elements.protocolCount.textContent = state.protocols.length;
  elements.opportunityCount.textContent = buildEntries().filter((entry) => entry.opportunity).length;
  const date = state.dataset?.publishedAt || state.dataset?.updatedAt || state.dataset?.normalizedAt || state.dataset?.snapshot?.importedAt;
  elements.lastUpdated.textContent = formatDate(date, true);
}

async function loadData() {
  try {
    const [protocolResponse, opportunityResponse] = await Promise.all([
      fetch("./data/protocols.json", { cache: "no-store" }),
      fetch("./data/published/opportunities.json", { cache: "no-store" }),
    ]);

    if (!protocolResponse.ok || !opportunityResponse.ok) {
      throw new Error("Data files are unavailable");
    }

    const protocolData = await protocolResponse.json();
    const opportunityData = await opportunityResponse.json();
    state.protocols = (protocolData.protocols ?? []).filter(
      (protocol) => protocol.includedInV1 === true || protocol.tier === "core",
    );
    state.opportunities = (opportunityData.opportunities ?? []).filter((opportunity) => opportunity.status?.active !== false);
    state.dataset = opportunityData;

    updateSummary();
    renderRows();
    renderProtocolGrid();
  } catch (error) {
    console.error(error);
    elements.marketRows.innerHTML = `<tr class="loading-row"><td colspan="7">${text("unavailable")}</td></tr>`;
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
