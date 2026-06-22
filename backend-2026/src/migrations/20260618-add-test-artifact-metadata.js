const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.join(__dirname, '..', '..', '.env'),
  override: true,
})

const PLAN_DEFAULTS = {
  objective: '',
  scope: '',
  priority: 'medium',
  requirements: [],
}

const CASE_DEFAULTS = {
  objective: '',
  preconditions: [],
  test_data: null,
  priority: 'medium',
  severity: 'major',
  type: 'functional',
  requirements: [],
}

async function setMissingFields(collection, defaults) {
  const results = {}

  for (const [field, value] of Object.entries(defaults)) {
    const result = await collection.updateMany(
      { [field]: { $exists: false } },
      { $set: { [field]: value } }
    )
    results[field] = result.modifiedCount || 0
  }

  return results
}

async function migrateLegacyEmbeddedArrays(db) {
  const testSuites = db.collection('testsuites')

  const plansResult = await testSuites.updateMany(
    { testPlans: { $type: 'array' } },
    [
      {
        $set: {
          testPlans: {
            $map: {
              input: '$testPlans',
              as: 'plan',
              in: {
                $mergeObjects: [PLAN_DEFAULTS, '$$plan'],
              },
            },
          },
        },
      },
    ]
  )

  const casesResult = await testSuites.updateMany(
    { testCasesByPlan: { $type: 'array' } },
    [
      {
        $set: {
          testCasesByPlan: {
            $map: {
              input: '$testCasesByPlan',
              as: 'block',
              in: {
                $mergeObjects: [
                  '$$block',
                  {
                    testCases: {
                      $map: {
                        input: { $ifNull: ['$$block.testCases', []] },
                        as: 'testCase',
                        in: {
                          $mergeObjects: [CASE_DEFAULTS, '$$testCase'],
                        },
                      },
                    },
                  },
                ],
              },
            },
          },
        },
      },
    ]
  )

  return {
    embeddedTestPlans: plansResult.modifiedCount || 0,
    embeddedTestCasesByPlan: casesResult.modifiedCount || 0,
  }
}

async function runMigration() {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGODB_URL
  if (!mongoUri) {
    throw new Error('MONGODB_URI or MONGODB_URL is required')
  }

  await mongoose.connect(mongoUri)
  const db = mongoose.connection.db

  const [testPlans, testCases, legacy] = await Promise.all([
    setMissingFields(db.collection('testplans'), PLAN_DEFAULTS),
    setMissingFields(db.collection('testcases'), CASE_DEFAULTS),
    migrateLegacyEmbeddedArrays(db),
  ])

  return {
    testPlans,
    testCases,
    legacy,
  }
}

if (require.main === module) {
  runMigration()
    .then((summary) => {
      console.log('Test artifact metadata migration completed')
      console.log(JSON.stringify(summary, null, 2))
    })
    .catch((error) => {
      console.error('Test artifact metadata migration failed')
      console.error(error)
      process.exitCode = 1
    })
    .finally(async () => {
      await mongoose.disconnect().catch(() => {})
    })
}

module.exports = { runMigration }
