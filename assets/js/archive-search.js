(function () {
  "use strict";

  var archives = window.MilitaryArchives;
  var personal = window.PersonalArchive;
  if (!archives || !personal) return;

  var form = document.getElementById("archive-form");
  var grid = document.getElementById("archives-grid");
  var summaryEl = document.getElementById("query-summary");
  var queryTextEl = document.getElementById("query-text");
  var copyButton = document.getElementById("copy-query");
  var downloadQueryButton = document.getElementById("download-query");
  var openAddButton = document.getElementById("open-add");
  var addPanel = document.getElementById("add-panel");
  var personForm = document.getElementById("person-form");
  var personStatus = document.getElementById("person-status");
  var resetPersonButton = document.getElementById("reset-person");
  var listEl = document.getElementById("personal-list");
  var emptyEl = document.getElementById("personal-empty");
  var countEl = document.getElementById("personal-count");
  var exportButton = document.getElementById("export-archive");
  var importInput = document.getElementById("import-archive");
  var clearButton = document.getElementById("clear-archive");
  var toastEl = document.getElementById("toast");
  var toastTimer = null;
  var editingId = null;

  var fields = {
    lastName: document.getElementById("q-last"),
    firstName: document.getElementById("q-first"),
    middleName: document.getElementById("q-middle"),
    birthDate: document.getElementById("q-birth"),
    birthPlace: document.getElementById("q-place"),
    rank: document.getElementById("q-rank"),
    award: document.getElementById("q-award")
  };

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

  function getQuery() {
    var query = {};
    Object.keys(fields).forEach(function (key) {
      query[key] = fields[key] ? fields[key].value.trim() : "";
    });
    return query;
  }

  function prefillFromUrl() {
    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (error) {
      return;
    }
    var map = {
      lastName: ["last", "lastName", "last_name"],
      firstName: ["first", "firstName", "first_name"],
      middleName: ["middle", "middleName", "middle_name"],
      birthDate: ["birth", "birthDate", "birth_date"],
      birthPlace: ["place", "birthPlace", "birth_place"],
      rank: ["rank"],
      award: ["award"]
    };
    Object.keys(map).forEach(function (key) {
      if (!fields[key]) return;
      var value = "";
      for (var i = 0; i < map[key].length; i += 1) {
        var candidate = params.get(map[key][i]);
        if (candidate && candidate.trim()) {
          value = candidate.trim();
          break;
        }
      }
      if (value) fields[key].value = value;
    });
    if (!fields.lastName.value) {
      var query = params.get("q");
      if (query) fields.lastName.value = query.trim();
    }
  }

  function fullName(query) {
    return [query.lastName, query.firstName, query.middleName].filter(Boolean).join(" ");
  }

  function queryDetails(query) {
    var parts = [];
    if (query.birthDate) parts.push(query.birthDate + " г. р.");
    if (query.birthPlace) parts.push(query.birthPlace);
    if (query.rank) parts.push(query.rank);
    if (query.award) parts.push(query.award);
    return parts;
  }

  function showToast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.hidden = true;
    }, 3600);
  }

  function copyText(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () {
        return fallbackCopy(text);
      });
    }
    return Promise.resolve(fallbackCopy(text));
  }

  function fallbackCopy(text) {
    var area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.select();
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (error) {
      ok = false;
    }
    area.remove();
    return ok;
  }

  function renderArchives() {
    var query = getQuery();
    var hasName = Boolean(query.lastName);

    grid.innerHTML = archives.list
      .map(function (archive) {
        var href = archive.url(query);
        var disabled = !hasName && archive.id === "pamyat";
        return (
          '<article class="archive-link' + (archive.auto ? "" : " archive-link--manual") + '">' +
          '<div class="archive-link__head">' +
          '<p class="archive-link__kicker">' + escapeHtml(archive.kicker) + "</p>" +
          "<h3>" + escapeHtml(archive.name) + "</h3>" +
          "</div>" +
          '<p class="archive-link__note">' + escapeHtml(archive.note) + "</p>" +
          '<div class="archive-link__actions">' +
          '<a class="btn btn--dark btn--small" href="' + escapeHtml(href) + '" target="_blank" rel="noopener">' +
          (disabled ? "Открыть архив" : "Открыть с запросом") +
          "</a>" +
          '<button class="archive-link__copy" type="button" data-copy-query>Скопировать запрос</button>' +
          "</div>" +
          (archive.auto ? "" : '<p class="archive-link__manual">Сайт не принимает параметры в ссылке: скопируйте запрос и вставьте его в поле поиска.</p>') +
          "</article>"
        );
      })
      .join("");

    Array.prototype.forEach.call(grid.querySelectorAll("[data-copy-query]"), function (button) {
      button.addEventListener("click", function () {
        copyText(archives.plainQuery(query)).then(function (ok) {
          showToast(ok ? "Запрос скопирован — вставьте его в поле поиска архива." : "Не удалось скопировать. Выделите запрос вручную.");
        });
      });
    });

    var name = fullName(query) || "Фамилия не указана";
    var details = queryDetails(query);
    summaryEl.innerHTML =
      "<span>Ищем:</span> <strong>" + escapeHtml(name) + "</strong>" +
      (details.length ? " · " + escapeHtml(details.join(" · ")) : "") +
      (hasName ? "" : ' <em>Введите фамилию, чтобы уточнить запрос.</em>');

    queryTextEl.textContent = archives.plainQuery(query) || "Фамилия";
  }

  function renderPersonal() {
    var records = personal.load();
    countEl.innerHTML = records.length
      ? "В личном архиве <strong>" + records.length + "</strong> " +
        plural(records.length, "запись", "записи", "записей")
      : "В личном архиве пока нет записей";

    emptyEl.hidden = records.length !== 0;
    listEl.hidden = records.length === 0;

    listEl.innerHTML = records
      .map(function (record) {
        var tags = record.fronts.concat(record.awards).slice(0, 6);
        var tagsHtml = tags.length
          ? '<ul class="tags">' + tags.map(function (tag) {
              return "<li>" + escapeHtml(tag) + "</li>";
            }).join("") + "</ul>"
          : "";
        var meta = [
          record.birth ? record.birth + " г. р." : "",
          record.rank,
          record.position
        ].filter(Boolean).join(" · ");

        return (
          '<article class="personal-item" data-id="' + escapeHtml(record.id) + '">' +
          '<div class="personal-item__head">' +
          '<p class="personal-item__kicker">' + escapeHtml(record.categoryLabel) + "</p>" +
          "<h3>" + escapeHtml([record.lastName, record.firstName, record.patronymic].filter(Boolean).join(" ")) + "</h3>" +
          (meta ? '<p class="personal-item__meta">' + escapeHtml(meta) + "</p>" : "") +
          "</div>" +
          '<p class="personal-item__summary">' + escapeHtml(record.summary) + "</p>" +
          tagsHtml +
          '<div class="personal-item__actions">' +
          '<a class="btn btn--outline btn--small" href="index.html?q=' + encodeURIComponent(record.lastName || record.firstName) + '">Открыть в поиске сайта</a>' +
          '<button class="personal-item__link" type="button" data-edit="' + escapeHtml(record.id) + '">Изменить</button>' +
          '<button class="personal-item__link personal-item__link--danger" type="button" data-delete="' + escapeHtml(record.id) + '">Удалить</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
  }

  function resetPersonForm() {
    editingId = null;
    personForm.reset();
    personStatus.textContent = "";
    personStatus.className = "add-form__status";
    var submit = personForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = "Сохранить в мой архив";
  }

  function fillPersonForm(record) {
    document.getElementById("p-last").value = record.lastName || "";
    document.getElementById("p-first").value = record.firstName || "";
    document.getElementById("p-middle").value = record.patronymic || "";
    document.getElementById("p-birth").value = record.birth || "";
    document.getElementById("p-place").value = record.birthplace || "";
    document.getElementById("p-category").value = record.category || "veteran";
    document.getElementById("p-rank").value = record.rank || "";
    document.getElementById("p-position").value = record.position || "";
    document.getElementById("p-fronts").value = record.fronts.join(", ");
    document.getElementById("p-awards").value = record.awards.join(", ");
    document.getElementById("p-summary").value = record.summary || "";
    document.getElementById("p-bio").value = record.bio.join("\n\n");
    document.getElementById("p-sources").value = record.sources.join("\n");
  }

  function prefillFromQuery() {
    if (editingId) return;
    var query = getQuery();
    var map = {
      "p-last": query.lastName,
      "p-first": query.firstName,
      "p-middle": query.middleName,
      "p-birth": query.birthDate,
      "p-place": query.birthPlace,
      "p-rank": query.rank,
      "p-awards": query.award
    };
    Object.keys(map).forEach(function (id) {
      var input = document.getElementById(id);
      if (input && !input.value.trim() && map[id]) input.value = map[id];
    });
  }

  function openAddPanel(focusField) {
    prefillFromQuery();
    addPanel.open = true;
    if (focusField) {
      var target = document.getElementById(focusField);
      if (target) {
        addPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        window.setTimeout(function () { target.focus({ preventScroll: true }); }, 350);
      }
    }
  }

  function openAddPerson(person) {
    if (!person || !addPanel || !personForm) return;
    editingId = null;
    personForm.reset();

    document.getElementById("p-last").value = person.lastName || "";
    document.getElementById("p-first").value = person.firstName || "";
    document.getElementById("p-middle").value = person.patronymic || "";
    document.getElementById("p-birth").value = person.birth || "";
    document.getElementById("p-place").value = person.birthplace || "";
    document.getElementById("p-category").value = person.category || "veteran";
    document.getElementById("p-rank").value = person.rank || "";
    document.getElementById("p-position").value = person.position || "";
    document.getElementById("p-fronts").value = Array.isArray(person.fronts)
      ? person.fronts.join(", ")
      : String(person.fronts || "");
    document.getElementById("p-awards").value = Array.isArray(person.awards)
      ? person.awards.join(", ")
      : String(person.awards || "");
    document.getElementById("p-summary").value = person.summary || "";
    document.getElementById("p-bio").value = Array.isArray(person.bio)
      ? person.bio.join("\n\n")
      : String(person.bio || "");
    document.getElementById("p-sources").value = Array.isArray(person.sources)
      ? person.sources.join("\n")
      : String(person.sources || "");

    var submit = personForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = "Сохранить в мой архив";

    personStatus.textContent = "Данные из «Дороги памяти» подставлены. Проверьте сведения и сохраните запись.";
    personStatus.className = "add-form__status";
    addPanel.open = true;
    addPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(function () {
      var target = document.getElementById("p-last");
      if (target) target.focus({ preventScroll: true });
    }, 350);
    showToast("Запись подставлена в форму личного архива.");
  }

  function notifyArchiveChanged() {
    try {
      document.dispatchEvent(new CustomEvent("pamyat:archive-changed"));
    } catch (error) {
      /* старый браузер без CustomEvent */
    }
  }

  function saveRecord(event) {
    event.preventDefault();
    var lastName = document.getElementById("p-last").value.trim();
    var firstName = document.getElementById("p-first").value.trim();
    if (!lastName || !firstName) {
      personStatus.textContent = "Укажите фамилию и имя.";
      personStatus.className = "add-form__status is-error";
      return;
    }

    var record = {
      id: editingId || "",
      lastName: lastName,
      firstName: firstName,
      patronymic: document.getElementById("p-middle").value,
      birth: document.getElementById("p-birth").value,
      birthplace: document.getElementById("p-place").value,
      category: document.getElementById("p-category").value,
      rank: document.getElementById("p-rank").value,
      position: document.getElementById("p-position").value,
      fronts: document.getElementById("p-fronts").value,
      awards: document.getElementById("p-awards").value,
      summary: document.getElementById("p-summary").value,
      bio: document.getElementById("p-bio").value,
      sources: document.getElementById("p-sources").value
    };

    var saved = personal.add(record);
    if (!saved) {
      personStatus.textContent = "Не удалось сохранить запись: браузер запретил доступ к хранилищу.";
      personStatus.className = "add-form__status is-error";
      return;
    }

    var wasEditing = Boolean(editingId);
    editingId = null;
    renderPersonal();
    notifyArchiveChanged();
    resetPersonForm();
    personStatus.textContent = wasEditing
      ? "Изменения сохранены в личном архиве."
      : "Запись сохранена в личном архиве.";
    personStatus.className = "add-form__status is-ok";
    showToast(
      wasEditing
        ? "Изменения сохранены."
        : "Готово. Запись появится в поиске, хронике и семейном отчёте."
    );
  }

  function editRecord(id) {
    var record = personal.load().find(function (item) { return item.id === id; });
    if (!record) return;
    editingId = id;
    fillPersonForm(record);
    addPanel.open = true;
    addPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    var submit = personForm.querySelector('button[type="submit"]');
    if (submit) submit.textContent = "Сохранить изменения";
    personStatus.textContent = "Редактирование записи.";
    personStatus.className = "add-form__status";
  }

  function deleteRecord(id) {
    var record = personal.load().find(function (item) { return item.id === id; });
    if (!record) return;
    var name = [record.lastName, record.firstName].filter(Boolean).join(" ");
    if (!window.confirm("Удалить запись «" + name + "» из личного архива? Действие нельзя отменить.")) return;
    personal.remove(id);
    if (editingId === id) resetPersonForm();
    renderPersonal();
    notifyArchiveChanged();
    showToast("Запись удалена из личного архива.");
  }

  function downloadJson() {
    var text = personal.exportJson();
    var blob = new Blob(["\ufeff", text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "pamyat-roda-archive.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    showToast("Архив сохранён в файл.");
  }

  function importArchive(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var result = personal.importJson(String(reader.result || ""));
      if (!result.ok) {
        showToast(result.error || "Не удалось загрузить архив.");
        return;
      }
      renderPersonal();
      notifyArchiveChanged();
      showToast(
        result.added
          ? "Загружено записей: " + result.added + "."
          : "Новых записей нет — все уже есть в архиве."
      );
    };
    reader.onerror = function () {
      showToast("Не удалось прочитать файл.");
    };
    reader.readAsText(file, "utf-8");
  }

  /* ---------- События ---------- */

  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!fields.lastName.value.trim()) {
        fields.lastName.focus();
        showToast("Введите фамилию — без неё поиск в архивах не сработает.");
        return;
      }
      renderArchives();
      document.getElementById("results-links").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    Array.prototype.forEach.call(form.querySelectorAll("input"), function (input) {
      input.addEventListener("input", renderArchives);
    });
  }

  if (copyButton) {
    copyButton.addEventListener("click", function () {
      copyText(queryTextEl.textContent).then(function (ok) {
        showToast(ok ? "Запрос скопирован." : "Не удалось скопировать запрос.");
      });
    });
  }

  if (downloadQueryButton) {
    downloadQueryButton.addEventListener("click", function () {
      var text = archives.plainQuery(getQuery());
      if (!text) {
        fields.lastName.focus();
        showToast("Сначала введите фамилию.");
        return;
      }
      var blob = new Blob(["\ufeff", text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "zapros-v-arhiv.txt";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    });
  }

  document.addEventListener("pamyat:add-person", function (event) {
    if (event.detail) openAddPerson(event.detail);
  });

  if (openAddButton) {
    openAddButton.addEventListener("click", function () {
      openAddPanel("p-last");
    });
  }

  if (addPanel) {
    addPanel.addEventListener("toggle", function () {
      if (addPanel.open) prefillFromQuery();
    });
  }

  if (personForm) {
    personForm.addEventListener("submit", saveRecord);
  }

  if (resetPersonButton) {
    resetPersonButton.addEventListener("click", function () {
      resetPersonForm();
      personStatus.textContent = "";
    });
  }

  if (listEl) {
    listEl.addEventListener("click", function (event) {
      var edit = event.target.closest("[data-edit]");
      if (edit) {
        editRecord(edit.getAttribute("data-edit"));
        return;
      }
      var del = event.target.closest("[data-delete]");
      if (del) deleteRecord(del.getAttribute("data-delete"));
    });
  }

  if (exportButton) exportButton.addEventListener("click", downloadJson);

  if (importInput) {
    importInput.addEventListener("change", function () {
      var file = importInput.files && importInput.files[0];
      if (file) importArchive(file);
      importInput.value = "";
    });
  }

  if (clearButton) {
    clearButton.addEventListener("click", function () {
      var count = personal.load().length;
      if (!count) {
        showToast("Личный архив уже пуст.");
        return;
      }
      if (!window.confirm("Удалить все записи личного архива? Сначала лучше сохранить архив в файл.")) return;
      personal.clear();
      resetPersonForm();
      renderPersonal();
      notifyArchiveChanged();
      showToast("Личный архив очищен.");
    });
  }

  /* ---------- Старт ---------- */

  prefillFromUrl();
  renderArchives();
  renderPersonal();

  if (window.location.hash === "#add" || window.location.hash === "#add-panel") {
    openAddPanel("p-last");
  }
})();
