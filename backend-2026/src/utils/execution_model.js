function text(value) {
  return String(value || '').trim()
}

// ✅ ✅ ✅ FALLBACK MODEL
function buildFallbackExecutionModel(testCase) {
  const steps = Array.isArray(testCase?.steps) ? testCase.steps : []

  return {
    version: 'execution-model/v1',
    source: {
      test_case_id: text(testCase?.id),
      title: text(testCase?.title)
    },
    steps: steps.map((step, index) => ({
      id: `S${index + 1}`,
      raw: text(step),
      channel: 'ui',

      // ✅ rule simple mais efficace
      action:
        text(step).toLowerCase().includes('submit') ||
        text(step).toLowerCase().includes('click')
          ? 'click'
          : text(step).toLowerCase().includes('open')
          ? 'navigate'
          : text(step).toLowerCase().includes('fill')
          ? 'type'
          : 'unknown',

      target: {
        kind: 'element',
        name: 'auto'
      }
    })),

    expected_result: text(testCase?.expected_result),
    confidence: 'fallback'
  }
}

// ✅ EXISTING
const axios = require('axios')

async function resolveExecutionModel(testCase) {

  try {

    const resp = await axios.post(
      "http://localhost:8000/translator/translate",
      {
        test_case_id: testCase.id,
        title: testCase.title,
        steps: testCase.steps,
        expected_result: testCase.expected_result || "",
        context: {
          baseUrl: testCase.baseUrl || testCase.url || ""
        }
      }
    )

    const model = resp.data?.executionModel || resp.data?.execution_model

    if (model && model.steps && model.steps.length) {
      console.log("🤖 AI MODEL USED ✅")
      return model
    }

    return null

  } catch (err) {

    console.log("❌ AI FAILED → fallback", err.message)

    return null
  }
}


module.exports = {
  resolveExecutionModel,
  buildFallbackExecutionModel
}