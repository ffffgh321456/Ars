/* Военные архивы: куда отправить запрос.
   Сайты не предоставляют открытого API, поэтому сервис формирует
   корректные ссылки с параметрами и текст запроса для ручного поиска. */

(function () {
  "use strict";

  function clean(value) {
    return String(value == null ? "" : value).trim();
  }

  function fullName(query) {
    return [query.lastName, query.firstName, query.middleName]
      .map(clean)
      .filter(Boolean)
      .join(" ");
  }

  function siteQuery(query, site) {
    var parts = [];
    var fio = fullName(query);
    if (fio) parts.push(fio.split(" ").length > 1 ? '"' + fio + '"' : fio);
    if (clean(query.birthDate)) parts.push(clean(query.birthDate));
    if (clean(query.birthPlace)) parts.push(clean(query.birthPlace));
    if (clean(query.award)) parts.push(clean(query.award));
    if (site) parts.push("site:" + site);
    return parts.join(" ");
  }

  function plainQuery(query) {
    var parts = [];
    if (clean(query.lastName)) parts.push(clean(query.lastName));
    if (clean(query.firstName)) parts.push(clean(query.firstName));
    if (clean(query.middleName)) parts.push(clean(query.middleName));
    if (clean(query.birthDate)) parts.push(clean(query.birthDate));
    if (clean(query.birthPlace)) parts.push(clean(query.birthPlace));
    if (clean(query.rank)) parts.push(clean(query.rank));
    if (clean(query.award)) parts.push(clean(query.award));
    return parts.join(" ");
  }

  function pamyatNaroda(query) {
    var url = new URL("https://pamyat-naroda.ru/heroes/");
    if (clean(query.lastName)) url.searchParams.set("last_name", clean(query.lastName));
    if (clean(query.firstName)) url.searchParams.set("first_name", clean(query.firstName));
    if (clean(query.middleName)) url.searchParams.set("middle_name", clean(query.middleName));
    if (clean(query.birthDate)) url.searchParams.set("birth_date", clean(query.birthDate));
    if (clean(query.birthPlace)) url.searchParams.set("birth_place", clean(query.birthPlace));
    if (clean(query.rank)) url.searchParams.set("rank", clean(query.rank));
    return url.toString();
  }

  function obdMemorial(query) {
    var url = new URL("https://obd-memorial.ru/html/search.htm");
    if (clean(query.lastName)) url.searchParams.set("lastName", clean(query.lastName));
    if (clean(query.firstName)) url.searchParams.set("firstName", clean(query.firstName));
    if (clean(query.middleName)) url.searchParams.set("middleName", clean(query.middleName));
    if (clean(query.birthDate)) url.searchParams.set("birthDate", clean(query.birthDate));
    if (clean(query.birthPlace)) url.searchParams.set("birthPlace", clean(query.birthPlace));
    return url.toString();
  }

  function google(query) {
    return "https://www.google.com/search?q=" + encodeURIComponent(siteQuery(query, "pamyat-naroda.ru"));
  }

  function yandex(query) {
    return "https://yandex.ru/search/?text=" + encodeURIComponent(siteQuery(query, "pamyat-naroda.ru"));
  }

  var archives = [
    {
      id: "pamyat",
      name: "Память народа",
      kicker: "Главный банк документов",
      note: "Боевой путь, наградные листы, донесения о потерях, места захоронений. Самый полный открытый архив Министерства обороны.",
      url: pamyatNaroda,
      auto: true
    },
    {
      id: "podvig",
      name: "Подвиг народа",
      kicker: "Награды и приказы",
      note: "Наградные листы, приказы о награждении, описание подвигов. Открывается в режиме поиска — вставьте запрос из поля ниже.",
      url: function () { return "https://podvignaroda.ru/?#tab=navPeople_search"; },
      auto: false
    },
    {
      id: "obd",
      name: "ОБД «Мемориал»",
      kicker: "Потери и захоронения",
      note: "Донесения о безвозвратных потерях, извещения, списки захоронений. Помогает, если родственник погиб или пропал без вести.",
      url: obdMemorial,
      auto: true
    },
    {
      id: "foto",
      name: "Дорога памяти",
      kicker: "Фотографии и лица",
      note: "Открытая база музея: фотографии, биографии и награды участников войны. Онлайн-поиск выше уже ищет по этой базе, а здесь можно открыть полную выдачу.",
      url: function (query) {
        var fio = fullName(query);
        return fio
          ? "https://1418museum.ru/search/?q=" + encodeURIComponent(fio)
          : "https://1418museum.ru/";
      },
      auto: true
    },
    {
      id: "moypolk",
      name: "Бессмертный полк",
      kicker: "Народная память",
      note: "Страницы ветеранов, воспоминания и фотографии, которые добавляют семьи. Здесь можно найти сведения от других родственников.",
      url: function (query) {
        var fio = fullName(query);
        return fio
          ? "https://www.moypolk.ru/search?q=" + encodeURIComponent(fio)
          : "https://www.moypolk.ru/";
      },
      auto: true
    },
    {
      id: "google",
      name: "Поиск по архивам в Google",
      kicker: "Если параметры не сработали",
      note: "Ищет упоминания фамилии на сайтах архивов, в книгах памяти и публикациях. Полезно при ошибках в написании фамилии.",
      url: google,
      auto: true
    },
    {
      id: "yandex",
      name: "Поиск по архивам в Яндексе",
      kicker: "Альтернативный поиск",
      note: "Хорошо находит региональные книги памяти и списки захоронений. Используйте вместе с Google — выдача отличается.",
      url: yandex,
      auto: true
    }
  ];

  window.MilitaryArchives = {
    list: archives,
    plainQuery: plainQuery,
    siteQuery: siteQuery,
    fullName: fullName
  };
})();
