const testSuiteService = require("../services/testsuite.service");
const MESSAGES = require('../constants/messages.js');

exports.create = async (req, res) => {
  try {
    const suite = await testSuiteService.createTestSuite(req.body);

    // 201 : Création réussie
    res.status(201).json(suite);

  } catch (error) {

    // 400 : Données invalides
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: MESSAGES.ERROR.BAD_REQUEST
      });
    }

    // 500 : Erreur serveur
    res.status(500).json({
      message: MESSAGES.ERROR.SERVER
    });
  }
};

exports.getAll = async (req, res) => {
  try {
    const viewerUserId = String(
      req.user?.userId || req.user?.id || req.user?._id || ''
    ).trim();

    const suites = await testSuiteService.getAllTestSuites(viewerUserId);

    // 200 : Succès
    res.status(200).json(suites);

  } catch (error) {
    // 500 : Erreur serveur
    res.status(500).json({ message: error.message });
  }
};

exports.getById = async (req, res) => {
  try {
    const viewerUserId = String(
      req.user?.userId || req.user?.id || req.user?._id || ''
    ).trim();

    const suite = await testSuiteService.getTestSuiteById(
      req.params.id,
      viewerUserId
    );

    // 200 : Succès
    res.status(200).json(suite);

  } catch (error) {
    // 404 / 400 / 500 selon service
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.getByUser = async (req, res) => {
  try {
    const userId = String(
      req.user?.userId || req.user?.id || req.user?._id || ''
    ).trim();

    const suites = await testSuiteService.getTestSuitesByUser(userId);

    // 200 : Succès
    res.status(200).json(suites);

  } catch (error) {
    // 500 : Erreur serveur
    res.status(500).json({ message: error.message });
  }
};

exports.getByProject = async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();

    // 400 : ID requis
    if (!projectId) {
      return res.status(400).json({
        message: MESSAGES.PROJECT.ID_REQUIRED
      });
    }

    const suites =
      await testSuiteService.getTestSuitesByProject(projectId);

    // 200 : Succès
    res.status(200).json(suites);

  } catch (error) {
    // 500 : Erreur serveur
    res.status(500).json({ message: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const suite = await testSuiteService.updateTestSuite(
      req.params.id,
      req.body
    );

    // 200 : Mise à jour réussie
    res.status(200).json(suite);

  } catch (error) {
    // 400 / 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.delete = async (req, res) => {
  try {
    await testSuiteService.deleteTestSuite(req.params.id);

    // 200 : Suppression réussie
    res.status(200).json({
      message:
        MESSAGES?.TESTSUITE?.DELETED ||
        'Test suite deleted successfully'
    });

  } catch (error) {
    // 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.getPlans = async (req, res) => {
  try {
    const result =
      await testSuiteService.getTestPlansByTestSuiteId(
        req.params.id
      );

    // 200 : Succès
    res.status(200).json(result);

  } catch (error) {
    // 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.saveSession = async (req, res) => {
  try {
    const suite = await testSuiteService.saveSuiteSession(req.params.id, req.body || {})
    res.json({
      message: MESSAGES?.TESTSUITE?.SESSION_SAVED || 'Session saved successfully',
      suite: {
        _id: suite._id,
        testStatus: suite.testStatus || 'Draft',
        lastGeneratedAt: suite.lastGeneratedAt || null,
        savedAt: suite.savedAt || null,
        executedAt: suite.executedAt || null,
        sessionStatus: suite.sessionStatus,
        planStatuses: suite.planStatuses || [],
        sessionSavedAt: suite.sessionSavedAt || null,
        validationStatus: suite.validationStatus || 'invalid',
        validationPlanStatuses: suite.validationPlanStatuses || [],
        validationSavedAt: suite.validationSavedAt || null,
        executionStatus: suite.executionStatus || null,
        executionPlanStatuses: suite.executionPlanStatuses || [],
        executionSavedAt: suite.executionSavedAt || null,
      },
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message })
  }
}

exports.updateStatus = async (req, res) => {
  try {
    const status = req.body?.status;

    const suite =
      await testSuiteService.updateTestSuiteStatus(
        req.params.id,
        status
      );

    // 200 : Succès
    res.status(200).json({ suite });

  } catch (error) {
    // 400 / 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.updateProject = async (req, res) => {
  try {
    const viewerUserId = String(
      req.user?.userId || req.user?.id || req.user?._id || ''
    ).trim();
    const role = String(req.user?.role || '').toLowerCase().trim();
    const projectId = req.body?.projectId ?? null;

    const suite = await testSuiteService.setTestSuiteProject(
      req.params.id,
      projectId,
      { viewerUserId, role }
    );

    res.status(200).json({ suite });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}


exports.save = async (req, res) => {
  try {
    const suite =
      await testSuiteService.markTestSuiteSaved(
        req.params.id
      );

    // 200 : Succès
    res.status(200).json({ suite });

  } catch (error) {
    // 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};

exports.execute = async (req, res) => {
  try {
    const result = String(
      req.body?.result || req.body?.status || ''
    ).trim();

    if (result) {
      const suite =
        await testSuiteService.updateTestSuiteStatus(
          req.params.id,
          result
        );

      // 200 : Exécution reçue
      return res.status(200).json({ suite });
    }

    // 501 : Non implémenté
    return res.status(501).json({
      message:
        'Execution not implemented. Provide {result:"Passed"|"Failed"} or integrate a Selenium runner.'
    });

  } catch (error) {
    // 400 / 404 / 500
    res.status(error.statusCode || 500).json({
      message: error.message
    });
  }
};
