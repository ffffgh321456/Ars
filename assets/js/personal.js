/* Личный архив пользователя.
   Записи хранятся в localStorage браузера и не отправляются на сервер.
   Формат совпадает с записями семейного архива из data.js. */

(function () {
  "use strict";

  var KEY = "pamyat-roda:personal:v1";

  function toArray(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (item) { return String(item == null ? "" : item).trim(); })
        .filter(Boolean);
    }
    if (typeof value === "string") {
      return value
        .split(/[,;\n]+/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean);
    }
    return [];
  }

  function toPath(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (step) {
        if (typeof step === "string") {
          return { date: "", title: "", text: step.trim() };
        }
        if (!step || typeof step !== "object") return null;
        return {
          date: String(step.date || "").trim(),
          title: String(step.title || "").trim(),
          text: String(step.text || "").trim()
        };
      })
      .filter(function (step) {
        return step && (step.title || step.text);
      });
  }

  function isWoman(record) {
    var first = String(record.firstName || "").toLowerCase();
    var patronymic = String(record.patronymic || "").toLowerCase();
    return /(а|я)$/.test(first) || /(на|овна|евна|ична|инична)$/.test(patronymic);
  }

  function newId() {
    return "p-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  }

  function normalize(raw) {
    if (!raw || typeof raw !== "object") return null;

    var lastName = String(raw.lastName || "").trim();
    var firstName = String(raw.firstName || "").trim();
    var patronymic = String(raw.patronymic || "").trim();
    if (!lastName && !firstName) return null;

    var category = raw.category === "homefront" || raw.category === "unknown" ? raw.category : "veteran";
    var categoryLabel = String(raw.categoryLabel || "").trim();
    if (!categoryLabel) {
      if (category === "homefront") {
        categoryLabel = isWoman(raw) ? "Труженица тыла" : "Труженик тыла";
      } else if (category === "unknown") {
        categoryLabel = "Сведения уточняются";
      } else {
        categoryLabel = isWoman(raw)
          ? "Участница Великой Отечественной войны"
          : "Участник Великой Отечественной войны";
      }
    }

    var fronts = toArray(raw.fronts);
    var units = toArray(raw.units);
    var awards = toArray(raw.awards);
    var places = toArray(raw.places);
    var bio = toArray(raw.bio);
    var sources = toArray(raw.sources);
    var birth = String(raw.birth || "").trim();
    var rank = String(raw.rank || "").trim();
    var position = String(raw.position || "").trim();
    var summary = String(raw.summary || "").trim();

    if (!summary) {
      var bits = [];
      if (birth) bits.push(birth + " г. р.");
      if (rank) bits.push(rank);
      if (position) bits.push(position);
      if (fronts.length) bits.push(fronts.join(", "));
      summary = bits.length
        ? bits.join(" · ")
        : "Запись из личного архива. Сведения уточняются.";
    }

    if (!sources.length) sources = ["Личный архив"];
    if (!bio.length) {
      bio = [
        "Запись добавлена в личный архив вручную. Биография и боевой путь уточняются по документам."
      ];
    }

    return {
      id: String(raw.id || "").trim() || newId(),
      personal: true,
      lastName: lastName,
      firstName: firstName,
      patronymic: patronymic,
      category: category,
      categoryLabel: categoryLabel,
      birth: birth,
      birthplace: String(raw.birthplace || "").trim(),
      rank: rank,
      position: position,
      fronts: fronts,
      units: units,
      awards: awards,
      places: places,
      summary: summary,
      bio: bio,
      path: toPath(raw.path),
      sources: sources,
      note: String(raw.note || "").trim()
    };
  }

  function load() {
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      if (!Array.isArray(raw)) return [];
      return raw.map(normalize).filter(Boolean);
    } catch (error) {
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (error) {
      return false;
    }
  }

  function add(record) {
    var normalized = normalize(record);
    if (!normalized) return null;
    var list = load();
    // Не допускаем дубликатов с одинаковым идентификатором.
    list = list.filter(function (item) { return item.id !== normalized.id; });
    list.push(normalized);
    if (!save(list)) return null;
    return normalized;
  }

  function remove(id) {
    var list = load().filter(function (item) { return item.id !== id; });
    return save(list);
  }

  function clear() {
    return save([]);
  }

  function exportJson() {
    return JSON.stringify(
      {
        service: "Память рода",
        version: 1,
        exportedAt: new Date().toISOString(),
        people: load()
      },
      null,
      2
    );
  }

  function importJson(text) {
    var parsed;
    try {
      parsed = JSON.parse(String(text || "").replace(/^\ufeff/, ""));
    } catch (error) {
      return { ok: false, added: 0, error: "Это не похоже на JSON-файл архива." };
    }

    var incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.people) ? parsed.people : null;
    if (!incoming) {
      return { ok: false, added: 0, error: "В файле не найден список записей." };
    }

    var list = load();
    var added = 0;
    incoming.forEach(function (raw) {
      var normalized = normalize(raw);
      if (!normalized) return;
      var exists = list.some(function (item) {
        return (
          item.id === normalized.id ||
          (item.lastName === normalized.lastName &&
            item.firstName === normalized.firstName &&
            item.patronymic === normalized.patronymic &&
            item.birth === normalized.birth)
        );
      });
      if (exists) return;
      list.push(normalized);
      added += 1;
    });

    if (!save(list)) {
      return { ok: false, added: 0, error: "Браузер не разрешил сохранить данные." };
    }
    return { ok: true, added: added };
  }

  window.PersonalArchive = {
    key: KEY,
    load: load,
    add: add,
    remove: remove,
    clear: clear,
    normalize: normalize,
    exportJson: exportJson,
    importJson: importJson
  };
})();
