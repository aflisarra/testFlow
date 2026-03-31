// ============================================================
// services/testsuite.service.js
// VERSION FINALE — fusionne ai.service.js + testsuite.service.js
// Supprime ai.service.js après avoir utilisé ce fichier
// ============================================================

const path = require("path");
const fs = require("fs/promises");
const os = require("os");
const { spawn } = require("child_process");
const axios = require("axios");

const TestSuite = require("../models/testsuite");
const PlanTest = require("../models/plantest.model");

// ============================================================
// HELPERS UTILITAIRES
// ============================================================

// Lit l'URL de FastAPI depuis .env
function getFastApiBaseUrl() {
    return String(process.env.FASTAPI_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
}

// Convertit "true" / "1" / "yes" en vrai boolean
function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value !== "string") return false;
    return ["1", "true", "yes", "y", "on"].includes(value.trim().toLowerCase());
}

// Supprime les ``` de code que l'IA ajoute parfois dans sa réponse
function stripCodeFences(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed.startsWith("```")) return trimmed;
    return trimmed.replace(/^```[a-zA-Z]*\s*/m, "").replace(/```$/m, "").trim();
}

// Parse la réponse de l'IA en tableau de steps
// L'IA peut répondre en JSON array ou en liste de lignes
function parseStepsFromModel(content) {
    const raw = stripCodeFences(content);

    // Essai 1 : parser en JSON array ["step1", "step2"]
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            return parsed.map(String).map((s) => s.trim()).filter(Boolean);
        }
    } catch {
        // pas du JSON — on continue
    }

    // Essai 2 : trouver un array JSON dans le texte
    const left = raw.indexOf("[");
    const right = raw.lastIndexOf("]");
    if (left !== -1 && right > left) {
        try {
            const parsed = JSON.parse(raw.slice(left, right + 1));
            if (Array.isArray(parsed)) {
                return parsed.map(String).map((s) => s.trim()).filter(Boolean);
            }
        } catch {
            // pas du JSON — on continue
        }
    }

    // Essai 3 : parser ligne par ligne (liste à puces ou numérotée)
    return raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => line.replace(/^[-*•]\s+/, "").replace(/^\d+[\).\s-]+\s*/, ""))
        .map((line) => line.trim())
        .filter(Boolean);
}

// Formate une erreur FastAPI proprement
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

// ============================================================
// HELPERS LECTURE .DOCX
// ============================================================

// Décode les caractères spéciaux XML (&amp; → & etc.)
function decodeXmlEntities(value) {
    return String(value || "")
        .replaceAll("&amp;", "&")
        .replaceAll("&lt;", "<")
        .replaceAll("&gt;", ">")
        .replaceAll("&quot;", '"')
        .replaceAll("&#39;", "'");
}

// Extrait le texte lisible depuis le contenu XML de document.xml
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

// Lance une commande PowerShell (Windows uniquement) pour dézipper le .docx
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

// ============================================================
// FONCTION PRINCIPALE 1 : Extraire le texte d'un .docx
// ============================================================
async function extractDocxText(buffer) {
    // ✅ Dossier séparé pour les specs — pas mélangé avec uploads/users/
    const specsDir = path.join(__dirname, "..", "uploads", "specs");
    await fs.mkdir(specsDir, { recursive: true });

    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "docx-"));
    const docxPath = path.join(tempRoot, "spec.docx");
    const unzipDir = path.join(tempRoot, "unzipped");

    try {
        await fs.writeFile(docxPath, buffer);

        if (process.platform !== "win32") {
            throw new Error("DOCX extraction requires Windows PowerShell. On Linux/Mac, run: npm install mammoth");
        }

        await fs.mkdir(unzipDir, { recursive: true });
        const cmd = `Expand-Archive -Path '${docxPath.replaceAll("'", "''")}' -DestinationPath '${unzipDir.replaceAll("'", "''")}' -Force`;
        await runPowerShell(cmd);

        const documentXmlPath = path.join(unzipDir, "word", "document.xml");
        const xml = await fs.readFile(documentXmlPath, "utf8");
        return extractTextFromDocumentXml(xml);
    } finally {
        await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => { });
    }
}

// ============================================================
// FONCTION PRINCIPALE 2 : Appeler FastAPI → Ollama
// Remplace generatePlanTest() de ai.service.js
// ============================================================
async function callFastApiGeneratePlan(description, urlCible) {
    // Construit le prompt envoyé à Ollama llama3
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
        // Appelle FastAPI POST /chat (qui appelle Ollama en interne)
        const client = axios.create({
            baseURL: getFastApiBaseUrl(),
            timeout: 125_000,
            headers: { "Content-Type": "application/json" },
        });

        const response = await client.post("/chat", { message: prompt });
        const content = response?.data?.reply;

        const steps = parseStepsFromModel(content);
        if (!steps.length) {
            const error = new Error("AI returned empty plan");
            error.statusCode = 502;
            throw error;
        }

        return steps.slice(0, 50);
    } catch (error) {
        throw normalizeFastApiError(error);
    }
}

// ============================================================
// FONCTION PRINCIPALE 3 : Créer ou mettre à jour une TestSuite
// ============================================================
async function createOrUpdateTestSuite({
    providedTestSuiteId,
    userId,
    suiteName,
    combinedDescription,
    urlCible,
    specText,
    specFileName,
    specFilePath,
}) {
    if (providedTestSuiteId) {
        const suite = await TestSuite.findById(providedTestSuiteId);
        if (!suite) {
            const error = new Error("TestSuite not found");
            error.statusCode = 404;
            throw error;
        }
        const updates = { description: combinedDescription, urlCible };
        if (suiteName) updates.nom = suiteName;
        if (specText) updates.specText = String(specText).slice(0, 50_000);
        if (specFileName) updates.specFileName = String(specFileName);
        if (specFilePath) updates.specFilePath = String(specFilePath);
        return await TestSuite.findByIdAndUpdate(providedTestSuiteId, updates, { new: true });
    }

    const now = new Date();
    const defaultName = `Test Suite - ${now.toISOString().slice(0, 19).replace("T", " ")}`;
    return await TestSuite.create({
        nom: suiteName || defaultName,
        description: combinedDescription,
        urlCible,
        userId,
        specText: specText ? String(specText).slice(0, 50_000) : null,
        specFileName: specFileName ? String(specFileName) : null,
        specFilePath: specFilePath ? String(specFilePath) : null,
    });
}

// ============================================================
// FONCTION PRINCIPALE 4 : Sauvegarder les steps (embedded dans TestSuite)
// ============================================================
async function saveEmbeddedPlanSteps(steps, testSuiteId) {
    const docs = steps
        .map((s) => String(s || "").trim())
        .filter(Boolean)
        .slice(0, 50)
        .map((step, idx) => ({
            contenu: step,
            ordre: idx + 1,
        }));

    const suite = await TestSuite.findByIdAndUpdate(
        testSuiteId,
        { planSteps: docs },
        { new: true }
    );

    return (suite?.planSteps || [])
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
        .map((p) => ({
            _id: p._id,
            contenu: p.contenu,
            ordre: p.ordre,
            testSuiteId,
        }));
}

// ============================================================
// FONCTION PRINCIPALE 5 : Flux complet — génération du plan
// Appelée par le controller
// ============================================================
async function generatePlan({
    file,
    urlCible,
    userId,
    providedTestSuiteId,
    suiteName,
    description,
    regenerate,
}) {
    // Étape 1 : Extraire le texte du .docx
    const specText = await extractDocxText(file.buffer);
    if (!specText) {
        const error = new Error("Unable to extract text from .docx");
        error.statusCode = 400;
        throw error;
    }

    // Étape 2 : Combiner description utilisateur + texte du .docx
    const combinedDescription = [
        description,
        "",
        "---- SPEC DOCX EXTRACT ----",
        specText,
    ]
        .join("\n")
        .trim()
        .slice(0, 20_000);

    // Étape 3 : Créer ou mettre à jour la TestSuite dans MongoDB
    const suite = await createOrUpdateTestSuite({
        providedTestSuiteId,
        userId,
        suiteName,
        combinedDescription,
        urlCible,
        specText,
        specFileName: file?.originalname || null,
        specFilePath: file?.path || null,
    });

    const testSuiteId = String(suite._id);

    // Étape 4 : Retourner le plan existant si regenerate = false
    if (!regenerate) {
        const suiteReloaded = await TestSuite.findById(testSuiteId);
        if (suiteReloaded?.planSteps?.length) {
            const plans = [...suiteReloaded.planSteps]
                .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
                .map((p) => ({
                    _id: p._id,
                    contenu: p.contenu,
                    ordre: p.ordre,
                    testSuiteId,
                }));
            return {
                testSuiteId,
                steps: plans.map((p) => p.contenu),
                plans,
                reused: true,
            };
        }

        // Backward compatibility (copy-only migration)
        const legacy = await PlanTest.find({ testSuiteId }).sort({ ordre: 1 });
        if (legacy.length && suiteReloaded) {
            suiteReloaded.planSteps = legacy.map((p) => ({
                contenu: p.contenu,
                ordre: p.ordre,
            }));
            await suiteReloaded.save();
            return {
                testSuiteId,
                steps: legacy.map((p) => p.contenu),
                plans: legacy,
                reused: true,
            };
        }
    } else {
        await TestSuite.findByIdAndUpdate(testSuiteId, { planSteps: [] });
        await PlanTest.deleteMany({ testSuiteId });
    }

    // Étape 5 : Appeler FastAPI → Ollama pour générer le plan
    const steps = await callFastApiGeneratePlan(combinedDescription, urlCible);

    // Étape 6 : Sauvegarder les steps dans MongoDB
    const plans = await saveEmbeddedPlanSteps(steps, testSuiteId);

    return {
        testSuiteId,
        steps: plans.map((p) => p.contenu),
        plans,
        reused: false,
    };
}

// ============================================================
// FONCTION PRINCIPALE 6 : Récupérer un plan existant
// ============================================================
async function getPlanByTestSuiteId(testSuiteId) {
    const suite = await TestSuite.findById(testSuiteId);
    if (suite?.planSteps?.length) {
        const plans = [...suite.planSteps]
            .sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
            .map((p) => ({
                _id: p._id,
                contenu: p.contenu,
                ordre: p.ordre,
                testSuiteId,
            }));
        return { plans, steps: plans.map((p) => p.contenu) };
    }

    // Backward compatibility (copy-only migration)
    //list des tests 
    const legacyPlans = await PlanTest.find({ testSuiteId }).sort({ ordre: 1 });
    if (suite && legacyPlans.length) {
        suite.planSteps = legacyPlans.map((p) => ({ contenu: p.contenu, ordre: p.ordre }));
        await suite.save();
    }
    return { plans: legacyPlans, steps: legacyPlans.map((p) => p.contenu) };
}


async function getTestSuitesByUser(userId) {
    // Public listing mode: return all suites regardless of connected user.
    // Keep the same function signature/endpoint for frontend compatibility.
    const suites = await TestSuite.find({})
        .select('_id nom nametest description specFileName urlCible testPlans testCasesByPlan createdAt userId')
        .populate('userId', 'name email')
        .sort({ createdAt: -1 })
        .lean()

    return suites.map((suite) => {
        const totalTestCases = (suite.testCasesByPlan || []).reduce((acc, plan) => {
            return acc + ((plan?.testCases || []).length || 0)
        }, 0)

        return {
            ...suite,
            creatorName: suite?.userId?.name || suite?.userId?.email || 'Unknown User',
            totalTestCases,
        }
    })
}

async function getTestPlansByTestSuiteId(testSuiteId) {
    const suite = await TestSuite.findById(testSuiteId)
        .select('_id testPlans testCasesByPlan')
        .lean()

    if (!suite) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }

    return {
        testSuiteId: String(suite._id),
        testPlans: suite.testPlans || [],
        testCasesByPlan: suite.testCasesByPlan || [],
    }
}

module.exports = {
    generatePlan,
    getPlanByTestSuiteId,
    getTestSuitesByUser,
    getTestPlansByTestSuiteId,
    parseBoolean,
};
