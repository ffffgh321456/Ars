(function () {
  "use strict";

  var data = window.FAMILY_ARCHIVE;
  if (!data) return;

  var personalRecords = window.PersonalArchive ? window.PersonalArchive.load() : [];
  var people = personalRecords;
  var STORAGE_KEY = "pamyat-roda:report:v1";
  var state = { query: "", filter: "all", onlyAwards: false };
  var selected = loadSelected();
  var activeId = null;

  var resultsEl = document.getElementById("results");
  var emptyEl = document.getElementById("empty");
  var countEl = document.getElementById("result-count");
  var heroQ = document.getElementById("hero-q");
  var resultsQ = document.getElementById("results-q");
  var onlyAwardsEl = document.getElementById("only-awards");
  var dialog = document.getElementById("hero-dialog");
  var dialogBody = document.getElementById("dialog-body");
  var dialogKicker = document.getElementById("dialog-kicker");
  var dialogAdd = document.getElementById("dialog-add");
  var dialogExternal = document.getElementById("dialog-external");
  var reportBar = document.getElementById("report-bar");
  var reportCount = document.getElementById("report-count");
  var reportLabel = document.getElementById("report-label");
  var emptyArchive = document.getElementById("empty-archive");

  var index = new Map();
  people.forEach(function (person) {
    index.set(
      person.id,
      normalize(
        [
          person.lastName,
          person.firstName,
          person.patronymic,
          person.categoryLabel,
          person.rank,
          person.position,
          person.birth,
          person.birthplace,
          person.summary,
          person.note
        ]
          .concat(person.fronts, person.units, person.awards, person.places, person.bio, person.sources)
          .concat(person.path.map(function (step) { return step.title + " " + step.text; }))
          .join(" ")
      )
    );
  });

  /* ---------- Утилиты ---------- */

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function getTokens() {
    return normalize(state.query).split(" ").filter(Boolean);
  }

  function highlight(value, tokens) {
    var safe = escapeHtml(value);
    if (!tokens.length) return safe;
    try {
      var pattern = tokens.map(escapeRegExp).join("|");
      return safe.replace(new RegExp("(" + pattern + ")", "gi"), "<mark>$1</mark>");
    } catch (error) {
      return safe;
    }
  }

  function plural(number, one, few, many) {
    var n10 = number % 10;
    var n100 = number % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }

  function recordWord(number) {
    return plural(number, "запись", "записи", "записей");
  }

  function loadSelected() {
    try {
      var raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      var valid = raw.filter(function (id) {
        return people.some(function (person) { return person.id === id; });
      });
      return new Set(valid);
    } catch (error) {
      return new Set();
    }
  }

  function saveSelected() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selected)));
    } catch (error) {
      /* localStorage может быть недоступен */
    }
  }

  function getPerson(id) {
    return people.find(function (person) { return person.id === id; });
  }

  function archiveUrl(lastName) {
    var query = String(lastName || "").trim().split(/\s+/)[0] || "";
    return query
      ? "https://pamyat-naroda.ru/heroes/?last_name=" + encodeURIComponent(query)
      : "https://pamyat-naroda.ru/";
  }

  function fullName(person) {
    return [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(" ");
  }

  function metaLine(person) {
    var parts = [];
    if (person.birth) parts.push(person.birth + " г. р.");
    if (person.rank) parts.push(person.rank);
    if (person.position && person.position !== person.rank && person.position !== person.categoryLabel) {
      parts.push(person.position);
    }
    return parts.join(" · ");
  }

  /* ---------- Статистика, хроника, источники ---------- */

  function renderStats() {
    var fronts = new Set();
    var awards = new Set();
    people.forEach(function (person) {
      person.fronts.forEach(function (front) { fronts.add(front); });
      person.awards.forEach(function (award) { awards.add(award); });
    });
    var statPeople = document.getElementById("stat-people");
    var statFronts = document.getElementById("stat-fronts");
    var statAwards = document.getElementById("stat-awards");
    if (statPeople) statPeople.textContent = people.length;
    if (statFronts) statFronts.textContent = fronts.size;
    if (statAwards) statAwards.textContent = awards.size;
  }

  function renderChronicle() {
    var list = document.getElementById("chronicle-list");
    if (!list) return;
    list.innerHTML = data.timeline
      .map(function (item) {
        return (
          '<li class="reveal">' +
          '<span class="chronicle__year">' + escapeHtml(item.year) + "</span>" +
          '<p class="chronicle__text">' + escapeHtml(item.text) + "</p>" +
          "</li>"
        );
      })
      .join("");
  }

  function renderSources() {
    var grid = document.getElementById("sources-grid");
    if (!grid) return;
    grid.innerHTML = data.sources
      .map(function (source, i) {
        return (
          '<a class="source reveal" href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener">' +
          '<span class="source__num">0' + (i + 1) + "</span>" +
          "<div><h3>" + escapeHtml(source.name) + "</h3><p>" + escapeHtml(source.note) + "</p></div>" +
          '<svg class="source__arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
          '<path d="M7 17L17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          "</svg></a>"
        );
      })
      .join("");
  }

  function renderSuggestions() {
    var datalist = document.getElementById("search-suggestions");
    if (!datalist) return;
    var values = new Set();
    people.forEach(function (person) {
      values.add(fullName(person));
      person.places.forEach(function (place) { values.add(place); });
      person.awards.forEach(function (award) { values.add(award); });
    });
    datalist.innerHTML = Array.from(values)
      .map(function (value) { return '<option value="' + escapeHtml(value) + '"></option>'; })
      .join("");
  }

  /* ---------- Поиск и карточки ---------- */

  function matches(person) {
    if (state.filter === "veteran" && person.category !== "veteran") return false;
    if (state.filter === "homefront" && person.category !== "homefront") return false;
    if (state.onlyAwards && person.awards.length === 0) return false;

    var tokens = getTokens();
    if (!tokens.length) return true;
    var haystack = index.get(person.id) || "";
    return tokens.every(function (token) { return haystack.indexOf(token) !== -1; });
  }

  function cardHtml(person, tokens) {
    var nameTokens = tokens.filter(function (token) {
      return normalize(person.lastName).indexOf(token) !== -1 ||
        normalize(person.firstName).indexOf(token) !== -1 ||
        normalize(person.patronymic).indexOf(token) !== -1;
    });

    var tags = person.fronts.concat(person.places).slice(0, 4);
    var tagsHtml = tags.length
      ? '<ul class="tags">' + tags.map(function (tag) { return "<li>" + escapeHtml(tag) + "</li>"; }).join("") + "</ul>"
      : "";

    var awardsHtml = person.awards.length
      ? '<div class="card__awards">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
          '<path d="M12 2.5l2.7 7h7.5l-6.1 4.9 2.3 7.5-6.4-4.6-6.4 4.6 2.3-7.5L2 9.5h7.5z" fill="currentColor"/></svg>' +
          "<p><strong>" + person.awards.length + " " + plural(person.awards.length, "награда", "награды", "наград") + "</strong> · " +
          person.awards.map(function (award) { return escapeHtml(award); }).join(" · ") + "</p></div>"
      : "";

    var noteHtml = person.note ? '<p class="card__note">' + escapeHtml(person.note) + "</p>" : "";
    var stages = person.path.length;
    var status = person.personal
      ? "Личный архив"
      : stages
        ? stages + " " + plural(stages, "этап", "этапа", "этапов") + " боевого пути"
        : "Сведения уточняются";

    return (
      '<article class="card" data-id="' + escapeHtml(person.id) + '">' +
      '<div class="card__head">' +
      '<div class="card__monogram" aria-hidden="true">' + escapeHtml(person.lastName.charAt(0)) + "</div>" +
      '<div class="card__ident">' +
      '<p class="card__kicker">' +
      escapeHtml(person.categoryLabel) + "</p>" +
      '<h3 class="card__name"><button class="card__open" type="button" data-open="' + escapeHtml(person.id) + '">' +
      highlight(person.lastName, nameTokens) + " <span>" + highlight([person.firstName, person.patronymic].filter(Boolean).join(" "), nameTokens) + "</span>" +
      "</button></h3>" +
      '<p class="card__meta">' + escapeHtml(metaLine(person)) + "</p>" +
      "</div>" +
      '<label class="pick">' +
      '<input type="checkbox" data-pick="' + escapeHtml(person.id) + '"' + (selected.has(person.id) ? " checked" : "") + ">" +
      '<span class="pick__box" aria-hidden="true"></span>' +
      '<span class="pick__text">В отчёт</span>' +
      "</label>" +
      "</div>" +
      '<p class="card__summary">' + highlight(person.summary, tokens) + "</p>" +
      tagsHtml +
      awardsHtml +
      noteHtml +
      '<div class="card__foot">' +
      '<span class="card__status">' + escapeHtml(status) + "</span>" +
      '<button class="card__link" type="button" data-open="' + escapeHtml(person.id) + '">' +
      "Боевой путь" +
      '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>" +
      "</div>" +
      "</article>"
    );
  }

  function render() {
    var tokens = getTokens();
    var filtered = people.filter(matches);

    resultsEl.innerHTML = filtered
      .map(function (person) { return cardHtml(person, tokens); })
      .join("");

    emptyEl.hidden = filtered.length !== 0;

    if (state.query.trim()) {
      countEl.innerHTML = "По запросу «" + escapeHtml(state.query.trim()) + "» — <strong>" +
        filtered.length + "</strong> " + recordWord(filtered.length);
    } else if (state.filter !== "all" || state.onlyAwards) {
      countEl.innerHTML = "Найдено <strong>" + filtered.length + "</strong> " + recordWord(filtered.length);
    } else {
      countEl.innerHTML = "В личном архиве <strong>" + people.length + "</strong> " + recordWord(people.length);
    }

    updateArchiveLinks();
    updateReportBar();
    updateDialogButton();
    syncCheckboxes();
  }

  function syncCheckboxes() {
    Array.prototype.forEach.call(resultsEl.querySelectorAll("[data-pick]"), function (box) {
      box.checked = selected.has(box.getAttribute("data-pick"));
    });
  }

  function updateArchiveLinks() {
    var first = state.query.trim().split(/\s+/)[0] || "";
    var url = first
      ? "search.html?last=" + encodeURIComponent(first) + "&auto=1"
      : "search.html";
    if (emptyArchive) emptyArchive.href = url;
    Array.prototype.forEach.call(document.querySelectorAll("[data-archive-cta]"), function (link) {
      link.href = url;
    });
  }

  function applyQuery(value, options) {
    state.query = value;
    if (heroQ) heroQ.value = value;
    if (resultsQ) resultsQ.value = value;
    if (options && options.resetFilter) setFilter("all", true);
    render();
  }

  function setFilter(name, skipRender) {
    state.filter = name;
    var chips = document.querySelectorAll("#filters .chip");
    Array.prototype.forEach.call(chips, function (chip) {
      var active = chip.getAttribute("data-filter") === name;
      chip.classList.toggle("is-active", active);
      chip.setAttribute("aria-pressed", String(active));
    });
    if (!skipRender) render();
  }

  function scrollToResults() {
    var target = document.getElementById("search");
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---------- Диалог ---------- */

  function dialogHtml(person) {
    var tokens = getTokens();
    var facts = [];

    if (person.birth) facts.push(["Год рождения", person.birth]);
    if (person.birthplace) facts.push(["Место рождения", person.birthplace]);
    if (person.rank || person.position) {
      facts.push(["Звание и должность", [person.rank, person.position].filter(Boolean).join(" · ")]);
    }
    if (person.fronts.length) facts.push(["Фронты", person.fronts.join(", ")]);
    if (person.units.length) facts.push(["Части и соединения", person.units.join(", ")]);
    if (person.places.length) facts.push(["Места сражений", person.places.join(", ")]);

    var factsHtml = facts.length
      ? '<dl class="dialog__facts">' + facts.map(function (fact) {
          return '<div class="dialog__fact"><dt>' + escapeHtml(fact[0]) + "</dt><dd>" + escapeHtml(fact[1]) + "</dd></div>";
        }).join("") + "</dl>"
      : "";

    var tags = person.fronts.concat(person.places);
    var tagsHtml = tags.length
      ? '<ul class="tags">' + tags.map(function (tag) { return "<li>" + escapeHtml(tag) + "</li>"; }).join("") + "</ul>"
      : "";

    var bioHtml = person.bio.length
      ? person.bio.map(function (paragraph) { return "<p>" + escapeHtml(paragraph) + "</p>"; }).join("")
      : '<p>Сведения уточняются.</p>';

    var pathHtml = person.path.length
      ? '<section class="dialog__section"><h3>Боевой путь</h3><ol class="timeline">' +
        person.path.map(function (step) {
          return "<li><span class=\"timeline__date\">" + escapeHtml(step.date) + "</span>" +
            "<h4>" + escapeHtml(step.title) + "</h4>" +
            "<p>" + escapeHtml(step.text) + "</p></li>";
        }).join("") + "</ol></section>"
      : "";

    var awardsHtml = person.awards.length
      ? '<section class="dialog__section"><h3>Награды</h3><ul class="award-list">' +
        person.awards.map(function (award) { return "<li>" + escapeHtml(award) + "</li>"; }).join("") +
        "</ul></section>"
      : "";

    var sourcesHtml = person.sources.length
      ? '<section class="dialog__section"><h3>Источники</h3><ul class="source-list">' +
        person.sources.map(function (source) { return "<li>" + escapeHtml(source) + "</li>"; }).join("") +
        "</ul></section>"
      : "";

    var noteHtml = person.note
      ? '<p class="dialog__note">' + escapeHtml(person.note) + " Проверьте сведения по документам.</p>"
      : "";

    return (
      '<div class="dialog__intro">' +
      '<h2 id="dialog-title">' + highlight(person.lastName, tokens) + " <span>" +
      highlight([person.firstName, person.patronymic].filter(Boolean).join(" "), tokens) + "</span></h2>" +
      '<p class="dialog__meta">' + escapeHtml(metaLine(person)) + "</p>" +
      tagsHtml +
      "</div>" +
      '<section class="dialog__section"><h3>Кратко</h3><p>' + escapeHtml(person.summary) + "</p></section>" +
      (factsHtml ? '<section class="dialog__section"><h3>Сведения</h3>' + factsHtml + "</section>" : "") +
      '<section class="dialog__section"><h3>Биография</h3>' + bioHtml + "</section>" +
      pathHtml + awardsHtml + sourcesHtml + noteHtml
    );
  }

  function openDialog(id) {
    var person = getPerson(id);
    if (!person) return;
    activeId = id;
    dialogKicker.textContent = person.categoryLabel;
    dialogBody.innerHTML = dialogHtml(person);
    dialogBody.scrollTop = 0;
    dialogExternal.href = archiveUrl(person.lastName);
    updateDialogButton();
    dialog.showModal();
    document.body.style.overflow = "hidden";
  }

  function closeDialog() {
    if (dialog.open) dialog.close();
  }

  function updateDialogButton() {
    if (!dialogAdd) return;
    if (!activeId) {
      dialogAdd.textContent = "Добавить в отчёт";
      dialogAdd.removeAttribute("aria-pressed");
      return;
    }
    var isSelected = selected.has(activeId);
    dialogAdd.textContent = isSelected ? "Убрать из отчёта" : "Добавить в отчёт";
    dialogAdd.setAttribute("aria-pressed", String(isSelected));
  }

  function togglePerson(id) {
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
    saveSelected();
    syncCheckboxes();
    updateReportBar();
    updateDialogButton();
  }

  function updateReportBar() {
    if (!reportBar) return;
    var count = selected.size;
    reportBar.hidden = count === 0;
    if (count === 0) return;
    reportCount.textContent = count;
    reportLabel.textContent = count === 1 ? "запись в отчёте" : count >= 2 && count <= 4 ? "записи в отчёте" : "записей в отчёте";
  }

  /* ---------- События ---------- */

  var heroForm = document.getElementById("hero-search");
  if (heroForm) {
    heroForm.addEventListener("submit", function (event) {
      event.preventDefault();
      var value = heroQ ? heroQ.value.trim() : "";
      window.location.href = value
        ? "search.html?last=" + encodeURIComponent(value) + "&auto=1"
        : "search.html";
    });
  }

  var resultsForm = document.getElementById("results-search");
  if (resultsForm) {
    resultsForm.addEventListener("submit", function (event) {
      event.preventDefault();
      applyQuery(resultsQ.value);
    });
  }

  if (resultsQ) {
    resultsQ.addEventListener("input", function () {
      applyQuery(resultsQ.value);
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-query]"), function (button) {
    button.addEventListener("click", function () {
      applyQuery(button.getAttribute("data-query"), { resetFilter: true });
      scrollToResults();
    });
  });

  var filters = document.getElementById("filters");
  if (filters) {
    filters.addEventListener("click", function (event) {
      var chip = event.target.closest(".chip");
      if (!chip) return;
      setFilter(chip.getAttribute("data-filter"));
    });
  }

  if (onlyAwardsEl) {
    onlyAwardsEl.addEventListener("change", function () {
      state.onlyAwards = onlyAwardsEl.checked;
      render();
    });
  }

  resultsEl.addEventListener("click", function (event) {
    var opener = event.target.closest("[data-open]");
    if (opener) {
      openDialog(opener.getAttribute("data-open"));
    }
  });

  resultsEl.addEventListener("change", function (event) {
    var box = event.target.closest("[data-pick]");
    if (box) togglePerson(box.getAttribute("data-pick"));
  });

  var closeButton = document.getElementById("dialog-close");
  if (closeButton) closeButton.addEventListener("click", closeDialog);

  if (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", function () {
      document.body.style.overflow = "";
      activeId = null;
    });
  }

  if (dialogAdd) {
    dialogAdd.addEventListener("click", function () {
      if (activeId) togglePerson(activeId);
    });
  }

  var clearButton = document.getElementById("report-clear");
  if (clearButton) {
    clearButton.addEventListener("click", function () {
      selected.clear();
      saveSelected();
      syncCheckboxes();
      updateReportBar();
      updateDialogButton();
    });
  }

  /* ---------- Появление секций ---------- */

  function initReveal() {
    var items = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      Array.prototype.forEach.call(items, function (item) { item.classList.add("is-visible"); });
      return;
    }
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    Array.prototype.forEach.call(items, function (item) { observer.observe(item); });
  }

  /* ---------- Старт ---------- */

  try {
    var initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) {
      state.query = initialQuery;
      if (heroQ) heroQ.value = initialQuery;
      if (resultsQ) resultsQ.value = initialQuery;
    }
  } catch (error) {
    /* старый браузер без URLSearchParams */
  }

  renderStats();
  renderChronicle();
  renderSources();
  renderSuggestions();
  render();
  initReveal();
})();
