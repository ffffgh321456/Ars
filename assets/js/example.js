/* Страница-пример: семья, с которой начался проект.
   Данные берутся из семейного архива data.js. На главной странице
   и в поиске эти записи не используются — там только личный архив. */

(function () {
  "use strict";

  var data = window.FAMILY_ARCHIVE;
  if (!data) return;

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

  function renderCards() {
    var grid = document.getElementById("example-cards");
    if (!grid) return;

    grid.innerHTML = data.people
      .map(function (person) {
        var tags = person.fronts.concat(person.places).slice(0, 6);
        var tagsHtml = tags.length
          ? '<ul class="tags">' + tags.map(function (tag) {
              return "<li>" + escapeHtml(tag) + "</li>";
            }).join("") + "</ul>"
          : "";

        var awardsHtml = person.awards.length
          ? '<div class="card__awards">' +
            '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">' +
            '<path d="M12 2.5l2.7 7h7.5l-6.1 4.9 2.3 7.5-6.4-4.6-6.4 4.6 2.3-7.5L2 9.5h7.5z" fill="currentColor"/></svg>' +
            "<p><strong>" + person.awards.length + " " +
            plural(person.awards.length, "награда", "награды", "наград") + "</strong> · " +
            person.awards.map(function (award) { return escapeHtml(award); }).join(" · ") + "</p></div>"
          : "";

        var bioHtml = person.bio.length
          ? person.bio.map(function (paragraph) {
              return "<p>" + escapeHtml(paragraph) + "</p>";
            }).join("")
          : "<p>Сведения уточняются по документам семейного архива.</p>";

        var pathHtml = person.path.length
          ? "<h4>Боевой путь</h4>" +
            '<ol class="timeline">' +
            person.path.map(function (step) {
              return "<li><span class=\"timeline__date\">" + escapeHtml(step.date) + "</span>" +
                "<h4>" + escapeHtml(step.title) + "</h4>" +
                "<p>" + escapeHtml(step.text) + "</p></li>";
            }).join("") +
            "</ol>"
          : "";

        var awardsListHtml = person.awards.length
          ? "<h4>Награды</h4><ul class=\"award-list\">" +
            person.awards.map(function (award) {
              return "<li>" + escapeHtml(award) + "</li>";
            }).join("") + "</ul>"
          : "";

        var sourcesHtml = person.sources.length
          ? "<h4>Источники</h4><ul class=\"source-list\">" +
            person.sources.map(function (source) {
              return "<li>" + escapeHtml(source) + "</li>";
            }).join("") + "</ul>"
          : "";

        var noteHtml = person.note
          ? '<p class="card__note">' + escapeHtml(person.note) + "</p>"
          : "";

        var status = person.path.length
          ? person.path.length + " " + plural(person.path.length, "этап", "этапа", "этапов") + " боевого пути"
          : "Сведения уточняются";

        return (
          '<article class="card" id="example-' + escapeHtml(person.id) + '">' +
          '<div class="card__head">' +
          '<div class="card__monogram" aria-hidden="true">' + escapeHtml(person.lastName.charAt(0)) + "</div>" +
          '<div class="card__ident">' +
          '<p class="card__kicker">' + escapeHtml(person.categoryLabel) + "</p>" +
          '<h3 class="card__name">' + escapeHtml(fullName(person)) + "</h3>" +
          '<p class="card__meta">' + escapeHtml(metaLine(person)) + "</p>" +
          "</div>" +
          '<span class="card__status">' + escapeHtml(status) + "</span>" +
          "</div>" +
          '<p class="card__summary">' + escapeHtml(person.summary) + "</p>" +
          tagsHtml +
          awardsHtml +
          noteHtml +
          '<details class="card__details">' +
          "<summary>Биография, боевой путь и источники</summary>" +
          '<div class="example-details">' +
          "<h4>Биография</h4>" + bioHtml +
          pathHtml +
          awardsListHtml +
          sourcesHtml +
          "</div></details>" +
          "</article>"
        );
      })
      .join("");
  }

  function renderTimeline() {
    var list = document.getElementById("example-chronicle");
    if (!list) return;
    list.innerHTML = data.timeline
      .map(function (item) {
        return (
          "<li>" +
          '<span class="chronicle__year">' + escapeHtml(item.year) + "</span>" +
          '<p class="chronicle__text">' + escapeHtml(item.text) + "</p>" +
          "</li>"
        );
      })
      .join("");
  }

  function renderSources() {
    var grid = document.getElementById("example-sources");
    if (!grid) return;
    grid.innerHTML = data.sources
      .map(function (source, i) {
        return (
          '<a class="source" href="' + escapeHtml(source.url) + '" target="_blank" rel="noopener">' +
          '<span class="source__num">0' + (i + 1) + "</span>" +
          "<div><h3>" + escapeHtml(source.name) + "</h3><p>" + escapeHtml(source.note) + "</p></div>" +
          '<svg class="source__arrow" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">' +
          '<path d="M7 17L17 7M8 7h9v9" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
          "</svg></a>"
        );
      })
      .join("");
  }

  renderCards();
  renderTimeline();
  renderSources();
})();
