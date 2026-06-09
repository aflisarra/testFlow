const testPlanService = require('../services/testplan.service')
const TestSuite = require('../models/testsuite')

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
      message: 'TestPlan deleted successfully',
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
    console.error('🔥 CONTROLLER ERROR:', error.message)

    res.status(error.statusCode || 500).json({
      message: error.message,
    })
  }
}



exports.savePlans = async (req, res) => {
  try {
    console.log('BODY:', req.body)
    console.log('USER:', req.user)

    let {
      projectId,
      name,
      testPlans,
      specText,
      fileName
    } = req.body

    const userId =
      req.user?.userId ||
      req.user?.id ||
      req.user?._id

    // ✅ 1. PARSER JSON venant de FormData
    if (typeof testPlans === 'string') {
      try {
        testPlans = JSON.parse(testPlans)
      } catch (err) {
        console.error('❌ Failed to parse testPlans JSON:', err)
        testPlans = []
      }
    }

    // ✅ 2. normaliser
    if (!Array.isArray(testPlans)) {
      testPlans = testPlans?.testPlans || []
    }

    console.log('✅ testPlans after normalization:', testPlans)

    // ✅ validation
    if (!projectId || !name || !testPlans.length || !userId) {
      return res.status(400).json({
        message: 'Missing required fields',
        debug: {
          projectId,
          name,
          testPlansLength: testPlans?.length,
          userId
        }
      })
    }

    const file = req.file

    // ✅ extraction spec
    let finalSpecText = String(specText || '').trim() || null

    if (!finalSpecText && file) {
      try {
        const { readSpecTextFromUpload } = require('../services/ollama.service')
        const extracted = String(await readSpecTextFromUpload(file)).trim()
        finalSpecText = extracted || null
      } catch (e) {
        console.warn('Spec extraction failed:', e?.message || e)
        finalSpecText = null
      }
    }

    // ✅ save file (support buffer + path)
    const path = require('path')
    const fs = require('fs/promises')

    let specFilePath = null
    let specFileNameToStore = fileName || null

    if (file) {
      try {
        await fs.mkdir(path.join(process.cwd(), 'uploads', 'specs'), { recursive: true })

        const safeName = (file.originalname || 'spec')
          .replace(/[^a-zA-Z0-9.-]/g, '_')

        const filenameOnDisk = `${Date.now()}-${safeName}`
        const outPath = path.join(process.cwd(), 'uploads', 'specs', filenameOnDisk)

        const buffer = file.buffer || (file.path ? await fs.readFile(file.path) : null)

        if (buffer) {
          await fs.writeFile(outPath, buffer)
          specFilePath = `uploads/specs/${filenameOnDisk}`
          specFileNameToStore = file.originalname || specFileNameToStore
          console.log('✅ Uploaded spec saved to:', specFilePath)
        }

      } catch (e) {
        console.warn('Failed to persist uploaded spec file:', e?.message || e)
      }
    }

    // ✅ limiter taille texte
    const specTextToStore = finalSpecText
      ? String(finalSpecText).slice(0, 50_000)
      : null

    if (specTextToStore) {
      console.log(
        '✅ SpecText preview:',
        specTextToStore.slice(0, 200).replace(/\n/g, ' ')
      )
    }

      const urlCibleToStore = String(req.body?.urlCible || req.body?.url || '').trim() || null

      // ✅ créer test suite
      const suite = await TestSuite.create({
        projectId,
        nametest: name,
        nom: name,
        userId,
        specText: specTextToStore,
        specFileName: specFileNameToStore || null,
        specFilePath: specFilePath,
        urlCible: urlCibleToStore,
      })

    // ✅ créer plans
    const createdPlans = await Promise.all(
      testPlans.map((plan) =>
        testPlanService.createTestPlan({
          testSuiteId: suite._id,
          id: plan.id,
          title: plan.title,
          description: plan.description,
        })
      )
    )

    return res.status(200).json({
      testSuiteId: suite._id,
      plans: createdPlans,
    })

  } catch (error) {
    console.error('🔥 savePlans error FULL:', error)

    res.status(500).json({
      message: error.message,
    })
  }
}