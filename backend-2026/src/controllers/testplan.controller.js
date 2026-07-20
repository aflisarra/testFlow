const testPlanService = require('../services/testplan.service')
const TestSuite = require('../models/testsuite')
const TestPlan = require('../models/testplan.model')
const TestCase = require('../models/testcase.model')
const MESSAGES = require('../constants/messages.js')
exports.create = async (req, res) => {
  try {
    const plan = await testPlanService.createTestPlan(req.body)

    res.status(201).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.getBySuite = async (req, res) => {
  try {
    const plans = await testPlanService.getPlansBySuite(
      req.params.testSuiteId
    )

    res.status(200).json(plans)
  } catch (error) {
    res.status(500).json({ message: error.message })
  }
}

exports.getById = async (req, res) => {
  try {
    const plan = await testPlanService.getPlanById(req.params.id)

    res.status(200).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.update = async (req, res) => {
  try {
    const plan = await testPlanService.updateTestPlan(
      req.params.id,
      req.body
    )

    res.status(200).json(plan)
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}

exports.delete = async (req, res) => {
  try {
    await testPlanService.deleteTestPlan(req.params.id)

    res.status(200).json({
      message: MESSAGES.TESTPLAN.DELEDTED,
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}
exports.generatePreview = async (req, res) => {
  try {
    const { styleConfig, applicationUrl } = req.body
    const file = req.file

    const testPlans = await require('../services/testplan.service')
      .generateTestPlansPreview({
        file,
        styleConfig,
        applicationUrl,
      })

    return res.status(200).json({
      testPlans,
    })

  } catch (error) {
    console.error(MESSAGES.TESTPLAN.CONTROLLER_ERROR, error.message)

    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}



exports.savePlans = async (req, res) => {
  try {
    let {
      projectId,
      name,
      testPlans,
      specText,
      fileName,
      testSuiteId // ✅ IMPORTANT
    } = req.body
console.log(MESSAGES.TESTPLAN.TESTPLAN_RECEIVED, testPlans)
console.log(MESSAGES.CONSOLE.TYPE, typeof testPlans)
    const userId =
      req.user?.userId ||
      req.user?.id ||
      req.user?._id

    // ✅ parse JSON
    if (typeof testPlans === MESSAGES.CONSOLE.STRING) {
      testPlans = JSON.parse(testPlans)
    }

    if (!Array.isArray(testPlans)) {
      testPlans = testPlans?.testPlans || []
    }

    if (!projectId || !name || !testPlans.length || !userId) {
      return res.status(400).json({
        message: MESSAGES.CONSOLE.MISSING
      })
    }

    const file = req.file

    // ✅ SPEC TEXT
    let finalSpecText = String(specText || '').trim() || null

    if (!finalSpecText && file) {
      const { readSpecTextFromUpload } = require('../services/ollama.service')
      finalSpecText = await readSpecTextFromUpload(file)
    }

    const specTextToStore = finalSpecText
      ? String(finalSpecText).slice(0, 50000)
      : null

    const urlCibleToStore = String(req.body?.urlCible || '').trim() || null

    let suite

    // ✅ ✅ ✅ UPDATE
    if (testSuiteId) {
      suite = await TestSuite.findById(testSuiteId)

      if (!suite) {
        return res.status(404).json({ message: MESSAGES.TESTSUITE.NOT_FOUND })
      }

      suite.nametest = name
      suite.nom = name
      suite.specText = specTextToStore
      suite.specFileName = fileName || suite.specFileName
      suite.urlCible = urlCibleToStore

      await suite.save()

      // ✅ IMPORTANT : supprimer anciens plans et cases liés
      await TestCase.deleteMany({ testSuiteId: suite._id })
      await TestPlan.deleteMany({ testSuiteId: suite._id })

    } else {
      // ✅ ✅ ✅ CREATE

      suite = await TestSuite.create({
        projectId,
        nametest: name,
        nom: name,
        userId,
        specText: specTextToStore,
        specFileName: fileName,
        urlCible: urlCibleToStore,
      })
    }

    // ✅ CREATE NEW PLANS
    const createdPlans = await Promise.all(
      testPlans.map(plan =>
        testPlanService.createTestPlan({
          testSuiteId: suite._id,
          id: plan.id,
          title: plan.title,
          description: plan.description,
          objective: plan.objective,
          scope: plan.scope,
          priority: plan.priority,
          requirements: plan.requirements,
        })
      )
    )

    return res.status(200).json({
      testSuiteId: suite._id,
      plans: createdPlans,
    })

  } catch (error) {
    console.error(MESSAGES.TESTPLAN.ERROR_SAVE_PLAN, error)
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}
