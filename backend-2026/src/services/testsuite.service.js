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
const Project = require("../models/project.model");
const MESSAGES = require('../constants/messages.js');

function computeSuiteStatusKey(suite) {
    const normalized = normalizeSuiteSessionState(suite)
    if (normalized.execution) return normalized.execution
    return normalized.validation
}

function normalizePlanStatusRows(rows) {
    return (Array.isArray(rows) ? rows : [])
        .map((p) => ({
            planId: String(p?.planId || '').trim(),
            status: String(p?.status || '').toLowerCase().trim(),
        }))

        .filter((p) => p.planId && p.status)
}

function computeValidationStatus(suite) {
    const hasPlans = (suite?.testPlans?.length || 0) > 0
    const hasCases = (suite?.testCasesByPlan?.length || 0) > 0

    const fullyGenerated = hasPlans && hasCases
    if (!fullyGenerated) return 'invalid'

    // We do not add an `isSaved` field to Mongo. Equivalent signal is `savedAt`.
    const isSaved = suite?.savedAt instanceof Date || !!suite?.savedAt
    if (isSaved) return 'validated'

    return 'invalid'
}

function normalizeSuiteSessionState(suite) {
    const validationPlanRows = normalizePlanStatusRows(suite?.validationPlanStatuses)
    const executionPlanRows = normalizePlanStatusRows(suite?.executionPlanStatuses)

    let validationStatus = String(suite?.validationStatus || '').toLowerCase().trim()
    if (!['validated', 'invalid'].includes(validationStatus)) validationStatus = ''

    let executionStatus = String(suite?.executionStatus || '').toLowerCase().trim()
    if (!['completed', 'incomplete'].includes(executionStatus)) executionStatus = ''

    const legacyPlanRows = normalizePlanStatusRows(suite?.planStatuses)
    const legacySessionStatus = String(suite?.sessionStatus || '').toLowerCase().trim()

    const legacyValidationRows = legacyPlanRows.filter((p) =>
        ['pending', 'generating', 'reviewing', 'confirmed', 'rejected'].includes(p.status)
    )
    const legacyExecutionRows = legacyPlanRows.filter((p) =>
        ['completed', 'incomplete'].includes(p.status)
    )

    const inferredValidationPlanRows =
        validationPlanRows.length > 0 ? validationPlanRows : legacyValidationRows
    const inferredExecutionPlanRows =
        executionPlanRows.length > 0 ? executionPlanRows : legacyExecutionRows

    const inferredExecution =
        executionStatus ||
        (inferredExecutionPlanRows.length > 0
            ? inferredExecutionPlanRows.some((p) => p.status === 'incomplete')
                ? 'incomplete'
                : inferredExecutionPlanRows.every((p) => p.status === 'completed')
                    ? 'completed'
                    : ''
            : '')

    // Validation is now intentionally simplified to 2 states.
    // Prefer computed result (generated content presence + savedAt) over legacy per-plan statuses.
    const computedValidation = computeValidationStatus(suite)
    const inferredValidation = computedValidation || validationStatus || ''

    // Legacy fallback when we only have suite.sessionStatus
    const legacyOnly =
        !inferredExecution &&
        !inferredValidation &&
        (legacySessionStatus === 'complete' || legacySessionStatus === 'incomplete')

    if (legacyOnly) {
        // Old flows used `complete` to mean "validated" (plan config) or "completed" (execution).
        // When we don't have per-plan rows, prefer treating it as validation.
        return {
            execution: '',
            validation: legacySessionStatus === 'complete' ? 'validated' : 'invalid',
        }
    }

    return {
        execution: inferredExecution,
        validation: inferredValidation || 'invalid',
    }
}
// ============================================================
// HELPERS UTILITAIRES
// ============================================================

// Lit l'URL de FastAPI depuis .env
function getFastApiBaseUrl() {
    return String(process.env.FASTAPI_BASE_URL || "http://localhost:8000").replace(/\/$/, "");
}

const TEST_STATUS_VALUES = new Set(["Draft", "Generating", "Incomplete", "Ready", "Passed", "Failed"])

function normalizeTestStatus(value) {
    const raw = String(value || '').trim()
    if (!raw) return ''
    // preserve canonical casing for UI consistency
    const match = [...TEST_STATUS_VALUES].find((v) => v.toLowerCase() === raw.toLowerCase())
    return match || ''
}

async function updateTestSuiteStatus(testSuiteId, nextStatus) {
    const id = String(testSuiteId || '').trim()
    const status = normalizeTestStatus(nextStatus)
    if (!id) {
        const error = new Error('TestSuite id is required')
        error.statusCode = 400
        throw error
    }
    if (!status) {
        const error = new Error('Invalid status')
        error.statusCode = 400
        throw error
    }

    const suite = await TestSuite.findById(id).select('_id testStatus savedAt executedAt lastGeneratedAt')
    if (!suite) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }

    const current = String(suite.testStatus || 'Draft')
    if ((status === 'Passed' || status === 'Failed') && current !== 'Ready') {
        const error = new Error('Only Ready tests can be marked Passed/Failed')
        error.statusCode = 409
        throw error
    }

    const update = { testStatus: status }
    const now = new Date()

    if (status === 'Draft') {
        update.savedAt = null
        update.executedAt = null
    }
    if (status === 'Generating') {
        // keep timestamps as-is; generation may resume
    }
    if (status === 'Incomplete') {
        update.lastGeneratedAt = now
    }
    if (status === 'Ready') {
        update.savedAt = now
    }
    if (status === 'Passed' || status === 'Failed') {
        update.executedAt = now
    }

    const updated = await TestSuite.findByIdAndUpdate(id, update, { new: true })
        .select('_id testStatus lastGeneratedAt savedAt executedAt')
        .lean()

    return updated
}

async function markTestSuiteSaved(testSuiteId) {
    const id = String(testSuiteId || '').trim()
    if (!id) {
        const error = new Error('TestSuite id is required')
        error.statusCode = 400
        throw error
    }
    const now = new Date()
    const updated = await TestSuite.findByIdAndUpdate(
        id,
        { testStatus: 'Ready', savedAt: now },
        { new: true }
    )
        .select('_id testStatus lastGeneratedAt savedAt executedAt')
        .lean()

    if (!updated) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }
    return updated
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
        MESSAGES.TESTSUITE.FAILED;
    const normalized = new Error(message);
    normalized.statusCode = status || 500;
    normalized.code = error?.code || MESSAGES.TESTSUITE.ERROR;
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
// FONCTION PRINCIPALE 3 : Créer ou mettre à jour une TestSuite
// ============================================================
async function createOrUpdateTestSuite({
    providedTestSuiteId,
    userId,
    projectId,
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
        projectId,
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

    } else {
        await TestSuite.findByIdAndUpdate(testSuiteId, { planSteps: [] });
    }

    // Étape 5 : La génération de plan a été déplacée vers le service Python FastAPI
    const error = new Error("Plan generation has been moved to Python FastAPI service. Use /generate-plan endpoint instead.");
    error.statusCode = 410; // Gone
    throw error;
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

    return { plans: [], steps: [] };
}


async function getTestSuitesByUser(userId) {
    const safeUserId = String(userId || '').trim();
    // Public listing mode: return all suites regardless of connected user.
    // Keep the same function signature/endpoint for frontend compatibility.

    // 1️⃣ Trouver les projets accessibles
    const projects = await Project.find({
        $or: [
            { ownerId: safeUserId },
            { assignedUsers: safeUserId }
        ]
    }).select('_id title').lean();

    const projectIds = (projects || []).map(p => p._id).filter(Boolean);

    const suites = await TestSuite.find({
        $or: [
            { projectId: { $in: projectIds } },
            { projectId: null, userId: safeUserId },
        ],
    })
        .select('_id nom nametest description specFileName urlCible testPlans testCasesByPlan testStatus lastGeneratedAt savedAt executedAt sessionStatus planStatuses sessionSavedAt validationStatus validationPlanStatuses validationSavedAt executionStatus executionPlanStatuses executionSavedAt lastActionBy createdAt userId projectId')
        .populate('userId', 'name email picture')
        .populate('projectId', 'title')
        .sort({ createdAt: -1 })
        .lean()

    return suites.map((suite) => {
        const totalTestCases = (suite.testCasesByPlan || []).reduce((acc, plan) => {
            return acc + ((plan?.testCases || []).length || 0)
        }, 0)

        const populatedProject = suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
        const normalizedProjectId = populatedProject ? populatedProject._id : suite?.projectId || null
        const projectTitle = populatedProject ? String(populatedProject.title || '').trim() : ''

        return {
            ...suite,
            projectId: normalizedProjectId,
            projectTitle,
            creatorName: suite?.userId?.name || suite?.userId?.email || suite?.userId?.picture || 'Unknown User',
            totalTestCases,
            status: computeSuiteStatusKey(suite),
        }
    })
}

async function getAllTestSuites(viewerUserId) {
    const safeUserId = String(viewerUserId || '').trim();

    const projects = safeUserId
        ? await Project.find({
            $or: [
                { ownerId: safeUserId },
                { assignedUsers: safeUserId }
            ]
        }).select('_id').lean()
        : [];

    const accessibleProjectIds = new Set((projects || []).map((p) => String(p?._id || '').trim()).filter(Boolean));

    const suites = await TestSuite.find({})
        .select('_id nom nametest description specFileName specFilePath urlCible testPlans testCasesByPlan testStatus lastGeneratedAt savedAt executedAt sessionStatus planStatuses sessionSavedAt validationStatus validationPlanStatuses validationSavedAt executionStatus executionPlanStatuses executionSavedAt lastActionBy createdAt userId projectId')
        .populate('userId', 'name email picture')
        .populate('projectId', 'title')
        .sort({ createdAt: -1 })
        .lean()

    return suites.map((suite) => {
        const totalTestCases = (suite.testCasesByPlan || []).reduce((acc, plan) => {
            return acc + ((plan?.testCases || []).length || 0)
        }, 0)

        const populatedProject = suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
        const normalizedProjectId = populatedProject ? populatedProject._id : suite?.projectId || null
        const projectTitle = populatedProject ? String(populatedProject.title || '').trim() : ''

        const rawUser = suite?.userId && typeof suite.userId === 'object' ? suite.userId : null
        const creatorName = rawUser?.name || rawUser?.email || 'Unknown User'
        const picture = rawUser?.picture || null

        const projectIdStr = normalizedProjectId ? String(normalizedProjectId) : ''
        const canOpen = projectIdStr
            ? accessibleProjectIds.has(projectIdStr)
            : (safeUserId && String(rawUser?._id || suite?.userId || '').trim() === safeUserId)

        return {
            ...suite,
            projectId: normalizedProjectId,
            projectTitle,
            creatorName,
            picture,
            canOpen: Boolean(canOpen),
            totalTestCases,
            status: computeSuiteStatusKey(suite),
        }
    })
}

async function getTestSuiteById(testSuiteId, viewerUserId) {
    const safeTestSuiteId = String(testSuiteId || '').trim()
    if (!safeTestSuiteId) {
        const error = new Error('TestSuite id is required')
        error.statusCode = 400
        throw error
    }

    const suite = await TestSuite.findById(safeTestSuiteId)
        .select('_id nom nametest description specFileName specFilePath urlCible testPlans testCasesByPlan testStatus lastGeneratedAt savedAt executedAt sessionStatus planStatuses sessionSavedAt validationStatus validationPlanStatuses validationSavedAt executionStatus executionPlanStatuses executionSavedAt lastActionBy createdAt userId projectId')
        .populate('userId', 'name email picture')
        .populate({
            path: 'projectId',
            select: 'title startDate endDate milestoneDate assignedUsers ownerId',
            populate: [
                { path: 'assignedUsers', select: 'name email picture' },
                { path: 'ownerId', select: 'name email picture' },
            ],
        })
        .lean()

    if (!suite) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }

    const totalTestCases = (suite.testCasesByPlan || []).reduce((acc, plan) => {
        return acc + ((plan?.testCases || []).length || 0)
    }, 0)

    const populatedProject = suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
    const normalizedProjectId = populatedProject ? populatedProject._id : suite?.projectId || null
    const projectTitle = populatedProject ? String(populatedProject.title || '').trim() : ''

    const rawUser = suite?.userId && typeof suite.userId === 'object' ? suite.userId : null
    const creatorName = rawUser?.name || rawUser?.email || 'Unknown User'
    const picture = rawUser?.picture || null

    // Middleware already validated access, but keep a safe canOpen flag for UI.
    const safeViewerUserId = String(viewerUserId || '').trim()
    const canOpen = Boolean(safeViewerUserId)

    return {
        ...suite,
        projectId: normalizedProjectId ? populatedProject || normalizedProjectId : null,
        projectTitle,
        creatorName,
        picture,
        canOpen,
        totalTestCases,
        status: computeSuiteStatusKey(suite),
    }
}

async function getTestPlansByTestSuiteId(testSuiteId) {
    const suite = await TestSuite.findById(testSuiteId)
        .select('_id testPlans testCasesByPlan testStatus lastGeneratedAt savedAt executedAt sessionStatus planStatuses sessionSavedAt validationStatus validationPlanStatuses validationSavedAt executionStatus executionPlanStatuses executionSavedAt lastActionBy')

    if (!suite) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }

    // Normalize plan IDs to prevent collisions (old suites may contain empty/duplicate ids).
    const used = new Set()
    let changed = false
    const normalizedPlans = (Array.isArray(suite.testPlans) ? suite.testPlans : []).map((p, idx) => {
        const fallbackId = `TP-${idx + 1}`
        const baseId = String(p?.id || p?.planId || '').trim() || fallbackId
        let nextId = baseId
        let suffix = 2
        while (!nextId || used.has(nextId)) {
            nextId = `${baseId}-${suffix++}`
        }
        if (String(p?.id || '').trim() !== nextId) changed = true
        used.add(nextId)
        return {
            id: nextId,
            title: String(p?.title || `Test Plan ${idx + 1}`).trim(),
            description: String(p?.description || '').trim(),
        }
    })

    if (changed) {
        suite.testPlans = normalizedPlans
        await suite.save()
    }

    return {
        testSuiteId: String(suite._id),
        testPlans: normalizedPlans,
        testCasesByPlan: suite.testCasesByPlan || [],
        testStatus: suite.testStatus || 'Draft',
        lastGeneratedAt: suite.lastGeneratedAt || null,
        savedAt: suite.savedAt || null,
        executedAt: suite.executedAt || null,
        sessionStatus: suite.sessionStatus || 'incomplete',
        planStatuses: suite.planStatuses || [],
        sessionSavedAt: suite.sessionSavedAt || null,
        validationStatus: suite.validationStatus || 'invalid',
        validationPlanStatuses: suite.validationPlanStatuses || [],
        validationSavedAt: suite.validationSavedAt || null,
        executionStatus: suite.executionStatus || null,
        executionPlanStatuses: suite.executionPlanStatuses || [],
        executionSavedAt: suite.executionSavedAt || null,
    }
}

async function saveSuiteSession(testSuiteId, payload = {}) {
    const planStatusesInput = payload?.planStatuses || {}
    const rawRows = Object.entries(planStatusesInput)
        .map(([planId, status]) => ({
            planId: String(planId || '').trim(),
            status: String(status || '').toLowerCase().trim(),
        }))
        .filter((item) => item.planId && item.status)

    const providedKind = String(payload?.sessionKind || payload?.kind || '').toLowerCase().trim()
    const hasExecutionRows = rawRows.some((r) => ['completed', 'incomplete'].includes(r.status))
    const sessionKind =
        providedKind === 'validation' || providedKind === 'execution'
            ? providedKind
            : (hasExecutionRows ? 'execution' : 'validation')

    const now = new Date()
    const update = {
        sessionSavedAt: now,
        // Enterprise lifecycle status: clicking save marks generated content as Ready
        testStatus: 'Ready',
        savedAt: now,
    }

    // Fetch current suite to merge test cases (don't lose existing ones)
    const currentSuite = await TestSuite.findById(testSuiteId).select('testPlans testCasesByPlan')
    const existingCases = Array.isArray(currentSuite?.testCasesByPlan) ? currentSuite.testCasesByPlan : []
    const existingPlans = Array.isArray(currentSuite?.testPlans) ? currentSuite.testPlans : []

    if (sessionKind === 'execution') {
        const executionPlanStatuses = rawRows
            .filter((r) => ['completed', 'incomplete'].includes(r.status))
            .map((r) => ({ planId: r.planId, status: r.status }))

        const executionStatus =
            ['completed', 'incomplete'].includes(String(payload?.suiteStatus || '').toLowerCase().trim())
                ? String(payload.suiteStatus).toLowerCase().trim()
                : (executionPlanStatuses.length > 0 && executionPlanStatuses.every((r) => r.status === 'completed'))
                    ? 'completed'
                    : 'incomplete'

        update.executionStatus = executionStatus
        update.executionPlanStatuses = executionPlanStatuses
        update.executionSavedAt = now

        // Backward compatibility: keep old fields for execution only.
        update.sessionStatus = executionStatus === 'completed' ? 'complete' : 'incomplete'
        update.planStatuses = executionPlanStatuses
    } else {
        const validationPlanStatuses = rawRows
            .filter((r) => ['pending', 'generating', 'reviewing', 'confirmed', 'rejected'].includes(r.status))
            .map((r) => ({ planId: r.planId, status: r.status }))

        update.validationStatus = computeValidationStatus({
            testPlans: existingPlans,
            testCasesByPlan: existingCases,
            savedAt: now,
        })
        update.validationPlanStatuses = validationPlanStatuses
        update.validationSavedAt = now
    }

    // Merge test cases instead of replacing (fix for losing test cases)
    if (payload?.testCasesByPlan && Array.isArray(payload.testCasesByPlan)) {
        const incomingCases = payload.testCasesByPlan
        
        // Create a map of existing cases by planId
        const casesByPlanId = {}
        existingCases.forEach(block => {
            if (block?.planId) {
                casesByPlanId[block.planId] = block
            }
        })
        
        // Merge incoming cases (update or add)
        incomingCases.forEach(block => {
            if (block?.planId) {
                casesByPlanId[block.planId] = block
            }
        })
        
        // Convert back to array
        update.testCasesByPlan = Object.values(casesByPlanId)
    }

    if (sessionKind !== 'execution') {
        update.validationStatus = computeValidationStatus({
            testPlans: update.testPlans || existingPlans,
            testCasesByPlan: update.testCasesByPlan || existingCases,
            savedAt: now,
        })
    }

    const suite = await TestSuite.findByIdAndUpdate(
        testSuiteId,
        update,
        { new: true }
    )

    if (!suite) {
        const error = new Error('TestSuite not found')
        error.statusCode = 404
        throw error
    }

    return suite
}

async function getTestSuitesByProject(projectId) {
    const safeProjectId = String(projectId || '').trim();

    const suites = await TestSuite.find({
        projectId: safeProjectId,
    })
        .select('_id nom nametest description specFileName specFilePath urlCible testPlans testCasesByPlan testStatus lastGeneratedAt savedAt executedAt sessionStatus planStatuses sessionSavedAt validationStatus validationPlanStatuses validationSavedAt executionStatus executionPlanStatuses executionSavedAt lastActionBy createdAt userId projectId')
        .populate('userId', 'name email picture')
        .populate('projectId', 'title')
        .sort({ createdAt: -1 })
        .lean()

    return suites.map((suite) => {
        const totalTestCases = (suite.testCasesByPlan || []).reduce((acc, plan) => {
            return acc + ((plan?.testCases || []).length || 0)
        }, 0)

        const populatedProject = suite?.projectId && typeof suite.projectId === 'object' ? suite.projectId : null
        const normalizedProjectId = populatedProject ? populatedProject._id : suite?.projectId || null
        const projectTitle = populatedProject ? String(populatedProject.title || '').trim() : ''

        return {
            ...suite,
            totalTestCases,
            projectTitle,
            projectId: normalizedProjectId,
            status: computeSuiteStatusKey(suite),
        }
    })
}

module.exports = {
    generatePlan,
    getPlanByTestSuiteId,
    getAllTestSuites,
    getTestSuiteById,
    getTestSuitesByUser,
    getTestSuitesByProject,
    getTestPlansByTestSuiteId,
    saveSuiteSession,
    updateTestSuiteStatus,
    markTestSuiteSaved,
    parseBoolean,
};
