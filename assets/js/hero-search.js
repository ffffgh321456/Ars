/* Онлайн-поиск по открытой базе «Дорога памяти» (1418museum.ru).
   Браузер обращается не напрямую к музею, а к локальному серверу
   tools/serve.ps1: /api/heroes?q=... и /api/hero?id=...
   Карточки показываются текстом сразу, подробности подгружаются следом. */

(function () {
  "use strict";

  var personal = window.PersonalArchive;
  var form = document.getElementById("archive-form");
  var resultsEl = document.getElementById("lookup-results");
  if (!form || !resultsEl) return;

  var fields = {
    lastName: document.getElementById("q-last"),
    firstName: document.getElementById("q-first"),
    middleName: document.getElementById("q-middle"),
    birthDate: document.getElementById("q-birth")
  };
  var statusEl = document.getElementById("lookup-status");
  var errorEl = document.getElementById("lookup-error");
  var emptyEl = document.getElementById("lookup-empty");
  var personalEl = document.getElementById("lookup-personal");
  var personalListEl = document.getElementById("lookup-personal-list");
  var footEl = document.getElementById("lookup-foot");
  var allLink = document.getElementById("lookup-all");
  var lookupSection = document.getElementById("lookup");

  var lastQuery = "";
  var requestVersion = 0;
  var recordsById = {};
  var detailsById = {};

  /* Небольшой кэш на время вкладки: повторный поиск и уже открытые
     подробности не дёргают музей заново. Это снижает риск 503. */
  var SESSION_TTL = 10 * 60 * 1000;

  function sessionRead(key) {
    try {
      var raw = window.sessionStorage.getItem("pamyat-roda:lookup:" + key);
      if (!raw) return null;
      var item = JSON.parse(raw);
      if (!item || Date.now() - item.time > SESSION_TTL) {
        window.sessionStorage.removeItem("pamyat-roda:lookup:" + key);
        return null;
      }
      return item.value;
    } catch (error) {
      return null;
    }
  }

  function sessionWrite(key, value) {
    try {
      window.sessionStorage.setItem(
        "pamyat-roda:lookup:" + key,
        JSON.stringify({ time: Date.now(), value: value })
      );
    } catch (error) {
      /* Переполнение кэша не должно ломать поиск. */
    }
  }

  /* Резервный путь: если серверные функции недоступны или открытая база
     ограничила их адрес, HTML забирается через публичный CORS-посредник,
     а разбор делает тот же heroes-core.js, что и на сервере. Благодаря
     этому поиск работает и на статическом хостинге без функций. */
  var core = window.PamyatHeroesCore || null;
  var proxyIndex = null;

  var PROXIES = [
    function (url) {
      return "https://api.allorigins.win/raw?url=" + encodeURIComponent(url);
    },
    function (url) {
      return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(url);
    }
  ];

  function proxyFetchHtml(url) {
    var order =
      proxyIndex == null
        ? PROXIES.map(function (_, index) { return index; })
        : [proxyIndex];
    var attempt = 0;

    function next() {
      if (attempt >= order.length) {
        return Promise.reject(new Error("Посредник недоступен."));
      }
      var index = order[attempt];
      attempt += 1;

      return fetch(PROXIES[index](url), { cache: "no-store" })
        .then(function (response) {
          if (!response.ok) throw new Error("Посредник ответил " + response.status);
          return response.text();
        })
        .then(function (html) {
          if (!html || html.length < 500) throw new Error("Пустой ответ посредника.");
          proxyIndex = index;
          return html;
        })
        .catch(next);
    }

    return next();
  }

  function canUseFallback() {
    return !!(core && typeof core.searchHeroes === "function");
  }

  function fallbackSearch(query) {
    core.setHtmlTransport(proxyFetchHtml);
    return core.searchHeroes(query);
  }

  function fallbackDetail(id) {
    core.setHtmlTransport(proxyFetchHtml);
    return core.heroDetail(id);
  }

  function clean(value) {
    return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function plural(number, one, few, many) {
    var n10 = number % 10;
    var n100 = number % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  function currentQuery() {
    return [
      fields.lastName ? fields.lastName.value : "",
      fields.firstName ? fields.firstName.value : "",
      fields.middleName ? fields.middleName.value : "",
      fields.birthDate ? fields.birthDate.value : ""
    ]
      .map(clean)
      .filter(Boolean)
      .join(" ");
  }

  function yearOf(value) {
    var match = String(value || "").match(/\d{4}/);
    return match ? match[0] : "";
  }

  function factValue(facts, label) {
    var list = facts || [];
    for (var i = 0; i < list.length; i += 1) {
      if (list[i] && list[i].label === label && list[i].value) return clean(list[i].value);
    }
    return "";
  }

  function showStatus(message, loading) {
    if (!statusEl) return;
    statusEl.innerHTML =
      (loading ? '<span class="lookup__spinner" aria-hidden="true"></span>' : "") +
      "<p>" + escapeHtml(message) + "</p>";
    statusEl.hidden = false;
  }

  function clearBlocks() {
    resultsEl.innerHTML = "";
    if (errorEl) {
      errorEl.innerHTML = "";
      errorEl.hidden = true;
    }
    if (emptyEl) emptyEl.hidden = true;
    if (footEl) footEl.hidden = true;
    if (personalEl) {
      personalEl.hidden = true;
      if (personalListEl) personalListEl.innerHTML = "";
    }
    recordsById = {};
    detailsById = {};
  }

  function showError(message, detail) {
    if (!statusEl || !errorEl) return;
    statusEl.hidden = true;

    var html =
      '<p class="lookup__error-title">Не удалось получить сведения</p>' +
      "<p>" + escapeHtml(message) + "</p>";

    var host = String(window.location.hostname || "");
    var isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      host === "";
    var rateLimited = /ограничила|10 минут|429|503/i.test(message);

    if (rateLimited) {
      html +=
        "<p>Это ограничение открытой базы музея, а не сайта. Подождите указанное время — " +
        "после этого поиск заработает снова. Ссылки на архивы ниже доступны всегда.</p>";
    } else if (window.location.protocol === "file:") {
      html +=
        "<p>Онлайн-поиск работает через локальный сервер. Откройте терминал в папке проекта и выполните:</p>" +
        "<code>powershell -NoProfile -ExecutionPolicy Bypass -File tools\\serve.ps1 -Port 8765</code>" +
        '<p>Затем откройте <a href="http://localhost:8765/search.html">http://localhost:8765/search.html</a>.</p>';
    } else if (isLocal) {
      html +=
        "<p>Проверьте, что мини-сервер запущен и есть подключение к интернету. " +
        "Запуск: <code>powershell -NoProfile -ExecutionPolicy Bypass -File tools\\serve.ps1 -Port 8765</code></p>";
    } else {
      html +=
        "<p>Серверная часть сайта временно не ответила. Обновите страницу и повторите поиск " +
        "через минуту — база «Дорога памяти» иногда отвечает медленно.</p>" +
        "<p>Если поиск не заработал, откройте запись вручную в архивах ниже: " +
        "они открываются в новой вкладке и доступны всегда.</p>";
    }

    if (detail) {
      html += '<p class="lookup__error-detail">Техническая информация: ' + escapeHtml(detail) + "</p>";
    }

    html +=
      '<p class="lookup__error-actions">' +
      '<button class="btn btn--dark btn--small" type="button" data-retry-lookup>Повторить</button>' +
      '<a class="btn btn--outline btn--small" href="#results-links">Искать в архивах вручную</a>' +
      "</p>";

    errorEl.innerHTML = html;
    errorEl.hidden = false;
  }

  function renderPersonalMatches(query) {
    if (!personal || !personalEl || !personalListEl) return;

    var needle = clean(query).toLowerCase();
    if (!needle) {
      personalEl.hidden = true;
      personalListEl.innerHTML = "";
      return;
    }

    var matches = personal.load().filter(function (record) {
      var fio = [record.lastName, record.firstName, record.patronymic]
        .map(clean)
        .join(" ")
        .toLowerCase();
      return fio.indexOf(needle) !== -1;
    });

    if (!matches.length) {
      personalEl.hidden = true;
      personalListEl.innerHTML = "";
      return;
    }

    personalListEl.innerHTML = matches
      .slice(0, 6)
      .map(function (record) {
        var name = [record.lastName, record.firstName, record.patronymic].filter(Boolean).join(" ");
        var meta = [
          record.birth ? record.birth + " г. р." : "",
          record.rank,
          record.categoryLabel
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          '<a class="lookup-person" href="#my-archive">' +
          '<span class="lookup-person__name">' + escapeHtml(name) + "</span>" +
          (meta ? '<span class="lookup-person__meta">' + escapeHtml(meta) + "</span>" : "") +
          '<span class="lookup-person__link">Открыть в моём архиве ↓</span>' +
          "</a>"
        );
      })
      .join("");

    personalEl.hidden = false;
  }

  function fetchJson(url) {
    return fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store"
    }).then(function (response) {
      return response.text().then(function (text) {
        var data = null;
        try {
          data = text ? JSON.parse(text) : null;
        } catch (error) {
          throw new Error("Сервер вернул ответ в неизвестном формате.");
        }
        if (!response.ok) {
          throw new Error((data && data.error) || "Ошибка сервера: " + response.status);
        }
        if (data && data.ok === false) {
          throw new Error(data.error || "Поиск не удался.");
        }
        return data || {};
      });
    });
  }

  function factsHtml(detail) {
    var facts = (detail && detail.facts) || [];
    var order = ["Воинское звание", "Награды", "Место рождения", "Дата призыва", "Место службы"];
    var map = {};
    var used = {};

    facts.forEach(function (fact) {
      if (fact && fact.label && fact.value) map[fact.label] = clean(fact.value);
    });

    var rows = [];
    order.forEach(function (label) {
      if (!map[label]) return;
      used[label] = true;
      rows.push(
        '<div class="hero-card__row">' +
        "<dt>" + escapeHtml(label) + "</dt>" +
        "<dd>" + escapeHtml(map[label]) + "</dd>" +
        "</div>"
      );
    });

    facts.forEach(function (fact) {
      if (!fact || !fact.label || !fact.value || used[fact.label]) return;
      used[fact.label] = true;
      rows.push(
        '<div class="hero-card__row">' +
        "<dt>" + escapeHtml(fact.label) + "</dt>" +
        "<dd>" + escapeHtml(clean(fact.value)) + "</dd>" +
        "</div>"
      );
    });

    var html = rows.length ? '<dl class="hero-card__list">' + rows.join("") + "</dl>" : "";
    if (detail && detail.bio) {
      html += '<p class="hero-card__bio">' + escapeHtml(clean(detail.bio)) + "</p>";
    }
    if (!html) {
      html = '<p class="hero-card__loading">Подробные сведения — в источнике.</p>';
    }
    return html;
  }

  function applyDetail(id, detail) {
    var card = resultsEl.querySelector('[data-hero-id="' + id + '"]');
    if (!card || !detail) return;
    detailsById[id] = detail;

    var nameEl = card.querySelector(".hero-card__name");
    if (detail.name && nameEl) {
      var currentName = clean(nameEl.textContent);
      var nextName = clean(detail.name);
      if (!currentName || nextName.split(" ").length >= currentName.split(" ").length) {
        nameEl.textContent = detail.name;
      }
    }

    var metaParts = [];
    var life = [detail.birth, detail.death].filter(Boolean).join(" — ");
    if (life) metaParts.push(life);
    var rank = factValue(detail.facts, "Воинское звание");
    if (rank) metaParts.push(rank);

    var metaEl = card.querySelector(".hero-card__meta");
    if (metaParts.length) {
      if (!metaEl) {
        metaEl = document.createElement("p");
        metaEl.className = "hero-card__meta";
        var nameNode = card.querySelector(".hero-card__name");
        if (nameNode && nameNode.parentNode) nameNode.parentNode.insertBefore(metaEl, nameNode.nextSibling);
      }
      metaEl.textContent = metaParts.join(" · ");
    } else if (metaEl) {
      metaEl.parentNode.removeChild(metaEl);
    }

    var factsEl = card.querySelector("[data-facts]");
    if (factsEl) factsEl.innerHTML = factsHtml(detail);

    var photo = detail.photo ? clean(detail.photo) : "";
    var img = card.querySelector(".hero-card__media img");
    if (photo && img) img.src = photo;
  }

  function markDetailUnavailable(id) {
    var card = resultsEl.querySelector('[data-hero-id="' + id + '"]');
    if (!card) return;
    var factsEl = card.querySelector("[data-facts]");
    if (factsEl) {
      factsEl.innerHTML =
        '<p class="hero-card__loading">Не удалось загрузить подробности. Откройте запись в источнике.</p>' +
        '<button class="btn btn--outline btn--small" type="button" data-load-detail="' + escapeHtml(id) + '">Повторить</button>';
    }
  }

  var AUTO_DETAILS = 4;

  function loadOneDetail(id) {
    if (detailsById[id]) {
      applyDetail(id, detailsById[id]);
      return Promise.resolve();
    }

    var cached = sessionRead("hero:" + id);
    if (cached) {
      detailsById[id] = cached;
      applyDetail(id, cached);
      return Promise.resolve();
    }

    var card = resultsEl.querySelector('[data-hero-id="' + id + '"]');
    var button = card ? card.querySelector("[data-load-detail]") : null;
    if (button) {
      button.disabled = true;
      button.textContent = "Загружаем…";
    }

    function accept(detail) {
      if (!detail) throw new Error("Пустой ответ.");
      detailsById[id] = detail;
      sessionWrite("hero:" + id, detail);
      applyDetail(id, detail);
    }

    return fetchJson("/api/hero?id=" + encodeURIComponent(id))
      .then(accept)
      .catch(function () {
        if (!canUseFallback()) {
          markDetailUnavailable(id);
          return;
        }
        return fallbackDetail(id)
          .then(accept)
          .catch(function () {
            markDetailUnavailable(id);
          });
      });
  }

  /* Автоматически уточняем только первые записи: так выдача появляется
     быстро, а источник не получает два десятка запросов подряд.
     Для остальных карточек подробности открываются по кнопке. */
  function loadDetails(records, version) {
    var queue = records.slice(0, AUTO_DETAILS);
    var cursor = 0;

    function next() {
      if (version !== requestVersion) return Promise.resolve();

      while (cursor < queue.length) {
        var record = queue[cursor];
        cursor += 1;

        if (detailsById[record.id]) {
          applyDetail(record.id, detailsById[record.id]);
          continue;
        }

        return loadOneDetail(record.id).then(next);
      }

      return Promise.resolve();
    }

    /* Одновременно только один запрос: источник не любит всплески. */
    return next();
  }

  function recordCard(record, index) {
    var id = clean(record.id);
    var name = clean(record.name) ||
      [record.lastName, record.firstName, record.middleName].map(clean).filter(Boolean).join(" ");
    var photo = clean(record.photo);
    var hasPhoto = photo && photo.indexOf("no-photo") === -1;
    var autoDetail = index < AUTO_DETAILS;

    var metaParts = [];
    var life = [record.birth, record.death].map(clean).filter(Boolean).join(" — ");
    if (life) metaParts.push(life);
    if (clean(record.rank)) metaParts.push(clean(record.rank));

    return (
      '<article class="hero-card' + (hasPhoto ? "" : " hero-card--no-photo") + '" data-hero-id="' + escapeHtml(id) + '">' +
      (hasPhoto
        ? '<figure class="hero-card__media"><img src="' + escapeHtml(photo) + '" alt="' + escapeHtml(name) + '" loading="lazy"></figure>'
        : "") +
      '<div class="hero-card__body">' +
      '<p class="hero-card__kicker">Дорога памяти · запись №' + escapeHtml(id) + "</p>" +
      '<h3 class="hero-card__name">' + escapeHtml(name) + "</h3>" +
      (metaParts.length
        ? '<p class="hero-card__meta">' + escapeHtml(metaParts.join(" · ")) + "</p>"
        : "") +
      '<div class="hero-card__facts" data-facts>' +
      (autoDetail
        ? '<p class="hero-card__loading">Уточняем сведения…</p>'
        : '<button class="btn btn--outline btn--small" type="button" data-load-detail="' + escapeHtml(id) + '">Показать подробности</button>') +
      "</div>" +
      '<div class="hero-card__actions">' +
      '<button class="btn btn--primary btn--small" type="button" data-add-person="' + escapeHtml(id) + '">Добавить в мой архив</button>' +
      '<a class="btn btn--outline btn--small" href="' + escapeHtml(clean(record.url)) + '" target="_blank" rel="noopener">Открыть запись</a>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function renderRecords(records) {
    recordsById = {};
    records.forEach(function (record) {
      if (record && record.id) recordsById[clean(record.id)] = record;
    });

    resultsEl.innerHTML = records
      .map(function (record, index) {
        return recordCard(record, index);
      })
      .join("");

    Array.prototype.forEach.call(resultsEl.querySelectorAll(".hero-card__media img"), function (img) {
      img.addEventListener("error", function () {
        var card = img.closest(".hero-card");
        var figure = img.closest(".hero-card__media");
        if (figure && figure.parentNode) figure.parentNode.removeChild(figure);
        if (card) card.classList.add("hero-card--no-photo");
      });
    });
  }

  function buildPerson(record, detail) {
    var facts = (detail && detail.facts) || [];
    var birthRaw = (detail && detail.birth) || record.birth || "";
    var deathRaw = (detail && detail.death) || record.death || "";
    var rank = clean(record.rank) || factValue(facts, "Воинское звание");
    var awards = factValue(facts, "Награды");
    var birthplace = factValue(facts, "Место рождения");
    var service = factValue(facts, "Место службы");
    var called = factValue(facts, "Дата призыва");

    var summaryParts = [];
    var life = [clean(birthRaw), clean(deathRaw)].filter(Boolean).join(" — ");
    if (life) summaryParts.push(life);
    if (rank) summaryParts.push(rank);
    if (service) summaryParts.push("Место службы: " + service);
    if (called) summaryParts.push("Призван: " + called);

    var bioParts = [];
    if (detail && detail.bio) bioParts.push(clean(detail.bio));
    if (awards) bioParts.push("Награды: " + awards + ".");
    if (birthplace) bioParts.push("Место рождения: " + birthplace + ".");
    if (service) bioParts.push("Место службы: " + service + ".");

    return {
      lastName: clean(record.lastName),
      firstName: clean(record.firstName),
      patronymic: clean(record.middleName),
      birth: yearOf(birthRaw),
      birthplace: birthplace,
      category: "veteran",
      rank: rank,
      awards: awards,
      summary: summaryParts.join(" · "),
      bio: bioParts.join("\n\n"),
      sources: ["Дорога памяти — запись " + clean(record.id) + ": " + clean(record.url)]
    };
  }

  function presentResults(data, query, version) {
    if (version !== requestVersion) return;

    var records = Array.isArray(data.records) ? data.records : [];
    if (!records.length) {
      showStatus("По запросу «" + query + "» записей не нашлось.", false);
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    var found = Number(data.found) || records.length;
    var word = plural(found, "запись", "записи", "записей");
    showStatus(
      "По запросу «" + query + "» " + (data.foundApprox ? "найдено около " : "найдено ") +
        found + " " + word + ". Показываем первые " + records.length + ".",
      false
    );

    renderRecords(records);

    if (footEl) footEl.hidden = false;
    if (allLink) {
      allLink.href = clean(data.sourceUrl) ||
        "https://1418museum.ru/search/?q=" + encodeURIComponent(query);
    }

    loadDetails(records, version);
  }

  function runSearch(rawQuery, options) {
    var query = clean(rawQuery);
    if (!query) return;

    lastQuery = query;
    requestVersion += 1;
    var version = requestVersion;

    clearBlocks();
    renderPersonalMatches(query);
    showStatus("Ищем «" + query + "» в базе «Дорога памяти»…", true);

    if (options && options.scroll && lookupSection) {
      lookupSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    var cacheKey = "search:" + query.toLowerCase();
    var cachedSearch = sessionRead(cacheKey);
    if (cachedSearch) {
      presentResults(cachedSearch, query, version);
      return;
    }

    fetchJson("/api/heroes?q=" + encodeURIComponent(query))
      .then(function (data) {
        sessionWrite(cacheKey, data);
        presentResults(data, query, version);
      })
      .catch(function (error) {
        if (version !== requestVersion) return;
        var message = error && error.message ? String(error.message) : "";

        if (!canUseFallback()) {
          fail(message);
          return;
        }

        /* Серверная функция не ответила — пробуем резервный путь напрямую. */
        showStatus("Ищем «" + query + "» в открытой базе…", true);

        fallbackSearch(query)
          .then(function (data) {
            if (version !== requestVersion) return;
            sessionWrite(cacheKey, data);
            presentResults(data, query, version);
          })
          .catch(function (fallbackError) {
            if (version !== requestVersion) return;
            fail((fallbackError && fallbackError.message) || message);
          });
      });

    function fail(message) {
      if (/ограничила|Подождите|10 минут/.test(message)) {
        showError(message);
      } else if (/(429|503)/.test(message)) {
        showError(
          "База «Дорога памяти» временно ограничила запросы. " +
            "Подождите около 10 минут и нажмите «Повторить»."
        );
      } else {
        showError("Поиск в «Дороге памяти» сейчас недоступен.", message);
      }
    }
  }

  /* ---------- События ---------- */

  form.addEventListener("submit", function () {
    if (!fields.lastName || !fields.lastName.value.trim()) return;
    runSearch(currentQuery(), { scroll: true });
  });

  if (errorEl) {
    errorEl.addEventListener("click", function (event) {
      var retry = event.target.closest("[data-retry-lookup]");
      if (retry && lastQuery) runSearch(lastQuery, { scroll: false });
    });
  }

  resultsEl.addEventListener("click", function (event) {
    var detailButton = event.target.closest("[data-load-detail]");
    if (detailButton) {
      var detailId = detailButton.getAttribute("data-load-detail");
      if (detailId) loadOneDetail(detailId);
      return;
    }

    var button = event.target.closest("[data-add-person]");
    if (!button) return;

    var id = button.getAttribute("data-add-person");
    var record = recordsById[id];
    if (!record) return;

    var person = buildPerson(record, detailsById[id] || null);
    try {
      document.dispatchEvent(new CustomEvent("pamyat:add-person", { detail: person }));
    } catch (error) {
      return;
    }

    button.textContent = "Данные в форме ↓";
    button.classList.add("is-done");
  });

  document.addEventListener("pamyat:archive-changed", function () {
    if (lastQuery) renderPersonalMatches(lastQuery);
  });

  /* ---------- Старт ---------- */

  if (fields.lastName && fields.lastName.value.trim()) {
    runSearch(currentQuery(), { scroll: false });
  }
})();
