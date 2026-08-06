const express = require('express');
const router = express.Router();
const controllerTestSuite = require('../controllers/testsuite.controller');
const controllerTestPlan = require('../controllers/testplan.controller');
const controllerTestCase = require('../controllers/testcase.controller');
const roleReviewController = require('../controllers/role-review.controller');
const specIngestController = require('../controllers/spec-ingest.controller');
const exportController = require('../controllers/export.controller');
const authenticateUser = require('../middleware/authenticateUser');
const { requireTestSuiteAccess } = require('../middleware/testsuite-access.middleware');

const multer = require('multer') // ✅ AJOUT
const upload = multer({ storage: multer.memoryStorage() }) // ✅ AJOUT
const { createSpecsUpload } = require('../utils/spec-upload')
const specUpload = createSpecsUpload()

function uploadSpecificationFile(req, res, next) {
  return specUpload.single('file')(req, res, (error) => {
    if (!error) return next()
    return res.status(400).json({
      message: error?.message || 'Unable to read the uploaded specification file.',
      code: 'SPEC_UPLOAD_FAILED',
    })
  })
}


router.use(authenticateUser);

router.post('/', controllerTestSuite.create);

router.get('/', controllerTestSuite.getAll);

router.get('/user/:userId', controllerTestSuite.getByUser);

router.get('/project/:projectId', controllerTestSuite.getByProject);
router.get('/executions/recent', controllerTestSuite.getRecentExecutions);
router.post('/ingest-spec', uploadSpecificationFile, specIngestController.ingest);

router.get('/plans/:id', controllerTestPlan.getById);
router.put('/plans/:id', controllerTestPlan.update);
router.delete('/plans/:id', controllerTestPlan.delete);

router.post('/plans/:testPlanId/cases', (req, res) => {
  req.body = { ...req.body, planId: req.params.testPlanId };
  return controllerTestCase.create(req, res);
});
router.get('/plans/:testPlanId/cases', controllerTestCase.getByPlan);
router.put('/cases/:id', controllerTestCase.update);
router.delete('/cases/:id', controllerTestCase.delete);

router.get('/:id/plans', requireTestSuiteAccess, controllerTestSuite.getPlans);
router.get('/:id/executions', requireTestSuiteAccess, controllerTestSuite.getExecutions);
router.post('/:id/plans', requireTestSuiteAccess, (req, res) => {
  req.body = { ...req.body, testSuiteId: req.params.id };
  return controllerTestPlan.create(req, res);
});
router.post('/:id/ingest-spec', requireTestSuiteAccess, uploadSpecificationFile, specIngestController.reingest);
router.post('/:id/generate-plan', requireTestSuiteAccess, specIngestController.generatePlan);

router.get('/:id/role-reviews', requireTestSuiteAccess, roleReviewController.list);
router.patch('/:id/role-reviews/:itemId', requireTestSuiteAccess, roleReviewController.resolve);
router.delete('/:id/role-reviews/:itemId', requireTestSuiteAccess, roleReviewController.dismiss);

router.patch('/:id/session', requireTestSuiteAccess, controllerTestSuite.saveSession);
router.patch('/:id/status', requireTestSuiteAccess, controllerTestSuite.updateStatus);
router.patch('/:id/save', requireTestSuiteAccess, controllerTestSuite.save);
router.patch('/:id/project', requireTestSuiteAccess, controllerTestSuite.updateProject);
router.post('/:id/execute', requireTestSuiteAccess, controllerTestSuite.execute);

// Export Word (.docx)
// POST /api/testsuites/:id/export-word
router.post('/:id/export-word', requireTestSuiteAccess, exportController.exportWord);
// Backward-friendly alias
router.get('/:id/export-word', requireTestSuiteAccess, exportController.exportWord);

router.get('/:id', requireTestSuiteAccess, controllerTestSuite.getById);

router.put('/:id', requireTestSuiteAccess, controllerTestSuite.update);

router.delete('/:id', requireTestSuiteAccess, controllerTestSuite.delete);

router.post(
  '/preview',
  upload.single('file'), // ✅ maintenant défini
  controllerTestPlan.generatePreview
);

router.post('/save-plans', upload.single('file'), controllerTestPlan.savePlans);


module.exports = router;
