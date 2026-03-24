const aiService = require("../services/ai.service");
const PlanTest = require("../models/plantest");
const TestSuite = require("../models/testsuite");

/*exports.generatePlan = async (req, res) => {
  try {
    const { testSuiteId, regenerate } = req.body;

    // récupérer la TestSuite
    const suite = await TestSuite.findById(testSuiteId);

    if (!suite) {
      return res.status(404).json({ message: "TestSuite not found" });
    }

    // Retourner le plan existant si déjà généré (évite de consommer la quota Gemini)
    if (!regenerate) {
      const existing = await PlanTest.find({ testSuiteId }).sort({ ordre: 1 });
      if (existing.length) {
        return res.json(existing);
      }
    } else {
      await PlanTest.deleteMany({ testSuiteId });
    }

    // générer le plan avec AI
    const aiSteps = await aiService.generatePlanTest(
      suite.description,
      suite.urlCible
    );

    const docs = aiSteps.map((step, idx) => ({
      contenu: step,
      ordre: idx + 1,
      testSuiteId: testSuiteId,
    }));

    const plans = await PlanTest.insertMany(docs);
    res.json(plans);
  } catch (error) {
    const status = Number(error?.statusCode) || 500;
    if (error?.retryAfter) {
      res.setHeader("Retry-After", String(error.retryAfter));
    }
    res.status(status).json({
      error: error.message,
      code: error.code,
      retryAfter: error.retryAfter,
    });
  }*/

