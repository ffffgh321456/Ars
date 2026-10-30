"use strict";

/* Netlify Function: подробности одной записи «Дороги памяти».
   Публичный адрес: /api/hero?id=55290813 (см. netlify.toml). */

const core = require("./lib/heroes-core");

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
  const id = String(params.id || "").trim();

  if (!/^\d{1,12}$/.test(id)) {
    return core.jsonResponse(400, {
      ok: false,
      error: "Неверный идентификатор записи."
    });
  }

  try {
    const data = await core.heroDetail(id);
    return core.jsonResponse(200, data);
  } catch (error) {
    const message = error && error.message ? String(error.message) : "";
    console.error("hero:", message || error);

    if (/(503|429)/.test(message)) {
      return core.jsonResponse(429, {
        ok: false,
        error:
          "База «Дорога памяти» временно ограничила запросы с этого адреса. " +
          "Подождите около 10 минут и попробуйте снова.",
        detail: message
      });
    }

    return core.jsonResponse(502, {
      ok: false,
      error: "Не удалось загрузить подробности записи. Откройте её в первоисточнике."
    });
  }
};
