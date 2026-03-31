const express = require("express");
const axios = require("axios");

const router = express.Router();

/*function getFastApiBaseUrl() {
  return String(process.env.FASTAPI_BASE_URL || "http://localhost:8000").replace(
    /\/$/,
    ""
  );
}

router.get("/health", async (req, res) => {
  try {
    const baseUrl = getFastApiBaseUrl();
    const response = await axios.get(`${baseUrl}/`, { timeout: 10_000 });
    res.json(response.data);
  } catch (error) {
    const status = error?.response?.status || 502;
    res.status(status).json({
      error: error?.response?.data || error?.message || "FastAPI unreachable",
    });
  }
});

router.post("/chat", async (req, res) => {
  try {
    const { message } = req.body || {};
    const baseUrl = getFastApiBaseUrl();

    const response = await axios.post(
      `${baseUrl}/chat`,
      { message },
      { timeout: 120_000 }
    );

    res.json({ reply: response?.data?.reply });
  } catch (error) {
    const status = error?.response?.status || 502;
    res.status(status).json({
      error: error?.response?.data || error?.message || "FastAPI chat failed",
    });
  }
});*/

module.exports = router;

