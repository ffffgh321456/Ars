"use strict";

/* Общий код поиска по открытой базе «Дорога памяти» (1418museum.ru).
   Используется серверными функциями Netlify, чтобы опубликованный сайт
   мог искать данные ветеранов без CORS-ограничений браузера. */

const BASE_URL = "https://1418museum.ru";
const CACHE_TTL = 10 * 60 * 1000;
/* Netlify Functions на бесплатном тарифе живут 10 секунд.
   Две попытки по 3,5 секунды укладываются в лимит с запасом. */
const REQUEST_TIMEOUT = 3500;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const searchCache = new Map();
const detailCache = new Map();

/* В браузере этот же разбор работает как резервный путь: HTML забирается
   через публичный CORS-посредник, если серверные функции недоступны.
   Транспорт подменяется вызовом setHtmlTransport(). */
let htmlTransport = null;

function setHtmlTransport(transport) {
  htmlTransport = typeof transport === "function" ? transport : null;
}

const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  laquo: "«",
  raquo: "»",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  copy: "©",
  star: "★",
  middot: "·"
};

function decodeEntities(value) {
  return String(value == null ? "" : value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, function (match, code) {
    if (code.charAt(0) === "#") {
      const isHex = code.charAt(1).toLowerCase() === "x";
      const number = parseInt(code.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(number)) {
        try {
          return String.fromCodePoint(number);
        } catch (error) {
          return match;
        }
      }
      return match;
    }
    const named = NAMED_ENTITIES[code.toLowerCase()];
    return named == null ? match : named;
  });
}

function cleanText(value) {
  if (value == null) return "";
  const text = String(value)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function firstValue(value) {
  const text = cleanText(value);
  if (!text) return "";
  const parts = text
    .split("|")
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
  return parts.length ? parts[0] : text;
}

function valueList(value) {
  const text = cleanText(value);
  if (!text) return [];
  const seen = new Set();
  const list = [];
  text.split("|").forEach(function (part) {
    const item = part.trim();
    if (item && !seen.has(item)) {
      seen.add(item);
      list.push(item);
    }
  });
  return list;
}

function formatHeroDate(value) {
  const text = firstValue(value);
  if (!text) return "";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(text)) return text;
  let match = text.match(/^__\.__\.(\d{4})$/);
  if (match) return match[1] + " г.";
  match = text.match(/^(\d{4})$/);
  if (match) return match[1] + " г.";
  return "";
}

/* В разметке дата часто склеена через «|»: «1920|__.__.1920|05.09.1920 — 1995».
   Для карточки нужен вариант с диапазоном жизни, а не первый попавшийся. */
function pickDateRange(value) {
  const text = cleanText(value);
  if (!text) return "";
  const parts = text
    .split("|")
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    if (/\d\s*[—–-]\s*\d/.test(parts[i])) return parts[i];
  }
  return parts.length ? parts[0] : text;
}

function bestName(value) {
  const text = cleanText(value);
  if (!text) return "";
  const parts = text
    .split("|")
    .map(function (part) { return part.trim(); })
    .filter(Boolean);
  if (!parts.length) return "";
  let best = parts[0];
  parts.forEach(function (part) {
    if (part.split(/\s+/).length > best.split(/\s+/).length) best = part;
  });
  return best;
}

function normalizePhoto(value) {
  let photo = cleanText(value);
  if (!photo) return "";
  if (photo.indexOf("//") === 0) {
    photo = "https:" + photo;
  } else if (photo.charAt(0) === "/") {
    photo = BASE_URL + photo;
  }
  return photo;
}

function getAllMatches(text, regex) {
  const matches = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match);
  }
  return matches;
}

async function fetchOnce(url) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Источник ответил кодом " + response.status);
    }

    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

/* Музей иногда отдаёт 503 на первый запрос. Один короткий повтор
   заметно повышает надёжность и укладывается в лимит функции. */
async function fetchHtml(url) {
  if (htmlTransport) {
    return await htmlTransport(url);
  }

  let lastError = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await fetchOnce(url);
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise(function (resolve) { setTimeout(resolve, 400); });
      }
    }
  }

  throw lastError || new Error("Источник не ответил.");
}

function readCache(cache, key) {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

function readStaleCache(cache, key) {
  const item = cache.get(key);
  return item ? item.value : null;
}

function writeCache(cache, key, value) {
  cache.set(key, { time: Date.now(), value: value });
}

function parseSearch(html, query, url) {
  const chunks = html.split(/<div class="search__bodyItem/i);
  chunks.shift();

  const records = [];

  chunks.forEach(function (chunk) {
    const hrefMatch = chunk.match(/href="(\/heroes\/(\d+)\/\?SEARCH=Y)"/);
    if (!hrefMatch) return;

    const id = hrefMatch[2];
    const names = getAllMatches(chunk, /personHero__nameItemElem">([^<]+)<\/span>/g).map(function (match) {
      return firstValue(match[1]);
    });
    const dates = getAllMatches(chunk, /personHero__dateItem">([^<]+)<\/span>/g).map(function (match) {
      return firstValue(match[1]);
    });
    const rankMatch = chunk.match(/personHero__militaryRankName">([^<]*)<\/span>/);

    let photo = "";
    const photoMatch =
      chunk.match(/<img[^>]+src="([^"]+)"[^>]*class="[^"]*personHero__image[^"]*"/i) ||
      chunk.match(/<img[^>]+class="[^"]*personHero__image[^"]*"[^>]*src="([^"]+)"/i);
    if (photoMatch) photo = normalizePhoto(photoMatch[1]);

    const lastName = names.length > 0 ? names[0] : "";
    const firstName = names.length > 1 ? names[1] : "";
    const middleName = names.length > 2 ? names[2] : "";
    const name = [lastName, firstName, middleName].filter(Boolean).join(" ");
    const birth = dates.length > 0 ? formatHeroDate(dates[0]) : "";
    const death = dates.length > 1 ? formatHeroDate(dates[1]) : "";
    const rank = rankMatch ? cleanText(rankMatch[1]) : "";

    records.push({
      id: id,
      url: BASE_URL + "/heroes/" + id + "/?SEARCH=Y",
      lastName: lastName,
      firstName: firstName,
      middleName: middleName,
      name: name,
      birth: birth,
      death: death,
      rank: rank,
      photo: photo
    });
  });

  let maxPage = 1;
  getAllMatches(html, /\/search\/\?page=(\d+)&(?:amp;)?q=/g).forEach(function (match) {
    const page = Number(match[1]);
    if (page > maxPage) maxPage = page;
  });

  const perPage = records.length > 0 ? records.length : 17;
  const found = maxPage > 1 ? (maxPage - 1) * perPage + records.length : records.length;

  return {
    ok: true,
    source: "Дорога памяти",
    sourceUrl: url,
    query: query,
    found: found,
    foundApprox: maxPage > 1,
    pages: maxPage,
    pageCount: records.length,
    records: records
  };
}

async function searchHeroes(query) {
  const key = String(query || "").toLowerCase();
  const cached = readCache(searchCache, key);
  if (cached) return cached;

  const url = BASE_URL + "/search/?q=" + encodeURIComponent(query);
  let html = "";

  try {
    html = await fetchHtml(url);
  } catch (error) {
    const stale = readStaleCache(searchCache, key);
    if (stale) return stale;
    throw error;
  }

  const data = parseSearch(html, query, url);
  writeCache(searchCache, key, data);
  return data;
}

function parseHero(html, recordId, url) {
  const titleMatch = html.match(/<h1[^>]*class="[^"]*oneHero__title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  const dateMatch = html.match(/<span[^>]*class="[^"]*oneHero__date[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
  const imageTag = html.match(/<img[^>]*oneHero__image[^>]*>/i);

  let photo = "";
  if (imageTag) {
    const srcMatch = imageTag[0].match(/src="([^"]+)"/i);
    if (srcMatch) photo = normalizePhoto(srcMatch[1]);
  }

  const properties = getAllMatches(
    html,
    /<span[^>]*class="[^"]*infoList__property[^"]*"[^>]*>([\s\S]*?)<\/span>\s*<p[^>]*class="[^"]*infoList__value[^"]*"[^>]*>([\s\S]*?)<\/p>/g
  );

  const facts = [];
  let bio = "";

  properties.forEach(function (property) {
    const label = cleanText(property[1]);
    const values = valueList(property[2]);
    if (!label || !values.length) return;

    if (/История|Биография/i.test(label)) {
      bio = values.join(" ");
    } else {
      facts.push({ label: label, value: values.join("; ") });
    }
  });

  const dateText = pickDateRange(dateMatch ? dateMatch[1] : "");
  let birth = "";
  let death = "";

  const separator = dateText.match(/^(.*?)\s*[—–-]\s*(.*)$/);
  if (separator) {
    birth = formatHeroDate(separator[1]);
    death = formatHeroDate(separator[2]);
  } else {
    birth = formatHeroDate(dateText);
  }

  return {
    ok: true,
    id: recordId,
    url: url,
    name: bestName(titleMatch ? titleMatch[1] : ""),
    birth: birth,
    death: death,
    photo: photo,
    facts: facts,
    bio: bio
  };
}

async function heroDetail(id) {
  const recordId = String(id || "");
  if (!/^\d{1,12}$/.test(recordId)) {
    throw new Error("Неверный идентификатор записи.");
  }

  const cached = readCache(detailCache, recordId);
  if (cached) return cached;

  const url = BASE_URL + "/heroes/" + recordId + "/?SEARCH=Y";
  let html = "";

  try {
    html = await fetchHtml(url);
  } catch (error) {
    const stale = readStaleCache(detailCache, recordId);
    if (stale) return stale;
    throw error;
  }

  const data = parseHero(html, recordId, url);
  writeCache(detailCache, recordId, data);
  return data;
}

function jsonResponse(statusCode, body, extraHeaders) {
  return {
    statusCode: statusCode,
    headers: Object.assign(
      {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      },
      extraHeaders || {}
    ),
    body: JSON.stringify(body)
  };
}

const coreApi = {
  BASE_URL: BASE_URL,
  setHtmlTransport: setHtmlTransport,
  parseSearch: parseSearch,
  parseHero: parseHero,
  searchHeroes: searchHeroes,
  heroDetail: heroDetail,
  jsonResponse: jsonResponse
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = coreApi;
}

/* Тот же файл подключается на странице поиска как обычный скрипт:
   это резервный путь, если серверные функции недоступны. */
if (typeof window !== "undefined") {
  window.PamyatHeroesCore = coreApi;
}
