"use strict";

/* Netlify Function: поиск ветеранов в открытой базе «Дорога памяти».
   Публичный адрес: /api/heroes?q=Фамилия (см. netlify.toml).
   Та же функция используется локальным сервером через tools/serve.ps1. */

const core = require("./lib/heroes-core");

const MAX_QUERY_LENGTH = 120;
const MIN_QUERY_LENGTH = 2;

function preflight() {
  return {
    statusCode: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    },
    body: ""
  };
}

exports.handler = async function (event) {
  const method = String((event && event.httpMethod) || "GET").toUpperCase();

  if (method === "OPTIONS") return preflight();

  if (method !== "GET" && method !== "HEAD") {
    return core.jsonResponse(405, {
      ok: false,
      error: "Метод не поддерживается. Используйте GET."
    });
  }

  const params = (event && event.queryStringParameters) || {};
  const query = String(params.q || "")
    .replace(/\s+/g, " ")
    .trim();

  if (query.length < MIN_QUERY_LENGTH) {
    return core.jsonResponse(400, {
      ok: false,
      error: "Введите фамилию целиком — минимум две буквы."
    });
  }

  if (query.length > MAX_QUERY_LENGTH) {
    return core.jsonResponse(400, {
      ok: false,
      error: "Слишком длинный запрос. Укажите только фамилию, имя и отчество."
    });
  }

  try {
    const data = await core.searchHeroes(query);
    return core.jsonResponse(200, data);
  } catch (error) {
    const message = error && error.message ? String(error.message) : "";
    console.error("heroes:", message || error);

    if (/(503|429)/.test(message)) {
      return core.jsonResponse(429, {
        ok: false,
        error:
          "База «Дорога памяти» временно ограничила запросы с этого адреса. " +
          "Подождите около 10 минут и нажмите «Повторить».",
        detail: message
      });
    }

    return core.jsonResponse(502, {
      ok: false,
      error:
        "База «Дорога памяти» сейчас не отвечает. Попробуйте ещё раз через минуту " +
        "или откройте первоисточник по ссылке.",
      source: "Дорога памяти"
    });
  }
};
