const express = require("express");
const multer = require("multer");
const path = require("path");
const fsSync = require("fs");
const fs = require("fs/promises");
const os = require("os");
const { spawn } = require("child_process");
const axios = require("axios");
const jwt = require("jsonwebtoken");

const TestSuite = require("../models/testsuite");
const PlanTest = require("../models/plantest"); // legacy (backward-compat migration only)

const router = express.Router();

function getFastApiBaseUrl() {
  return String(process.env.FASTAPI_BASE_URL || "http://localhost:8000").replace(
    /\/$/,
    ""
  );
}

function getUserIdFromAuthHeader(req) {
  const authHeader = String(req?.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";

  const token = authHeader.slice(7).trim();
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return "";

  try {
    const decoded = jwt.verify(token, secret);
    const userLike = decoded?.user || decoded;
    return String(userLike?.userId || userLike?.id || userLike?._id || userLike?.sub || "").trim();
  } catch {
    return "";
  }
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

function ensureDocx(file, cb) {
  const ext = path.extname(file.originalname || "").toLowerCase();
  const okExt = ext === ".docx";
  const okMime =
    !file.mimetype ||
    file.mimetype ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.mimetype === "application/octet-stream";

  if (okExt && okMime) return cb(null, true);
  cb(new Error("Only .docx files are allowed"));
}

function safeBasename(filename) {
  const base = path.basename(String(filename || "spec.docx"));
  // Windows reserved chars + path separators -> underscore
  return base.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").replace(/\s+/g, " ").trim();
}

function getSpecsUploadDir() {
  const backendRoot = path.resolve(__dirname, "../..");
  return path.join(backendRoot, "uploads", "specs");
}

function ensureDirExists(dir) {
  try {
    if (fsSync.existsSync(dir)) {
      const stat = fsSync.statSync(dir);
      if (stat.isDirectory()) return;
      // Repo may contain a placeholder file named like the directory (e.g. uploads/specs)
      // to keep the path in git. Replace it with a real directory at runtime.
      fsSync.unlinkSync(dir);
    }
    fsSync.mkdirSync(dir, { recursive: true });
  } catch (err) {
    const message = err?.message || String(err);
    throw new Error(`Unable to prepare upload directory '${dir}': ${message}`);
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      try {
        const dir = getSpecsUploadDir();
        ensureDirExists(dir);
        cb(null, dir);
      } catch (err) {
        cb(err);
      }
    },
    filename: function (req, file, cb) {
      const original = safeBasename(file.originalname);
      cb(null, `${Date.now()}-${original}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => ensureDocx(file, cb),
});

function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", command],
      { windowsHide: true }
    );

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      const error = new Error(stderr || stdout || `PowerShell exited with code ${code}`);
      error.code = code;
      reject(error);
    });
  });
}

function decodeXmlEntities(value) {
  return String(value || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function extractTextFromDocumentXml(xml) {
  const source = String(xml || "")
    .replaceAll(/<w:tab[^>]*\/>/g, "\t")
    .replaceAll(/<w:br[^>]*\/>/g, "\n");

  const paragraphs = source.match(/<w:p[\s\S]*?<\/w:p>/g) || [];
  const lines = paragraphs.map((p) => {
    const parts = [...p.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
      decodeXmlEntities(m[1])
    );
    return parts.join("").trimEnd();
  });

  return lines
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractDocxText(buffer) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docx-"));
  // Expand-Archive refuses unknown extensions like .docx even if it's a ZIP internally,
  // so we write the buffer as .zip for PowerShell.
  const zipPath = path.join(tempRoot, "spec.zip");
  const unzipDir = path.join(tempRoot, "unzipped");

  try {
    await fs.writeFile(zipPath, buffer);

    if (process.platform !== "win32") {
      throw new Error(
        "DOCX extraction requires mammoth, or Windows PowerShell Expand-Archive (current platform not supported)."
      );
    }

    await fs.mkdir(unzipDir, { recursive: true });
    const cmd = `Expand-Archive -Path '${zipPath.replaceAll("'", "''")}' -DestinationPath '${unzipDir.replaceAll("'", "''")}' -Force`;
    await runPowerShell(cmd);

    const documentXmlPath = path.join(unzipDir, "word", "document.xml");
    const xml = await fs.readFile(documentXmlPath, "utf8");
    return extractTextFromDocumentXml(xml);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
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
    const baseUrl = getFastApiBaseUrl();
    const { message } = req.body || {};
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
});

router.get("/testsuite/:id/plan", async (req, res) => {
  try {
    const testSuiteId = String(req.params.id || "").trim();
    if (!testSuiteId) return res.status(400).json({ message: "testSuiteId is required" });

    const suite = await TestSuite.findById(testSuiteId);
    if (!suite) return res.status(404).json({ message: "TestSuite not found" });

    // Preferred storage: embedded steps in TestSuite
    if (Array.isArray(suite.planSteps) && suite.planSteps.length) {
      const plans = [...suite.planSteps]
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
        .map((p) => ({
          _id: p._id,
          contenu: p.contenu,
          ordre: p.ordre,
          testSuiteId,
        }));
      return res.json({ plans, steps: plans.map((p) => p.contenu) });
    }

    // Backward compatibility: migrate legacy PlanTest docs into suite.planSteps (copy only)
    const legacyPlans = await PlanTest.find({ testSuiteId }).sort({ ordre: 1 });
    if (legacyPlans.length) {
      suite.planSteps = legacyPlans.map((p) => ({
        contenu: p.contenu,
        ordre: p.ordre,
      }));
      await suite.save();
    }

    return res.json({
      plans: legacyPlans,
      steps: legacyPlans.map((p) => p.contenu),
    });
  } catch (error) {
    res.status(500).json({ message: error?.message || "Failed to get plan" });
  }
});

router.post("/generate-plan", upload.single("file"), async (req, res) => {
  try {
    const urlCible = String(req.body?.urlCible || req.body?.url_cible || "").trim();
    const userIdBody = String(req.body?.userId || "").trim();
    const providedTestSuiteId = String(req.body?.testSuiteId || "").trim();
    const suiteName = String(req.body?.nom || "").trim();
    const description = String(req.body?.description || "").trim();
    const regenerate = parseBoolean(req.body?.regenerate);

    if (!urlCible) return res.status(400).json({ message: "urlCible is required" });
    if (!description) return res.status(400).json({ message: "description is required" });
    if (!req.file) return res.status(400).json({ message: "file (.docx) is required" });

    // userId is only required when creating a new TestSuite (no providedTestSuiteId).
    const userId = userIdBody || getUserIdFromAuthHeader(req);

    const fileBuffer = req.file?.buffer || (req.file?.path ? await fs.readFile(req.file.path) : null);
    if (!fileBuffer) return res.status(400).json({ message: "file (.docx) is required" });

    const specText = await extractDocxText(fileBuffer);
    if (!specText) return res.status(400).json({ message: "Unable to extract text from .docx" });

    const specTextStored = specText.slice(0, 50_000);

    const combinedDescription = [
      description,
      "",
      "---- SPEC DOCX EXTRACT ----",
      specText,
    ]
      .join("\n")
      .trim()
      .slice(0, 20_000);

    let suite = null;

    if (providedTestSuiteId) {
      suite = await TestSuite.findById(providedTestSuiteId);
      if (!suite) return res.status(404).json({ message: "TestSuite not found" });

      const updates = {
        description: combinedDescription,
        urlCible,
        specText: specTextStored,
        specFileName: req.file?.originalname || null,
        specFilePath: req.file?.filename ? `uploads/specs/${req.file.filename}` : null,
      };
      if (suiteName) updates.nom = suiteName;

      suite = await TestSuite.findByIdAndUpdate(providedTestSuiteId, updates, { new: true });
    } else {
      if (!userId) {
        return res.status(400).json({ message: "userId is required to create a TestSuite" });
      }
      const now = new Date();
      const defaultName = `Test Suite - ${now.toISOString().slice(0, 19).replace("T", " ")}`;
      suite = await TestSuite.create({
        nom: suiteName || defaultName,
        description: combinedDescription,
        urlCible,
        userId,
        specText: specTextStored,
        specFileName: req.file?.originalname || null,
        specFilePath: req.file?.filename ? `uploads/specs/${req.file.filename}` : null,
      });
    }

    const testSuiteId = String(suite._id);

    if (!regenerate) {
      if (Array.isArray(suite.planSteps) && suite.planSteps.length) {
        const plans = [...suite.planSteps]
          .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
          .map((p) => ({
            _id: p._id,
            contenu: p.contenu,
            ordre: p.ordre,
            testSuiteId,
          }));
        return res.json({
          testSuiteId,
          steps: plans.map((p) => p.contenu),
          plans,
          reused: true,
        });
      }

      const legacy = await PlanTest.find({ testSuiteId }).sort({ ordre: 1 });
      if (legacy.length) {
        suite.planSteps = legacy.map((p) => ({ contenu: p.contenu, ordre: p.ordre }));
        await suite.save();
        return res.json({
          testSuiteId,
          steps: legacy.map((p) => p.contenu),
          plans: legacy,
          reused: true,
        });
      }
    } else {
      // Clear embedded plan and legacy docs
      suite.planSteps = [];
      await suite.save();
      await PlanTest.deleteMany({ testSuiteId });
    }

    const baseUrl = getFastApiBaseUrl();
    const fastApiResponse = await axios.post(
      `${baseUrl}/generate-plan`,
      { spec_text: specText, url_cible: urlCible, description },
      { timeout: 185_000 }
    );

    const steps = fastApiResponse?.data?.steps;
    if (!Array.isArray(steps) || !steps.length) {
      return res.status(502).json({ message: "FastAPI returned empty steps" });
    }

    const docs = steps
      .map((s) => String(s || "").trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((step, idx) => ({
        contenu: step,
        ordre: idx + 1,
      }));

    suite.planSteps = docs;
    await suite.save();

    const plans = [...suite.planSteps]
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      .map((p) => ({
        _id: p._id,
        contenu: p.contenu,
        ordre: p.ordre,
        testSuiteId,
      }));

    return res.json({
      testSuiteId,
      steps: plans.map((p) => p.contenu),
      plans,
      reused: false,
    });
  } catch (error) {
    const status = error?.response?.status || 500;
    const message =
      error?.response?.data?.error ||
      error?.response?.data?.message ||
      error?.message ||
      "Generate plan failed";
    return res.status(status).json({ message });
  }
});

router.use((err, req, res, next) => {
  if (!err) return next();
  const status = err?.name === "MulterError" ? 400 : 400;
  res.status(status).json({ message: err.message || "Upload failed" });
});

module.exports = router;
