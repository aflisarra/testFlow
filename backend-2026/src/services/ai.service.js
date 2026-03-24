const axios = require("axios");

function stripCodeFences(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
}

function parseStepsFromModel(content) {
  const raw = stripCodeFences(content);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(String).map((s) => s.trim()).filter(Boolean);
    }
  } catch {
    // ignore JSON parse errors; fall back to line parsing
  }

  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*]\s+/, "").replace(/^\d+[\).\s-]+\s*/, ""))
    .map((line) => line.trim())
    .filter(Boolean);
}

function getFastApiBaseUrl() {
  return String(process.env.FASTAPI_BASE_URL || "http://localhost:8000").replace(
    /\/$/,
    ""
  );
}

function normalizeFastApiError(error) {
  const status = error?.response?.status;
  const message =
    error?.response?.data?.reply ||
    error?.response?.data?.error ||
    error?.message ||
    "FastAPI request failed";

  const normalized = new Error(message);
  normalized.statusCode = status || 500;
  normalized.code = error?.code || "FASTAPI_ERROR";
  return normalized;
}

function createFastApiClient() {
  const baseURL = getFastApiBaseUrl();
  return axios.create({
    baseURL,
    timeout: 125_000,
    headers: { "Content-Type": "application/json" },
  });
}

async function generatePlanTest(description, urlCible) {
  const client = createFastApiClient();

  const prompt = [
    "Tu es un assistant QA.",
    "Génère un plan de test E2E clair et actionnable.",
    "Réponds uniquement par un JSON array de strings (sans texte autour).",
    "Chaque élément est une étape concise (max 1 phrase).",
    "Entre 6 et 15 étapes.",
    "",
    `Description: ${String(description || "").trim()}`,
    `URL cible: ${String(urlCible || "").trim()}`,
  ].join("\n");

  try {
    const response = await client.post("/chat", { message: prompt });
    const content = response?.data?.reply;

    const steps = parseStepsFromModel(content);
    if (!steps.length) {
      const error = new Error("AI returned empty plan");
      error.code = "AI_EMPTY_RESPONSE";
      error.statusCode = 502;
      throw error;
    }

    return steps.slice(0, 50);
  } catch (error) {
    throw normalizeFastApiError(error);
  }
}

module.exports = {
  generatePlanTest,
};

