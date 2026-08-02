import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_URL = "https://t.me/s/ton_yields_daily";
const SOURCE_POST_URL = (post) => `https://t.me/ton_yields_daily/${post}`;
const LOW_TVL_USD = 10_000;

const protocolLinks = {
  "Tonstakers": { official: "https://tonstakers.com/", app: "https://app.tonstakers.com/" },
  "Stakee": { official: "https://stakee.org/", app: "https://t.me/StakeeBot/app" },
  "Hipo": { official: "https://hipo.finance/", app: "https://hipo.finance/" },
  "Bemo": { official: "https://bemo.fi/", app: "https://app.bemo.fi/" },
  "KTON": { official: "https://kton.io/", app: "https://app.kton.io/" },
  "Affluent": { official: "https://affluent.org/", app: "https://t.me/AffluentAppBot" },
  "Storm Trade": { official: "https://storm.tg/", app: "https://app.storm.tg/" },
  "EVAA": { official: "https://evaa.finance/", app: "https://t.me/EvaaAppBot" },
  "STON.fi": { official: "https://ston.fi/", app: "https://app.ston.fi/pools" },
  "GTC": { official: "https://giftcredit.app/", app: "https://t.me/GiftToCreditBot/app" },
  "Morpho": { official: "https://morpho.org/", app: "https://t.me/MorphoOrgBot" },
  "Ethena": { official: "https://ethena.fi/", app: "https://app.ethena.fi/earn/ton" },
  "Telegram Wallet": { official: "https://wallet.tg/", app: "https://t.me/wallet" },
  "Euler": { official: "https://www.euler.finance/", app: "https://t.me/EulerFinanceBot" },
  "TONCO": { official: "https://tonco.io/", app: "https://app.tonco.io/#/explore" },
};

const protocolAliases = new Map([
  ["Tonstakers", "Tonstakers"],
  ["Stakee", "Stakee"],
  ["Hipo", "Hipo"],
  ["Bemo", "Bemo"],
  ["KTON", "KTON"],
  ["Affluent", "Affluent"],
  ["Storm Trade", "Storm Trade"],
  ["EVAA", "EVAA"],
  ["Ston.fi", "STON.fi"],
  ["STON.fi", "STON.fi"],
  ["GTC", "GTC"],
  ["Morpho", "Morpho"],
  ["Ethena", "Ethena"],
  ["Telegram Wallet", "Telegram Wallet"],
  ["Euler", "Euler"],
  ["Tonco", "TONCO"],
  ["TONCO", "TONCO"],
]);

const categoryLabels = {
  gram: { ru: "GRAM и связанные активы", en: "GRAM and related assets" },
  stablecoins: { ru: "Стейблкоины", en: "Stablecoins and related assets" },
  "gram-usdt": { ru: "Пулы GRAM–USDT", en: "GRAM–USDT pools" },
  btc: { ru: "BTC и связанные активы", en: "BTC and related assets" },
  eth: { ru: "ETH и связанные активы", en: "ETH and related assets" },
};

function decodeHtml(value) {
  const named = {
    amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  };
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&([a-z]+);/gi, (match, name) => named[name.toLowerCase()] ?? match);
}

function htmlToText(html) {
  return decodeHtml(
    html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractDivInner(block, marker) {
  const markerIndex = block.indexOf(marker);
  if (markerIndex < 0) return null;
  const openStart = block.lastIndexOf("<div", markerIndex);
  const openEnd = block.indexOf(">", markerIndex);
  if (openStart < 0 || openEnd < 0) return null;

  const tokenRegex = /<\/?div\b[^>]*>/gi;
  tokenRegex.lastIndex = openStart;
  let depth = 0;
  let token;
  while ((token = tokenRegex.exec(block))) {
    if (token[0].startsWith("</")) depth -= 1;
    else depth += 1;
    if (depth === 0) return block.slice(openEnd + 1, token.index);
  }
  return null;
}

function latestMessageBlock(html) {
  const matches = [...html.matchAll(/data-post=["']ton_yields_daily\/(\d+)["']/g)];
  if (!matches.length) throw new Error("No TON Yields Daily message blocks found");
  const latest = matches.reduce((best, item) => Number(item[1]) > Number(best[1]) ? item : best);
  const start = latest.index;
  const next = matches.find((item) => item.index > start);
  const end = next?.index ?? html.length;
  const block = html.slice(start, end);
  const messageHtml = extractDivInner(block, "tgme_widget_message_text");
  if (!messageHtml) throw new Error(`Post ${latest[1]} has no message text`);
  const datetime = block.match(/<time[^>]+datetime=["']([^"']+)["']/i)?.[1] ?? null;
  return { post: Number(latest[1]), datetime, text: htmlToText(messageHtml) };
}

function parseCompactMoney(value, unit = "") {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const multiplier = { K: 1_000, M: 1_000_000, B: 1_000_000_000 }[unit.toUpperCase()] ?? 1;
  return number * multiplier;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/₮/g, "t")
    .replace(/[–—→]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function inferType(protocol, product, category) {
  const lower = product.toLowerCase();
  if (["Tonstakers", "Hipo", "Bemo", "KTON"].includes(protocol)) return "liquid-staking";
  if (protocol === "Stakee") return "staking";
  if (protocol === "Ethena") return "yield-token";
  if (["EVAA", "GTC", "Euler"].includes(protocol)) return "lending";
  if (protocol === "Morpho" && !lower.includes("vault")) return "lending";
  if (protocol === "STON.fi" || protocol === "TONCO" || category === "gram-usdt") return "liquidity-pool";
  return "vault";
}

function inferAsset(product) {
  const paren = product.match(/\(([^)]+)\)\s*$/)?.[1];
  if (paren && !/^main|lp$/i.test(paren)) return paren;
  const upper = product.toUpperCase();
  for (const symbol of ["TSUSDE-USDT", "USDE-TSUSDE", "GRAM-TSTON", "USDT-GRAM", "CBBTC", "WETH", "TSUSDE", "USDT", "USD₮", "GRAM", "TON"]) {
    if (upper.includes(symbol)) return symbol.replace("CBBTC", "cbBTC").replace("TSUSDE", "tsUSDe");
  }
  return product.split(/[ ·]/)[0] || "—";
}

function parseOpportunityLine(line, protocol, category, publishedAt, post) {
  const clean = line.replace(/^[>\s└├│─]+/, "").replace(/\s+⚠️\s*$/, " ⚠️").trim();
  const tvlMatch = clean.match(/\|\s*\$([\d.]+)\s*([KMB])?\s*(⚠️)?\s*$/i);
  if (!tvlMatch) return null;
  const tvlUsd = parseCompactMoney(tvlMatch[1], tvlMatch[2]);
  const lowTvl = Boolean(tvlMatch[3]) || (Number.isFinite(tvlUsd) && tvlUsd < LOW_TVL_USD);
  let beforeTvl = clean.slice(0, tvlMatch.index).trim();

  let utilizationRate = null;
  const urMatch = beforeTvl.match(/\|\s*UR\s*([\d.]+)%\s*(?:🔥)?\s*$/i);
  if (urMatch) {
    utilizationRate = Number(urMatch[1]);
    beforeTvl = beforeTvl.slice(0, urMatch.index).trim();
  }

  const yieldSeparator = /:\s*(?=\d+(?:\.\d+)?%)/.exec(beforeTvl);
  if (!yieldSeparator) return null;
  const split = yieldSeparator.index;
  const product = beforeTvl.slice(0, split).trim();
  const yieldText = beforeTvl.slice(split + yieldSeparator[0].length).trim();

  let current = null;
  let average7d = null;
  let base = null;
  let rewards = null;
  let note = null;

  const rewardsMatch = yieldText.match(/^([\d.]+)%\s*\(\+([\d.]+)%\)\s*7d:\s*([\d.]+)%/i);
  if (rewardsMatch) {
    base = Number(rewardsMatch[1]);
    rewards = Number(rewardsMatch[2]);
    current = base + rewards;
    average7d = Number(rewardsMatch[3]);
    note = `base ${base}% + rewards ${rewards}%`;
  } else {
    const normal = yieldText.match(/^([\d.]+)%\s*([↑↓])?\s*(?:\(7d:\s*([\d.]+)%\)|\(7d trailing\))?/i);
    if (!normal) return null;
    current = Number(normal[1]);
    average7d = normal[3] !== undefined ? Number(normal[3]) : current;
    if (/7d trailing/i.test(yieldText)) note = "7d trailing";
  }

  const trend = current > average7d + 0.05 ? "up" : current < average7d - 0.05 ? "down" : "flat";
  const canonicalProtocol = protocolAliases.get(protocol) ?? protocol;
  const links = protocolLinks[canonicalProtocol] ?? {};
  const asset = inferAsset(product);
  const id = `${slug(canonicalProtocol)}-${slug(product)}`;
  const trendNote = trend === "up"
    ? { ru: "Текущая ставка выше среднего за 7 дней", en: "Current rate is above the 7-day average" }
    : trend === "down"
      ? { ru: "Текущая ставка ниже среднего за 7 дней", en: "Current rate is below the 7-day average" }
      : { ru: "Близко к среднему за 7 дней", en: "Close to the 7-day average" };
  if (note) trendNote.ru = trendNote.en = note;

  return {
    id,
    protocol: canonicalProtocol,
    category,
    asset,
    product,
    type: inferType(canonicalProtocol, product, category),
    apy: { current, average7d, metric: "apy", trend, base, rewards, observedAt: publishedAt, note: trendNote },
    tvlUsd,
    utilizationRate,
    links,
    source: {
      type: "aggregated-snapshot",
      provider: "TON Yields Daily",
      url: SOURCE_POST_URL(post),
      lastChecked: publishedAt,
      origin: "public daily TON DeFi market snapshot",
    },
    status: { active: true, stale: false, lowTvl, sourceError: false },
  };
}

export function parseTonYieldsDailyHtml(html) {
  const message = latestMessageBlock(html);
  const lines = message.text.split("\n").map((line) => line.trim()).filter(Boolean);
  const publishedAt = message.datetime || new Date().toISOString();

  const marketLine = lines.find((line) => line.includes("TON DeFi TVL")) ?? "";
  const marketMatch = marketLine.match(/TVL:\s*\$([\d.]+)([KMB])?\s*([+-]\$[\d.]+[KMB])?\s*\(([+-]?[\d.]+)%\)/i);
  const countLine = lines.find((line) => /\d+ opportunities/.test(line)) ?? "";
  const countMatch = countLine.match(/(\d+) opportunities\s*·\s*(\d+) categories/i);

  let category = null;
  let protocol = null;
  const opportunities = [];
  const seen = new Map();

  for (const line of lines) {
    if (/GRAM AND RELATED ASSETS/i.test(line)) { category = "gram"; protocol = null; continue; }
    if (/STABLECOINS AND RELATED ASSETS/i.test(line)) { category = "stablecoins"; protocol = null; continue; }
    if (/YIELDS FOR GRAM-USDT POOLS/i.test(line)) { category = "gram-usdt"; protocol = null; continue; }
    if (/BTC AND RELATED ASSETS/i.test(line)) { category = "btc"; protocol = null; continue; }
    if (/ETH AND RELATED ASSETS/i.test(line)) { category = "eth"; protocol = null; continue; }
    if (/APY \(7d avg\)/i.test(line)) break;
    if (!category) continue;

    const normalizedLine = line.replace(/^[>\s]+/, "").trim();
    if (protocolAliases.has(normalizedLine)) {
      protocol = normalizedLine;
      continue;
    }
    if (!protocol || !normalizedLine.includes(":")) continue;
    const opportunity = parseOpportunityLine(normalizedLine, protocol, category, publishedAt, message.post);
    if (!opportunity) continue;
    const duplicateCount = (seen.get(opportunity.id) ?? 0) + 1;
    seen.set(opportunity.id, duplicateCount);
    if (duplicateCount > 1) opportunity.id = `${opportunity.id}-${duplicateCount}`;
    opportunities.push(opportunity);
  }

  if (opportunities.length < 20 || opportunities.length > 40) {
    throw new Error(`Unexpected opportunity count: ${opportunities.length}`);
  }

  const protocols = [];
  for (const name of [...new Set(opportunities.map((item) => item.protocol))]) {
    const own = opportunities.filter((item) => item.protocol === name);
    protocols.push({
      id: slug(name),
      name,
      links: protocolLinks[name] ?? {},
      active: true,
      opportunitiesCount: own.length,
      trackedTvlUsd: own.reduce((sum, item) => sum + (item.tvlUsd ?? 0), 0),
    });
  }

  return {
    schemaVersion: "2.0",
    updatedAt: publishedAt,
    snapshot: {
      source: "TON Yields Daily",
      sourceUrl: SOURCE_POST_URL(message.post),
      post: message.post,
      publishedAt,
      marketTvlUsd: marketMatch ? parseCompactMoney(marketMatch[1], marketMatch[2]) : null,
      marketTvlChange24hPercent: marketMatch ? Number(marketMatch[4]) : null,
      declaredOpportunityCount: countMatch ? Number(countMatch[1]) : opportunities.length,
      categoryCount: countMatch ? Number(countMatch[2]) : new Set(opportunities.map((item) => item.category)).size,
      note: {
        ru: "Дневной снимок рынка. Значения меняются и не являются гарантированной доходностью.",
        en: "Daily market snapshot. Values change and are not guaranteed returns.",
      },
    },
    settings: {
      lowTvlThresholdUsd: LOW_TVL_USD,
      defaultSort: "tvl",
      categoryOrder: ["gram", "stablecoins", "gram-usdt", "btc", "eth"],
    },
    categories: Object.entries(categoryLabels).map(([id, label]) => ({ id, label })),
    protocols,
    opportunities,
  };
}

async function fetchText(url, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20_000);
      const response = await fetch(url, {
        headers: { "user-agent": "TON-DeFi-Believers/2.0 (+https://github.com/Freebielife/ton-defi-believers)" },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw lastError;
}

async function main() {
  const root = process.cwd();
  const output = path.join(root, "data", "market-catalog.json");
  const url = process.env.TON_YIELDS_DAILY_URL || DEFAULT_URL;
  try {
    const html = await fetchText(url);
    const document = parseTonYieldsDailyHtml(html);
    await fs.writeFile(output, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    console.log(`TON Yields Daily: imported ${document.opportunities.length} opportunities from post ${document.snapshot.post}.`);
  } catch (error) {
    try {
      await fs.access(output);
      console.warn(`TON Yields Daily import failed; preserving the last successful snapshot: ${error.message}`);
    } catch {
      throw error;
    }
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) await main();
