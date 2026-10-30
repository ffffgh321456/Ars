(function () {
  "use strict";

  var data = window.FAMILY_ARCHIVE;
  if (!data) return;

  var personalRecords = window.PersonalArchive ? window.PersonalArchive.load() : [];
  var people = personalRecords;
  var STORAGE_KEY = "pamyat-roda:report:v1";
  var paper = document.getElementById("paper");
  var note = document.getElementById("report-note");
  var wordButton = document.getElementById("word-btn");
  var printButton = document.getElementById("print-btn");

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

  function recordWord(number) {
    return plural(number, "запись", "записи", "записей");
  }

  function fullName(person) {
    return [person.lastName, person.firstName, person.patronymic].filter(Boolean).join(" ");
  }

  function joinNames(names) {
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + " и " + names[1];
    return names.slice(0, -1).join(", ") + " и " + names[names.length - 1];
  }

  function formatDate() {
    try {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric"
      }).format(new Date());
    } catch (error) {
      return "25 октября 2026 г.";
    }
  }

  function getSelectedPeople() {
    var ids = [];
    try {
      ids = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch (error) {
      ids = [];
    }
    ids = Array.isArray(ids) ? ids : [];

    var selected = people.filter(function (person) {
      return ids.indexOf(person.id) !== -1;
    });

    var usedDefault = false;
    var usedPersonalDefault = false;
    if (!selected.length && personalRecords.length) {
      selected = personalRecords.slice();
      usedPersonalDefault = true;
      usedDefault = true;
    }

    return { people: selected, usedDefault: usedDefault, usedPersonalDefault: usedPersonalDefault };
  }

  function personFacts(person) {
    var facts = [];
    if (person.birth) facts.push(["Год рождения", person.birth]);
    if (person.birthplace) facts.push(["Место рождения", person.birthplace]);

    var rankAndPosition = [person.rank, person.position].filter(Boolean).join(" · ");
    if (rankAndPosition && rankAndPosition !== person.categoryLabel) {
      facts.push(["Звание и должность", rankAndPosition]);
    }
    if (person.fronts.length) facts.push(["Фронты", person.fronts.join(", ")]);
    if (person.units.length) facts.push(["Части и соединения", person.units.join(", ")]);
    if (person.places.length) facts.push(["Места сражений", person.places.join(", ")]);
    if (!facts.length) facts.push(["Статус", person.categoryLabel]);
    return facts;
  }

  function personSection(person, index) {
    var facts = personFacts(person);

    var factsHtml =
      '<dl class="doc-facts">' +
      facts
        .map(function (fact) {
          return (
            '<div class="doc-fact"><dt>' + escapeHtml(fact[0]) + "</dt><dd>" +
            escapeHtml(fact[1]) + "</dd></div>"
          );
        })
        .join("") +
      "</dl>";

    var pathHtml = person.path.length
      ? '<h3>Боевой путь</h3><ol class="doc-timeline">' +
        person.path
          .map(function (step) {
            return (
              "<li><span class=\"doc-timeline__date\">" + escapeHtml(step.date) + "</span>" +
              "<h4>" + escapeHtml(step.title) + "</h4>" +
              "<p>" + escapeHtml(step.text) + "</p></li>"
            );
          })
          .join("") +
        "</ol>"
      : "";

    var awardsHtml = person.awards.length
      ? '<h3>Награды</h3><ul class="doc-awards">' +
        person.awards
          .map(function (award) { return "<li>" + escapeHtml(award) + "</li>"; })
          .join("") +
        "</ul>"
      : "";

    var sourcesHtml = person.sources.length
      ? '<h3>Источники записи</h3><ul class="doc-sources">' +
        person.sources
          .map(function (source) { return "<li>" + escapeHtml(source) + "</li>"; })
          .join("") +
        "</ul>"
      : "";

    var noteHtml = person.note
      ? '<p class="doc-note">' + escapeHtml(person.note) + ". Проверьте сведения по документам.</p>"
      : "";

    var bioHtml = person.bio.length
      ? person.bio.map(function (paragraph) { return "<p>" + escapeHtml(paragraph) + "</p>"; }).join("")
      : "<p>Сведения уточняются. Запись добавлена в личный архив; биография будет дополнена по документам.</p>";

    var titlePrefix = person.category === "veteran" ? "Боевой путь" : "Семейная летопись";

    return (
      '<section class="doc-person" id="person-' + escapeHtml(person.id) + '">' +
      '<header class="doc-person__head">' +
      '<p class="doc-eyebrow">Запись ' + String(index + 1).padStart(2, "0") + " · " +
      escapeHtml(person.categoryLabel) + "</p>" +
      "<h2>" + escapeHtml(fullName(person)) + "</h2>" +
      '<p class="doc-person__meta">' + escapeHtml(titlePrefix) + "</p>" +
      "</header>" +
      factsHtml +
      '<h3>Биография</h3>' +
      bioHtml +
      pathHtml +
      awardsHtml +
      sourcesHtml +
      noteHtml +
      "</section>"
    );
  }

  function buildEmptyState() {
    paper.innerHTML =
      '<section class="doc-empty">' +
      '<p class="doc-eyebrow">Память рода · семейный архив</p>' +
      '<div class="doc-empty__star" aria-hidden="true">★</div>' +
      "<h1>В личном архиве<br>пока нет записей</h1>" +
      "<p>Добавьте сведения о родственнике в личный архив — и сервис соберёт отчёт " +
      "с биографией, боевым путём, наградами и списком источников.</p>" +
      '<div class="doc-empty__actions">' +
      '<a class="tool-btn tool-btn--gold" href="search.html#my-archive">Найти родственника</a>' +
      '<a class="tool-btn tool-btn--ghost" href="example.html">Посмотреть пример</a>' +
      "</div>" +
      "</section>";
    paper.setAttribute("aria-busy", "false");
    document.title = "Отчёт — Память рода";
    window.__reportFileName = "Семейный_отчёт_Память_рода.doc";
    if (wordButton) wordButton.disabled = true;
    if (printButton) printButton.disabled = true;
    if (note) {
      note.hidden = false;
      note.innerHTML =
        "В личном архиве пока нет записей. " +
        '<a href="search.html#my-archive">Добавьте родственника</a> или посмотрите ' +
        '<a href="example.html">пример готового исследования</a>.';
    }
  }

  function buildReport() {
    if (!people.length) {
      buildEmptyState();
      return;
    }

    var selection = getSelectedPeople();
    var selected = selection.people;
    var date = formatDate();
    var count = selected.length;
    var names = selected.map(fullName);
    var veterans = selected.filter(function (person) { return person.category === "veteran"; });
    var homefront = selected.filter(function (person) { return person.category === "homefront"; });

    var subtitle = veterans.length
      ? "Боевой путь " + joinNames(veterans.map(fullName))
      : "Семейная летопись";
    if (homefront.length) {
      subtitle += (veterans.length ? ". " : "") + "Труженики тыла: " + joinNames(homefront.map(fullName));
    }

    var includedWord = count === 1 ? "включена" : "включены";

    var tocItems = [{ title: "Введение", meta: "Семейный архив" }].concat(
      selected.map(function (person) {
        return {
          title: fullName(person),
          meta: person.category === "veteran" ? "Боевой путь" : "Семейная летопись"
        };
      }),
      [
        { title: "Заключение", meta: "Сохранение памяти" },
        { title: "Список источников", meta: "Документы и архивы" }
      ]
    );

    var tocHtml = tocItems
      .map(function (item, index) {
        return (
          "<li><span>" + String(index + 1).padStart(2, "0") + "</span>" +
          "<span>" + escapeHtml(item.title) + "</span>" +
          "<span>" + escapeHtml(item.meta) + "</span></li>"
        );
      })
      .join("");

    var sources = [];
    selected.forEach(function (person) {
      person.sources.forEach(function (source) {
        if (sources.indexOf(source) === -1) sources.push(source);
      });
    });

    var sourceItems = sources
      .map(function (source) { return "<li>" + escapeHtml(source) + "</li>"; })
      .join("");

    var archiveItems = data.sources
      .map(function (source) {
        return (
          "<li><a href=\"" + escapeHtml(source.url) + "\" target=\"_blank\" rel=\"noopener\">" +
          escapeHtml(source.name) + "</a> — " + escapeHtml(source.note) + "</li>"
        );
      })
      .join("");

    var html =
      '<section class="doc-cover">' +
      '<p class="doc-cover__kicker">Семейный архив · Память рода</p>' +
      '<div class="doc-cover__star" aria-hidden="true">★</div>' +
      "<h1>Великая Отечественная война<br>в моей семье</h1>" +
      '<p class="doc-cover__sub">' + escapeHtml(subtitle) + "</p>" +
      '<div class="doc-cover__rule" aria-hidden="true"></div>' +
      '<dl class="doc-cover__meta">' +
      "<div><dt>Составлено</dt><dd>" + escapeHtml(date) + "</dd></div>" +
      "<div><dt>Записей в отчёте</dt><dd>" + count + " " + recordWord(count) + "</dd></div>" +
      "<div><dt>Источник</dt><dd>Семейный архив</dd></div>" +
      "</dl>" +
      '<p class="doc-cover__foot">Документ сформирован в сервисе «Память рода»<br>по материалам личного семейного архива</p>' +
      "</section>" +

      '<section class="doc-section doc-toc">' +
      "<h2>Состав отчёта</h2>" +
      "<ol>" + tocHtml + "</ol>" +
      "</section>" +

      '<section class="doc-section">' +
      "<h2>Введение</h2>" +
      "<p>Этот отчёт собран по материалам личного семейного архива. " +
      "В него " + includedWord + " " + count + " " + recordWord(count) + ": " + escapeHtml(joinNames(names)) + ".</p>" +
      "<p>Сведения восстановлены по наградным документам, справочникам Генерального штаба, воспоминаниям родных и семейным фотографиям. " +
      "Для каждой записи приведены биография, хроника боевого пути, награды и перечень источников.</p>" +
      "<p>Цель работы — сохранить память о родственниках, которые участвовали в Великой Отечественной войне, и передать её следующим поколениям.</p>" +
      "</section>" +

      selected.map(personSection).join("") +

      '<section class="doc-section doc-conclusion">' +
      "<h2>Заключение</h2>" +
      "<p>Работа над семейным архивом не заканчивается этим документом. Мы продолжим искать документы, уточнять даты и восстанавливать детали биографий. " +
      "За каждой строкой отчёта — судьба человека, и наша задача — сохранить её для следующих поколений.</p>" +
      "<blockquote><p>«Мы должны знать и помнить людей, которые подарили нам мирную жизнь».</p></blockquote>" +
      "<p>Каждый год 9 Мая семьи идут в «Бессмертном полку» с портретами своих ветеранов. Память о них живёт в документах, фотографиях и рассказах, которые мы передаём детям.</p>" +
      "</section>" +

      '<section class="doc-section doc-sources-final">' +
      "<h2>Список источников</h2>" +
      "<h3>Документы и материалы семьи</h3>" +
      '<ul class="doc-sources">' + sourceItems + "</ul>" +
      "<h3>Открытые банки документов</h3>" +
      '<ul class="doc-sources">' + archiveItems + "</ul>" +
      "</section>" +

      '<p class="doc-signature"><strong>Память рода</strong>' +
      "Документ сформирован автоматически " + escapeHtml(date) + "<br>" +
      "по материалам семейного архива · Никто не забыт, ничто не забыто</p>";

    paper.innerHTML = html;
    paper.setAttribute("aria-busy", "false");
    document.title = "Великая Отечественная война в моей семье — семейный отчёт";
    window.__reportFileName = "Семейный_отчёт_Память_рода.doc";

    if (selection.usedDefault && note) {
      note.hidden = false;
      note.innerHTML =
        "Вы ещё не выбрали записи, поэтому в отчёт включены все записи из вашего личного архива. " +
        '<a href="index.html#search">Вернитесь к поиску</a>, чтобы изменить состав или добавить родственников.';
    }
  }

  function downloadWord() {
    var body = paper.innerHTML;
    if (!body) return;

    var wordCss = [
      '@page { size: A4; margin: 2cm 1.7cm; }',
      'body { font-family: "Times New Roman", serif; font-size: 12pt; line-height: 1.5; color: #000; }',
      'h1, h2, h3, h4 { font-family: "Times New Roman", serif; color: #000; }',
      '.doc-cover { text-align: center; page-break-after: always; }',
      '.doc-cover h1 { font-size: 24pt; line-height: 1.15; margin: 18pt 0; }',
      '.doc-cover__kicker, .doc-eyebrow, .doc-person__meta, .doc-fact dt, .doc-timeline__date, .doc-signature { font-family: Arial, sans-serif; font-size: 8pt; letter-spacing: 1px; text-transform: uppercase; color: #666; }',
      '.doc-cover__star { color: #b4883f; font-size: 28pt; margin: 12pt 0; }',
      '.doc-cover__sub { font-style: italic; font-size: 13pt; margin: 10pt 0; }',
      '.doc-cover__rule { width: 60pt; border-top: 1px solid #b4883f; margin: 14pt auto; }',
      '.doc-cover__meta { width: 100%; margin: 28pt 0 16pt; }',
      '.doc-cover__meta div { display: inline-block; width: 31%; vertical-align: top; }',
      '.doc-cover__meta dt { font-family: Arial, sans-serif; font-size: 8pt; color: #666; }',
      '.doc-cover__meta dd { font-size: 11pt; }',
      '.doc-cover__foot { font-family: Arial, sans-serif; font-size: 8pt; color: #666; margin-top: 24pt; }',
      '.doc-toc { page-break-after: always; }',
      '.doc-toc h2, .doc-section h2 { font-size: 16pt; }',
      '.doc-toc li { border-bottom: 1px solid #ddd; padding: 4pt 0; }',
      '.doc-toc li span { margin-right: 8pt; }',
      '.doc-person { page-break-before: always; }',
      '.doc-person h2 { font-size: 18pt; margin: 6pt 0; }',
      '.doc-section h3 { font-size: 10pt; color: #8a6428; margin: 12pt 0 4pt; }',
      '.doc-section p { text-align: justify; text-indent: 1.25cm; margin: 0 0 6pt; }',
      '.doc-facts { width: 100%; margin: 8pt 0; }',
      '.doc-fact { display: inline-block; width: 46%; vertical-align: top; border: 1px solid #ddd; padding: 6pt; margin: 0 1% 1% 0; }',
      '.doc-fact dt { font-family: Arial, sans-serif; font-size: 7pt; color: #777; }',
      '.doc-fact dd { font-size: 10.5pt; margin: 2pt 0 0; }',
      '.doc-timeline { margin: 6pt 0; }',
      '.doc-timeline li { margin: 0 0 8pt; }',
      '.doc-timeline__date { color: #8a6428; }',
      '.doc-timeline h4 { font-size: 12pt; margin: 2pt 0; }',
      '.doc-timeline p { text-indent: 0; font-size: 11pt; }',
      '.doc-awards { margin: 6pt 0; }',
      '.doc-awards li { margin-bottom: 4pt; }',
      '.doc-sources { margin: 6pt 0; }',
      '.doc-sources li { margin-bottom: 4pt; font-size: 11pt; }',
      '.doc-note { border-left: 2px solid #b4883f; padding: 6pt 10pt; background: #f5efe3; font-size: 10pt; }',
      '.doc-conclusion { page-break-before: always; }',
      '.doc-conclusion blockquote { border-left: 2px solid #b4883f; padding: 4pt 10pt; margin: 8pt 0; }',
      '.doc-signature { border-top: 1px solid #ccc; margin-top: 28pt; padding-top: 10pt; text-align: center; }',
      'a { color: #000; text-decoration: underline; }'
    ].join("\n");

    var html =
      '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>Великая Отечественная война в моей семье</title>' +
      "<style>" + wordCss + "</style></head><body>" + body + "</body></html>";

    var blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = window.__reportFileName || "Семейный_отчёт_Память_рода.doc";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  if (wordButton) wordButton.addEventListener("click", downloadWord);
  if (printButton) {
    printButton.addEventListener("click", function () {
      window.print();
    });
  }

  buildReport();
})();
