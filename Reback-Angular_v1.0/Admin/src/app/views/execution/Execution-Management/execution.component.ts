import { ApiService } from '@/app/core/services/api.service';
import { SeleniumRunnerService, type SeleniumStepResultDto } from '@/app/core/services/selenium-runner.service';
import type { ExecutionModelDto, ExecutionModelStepDto, TestCaseDto, TestExecutionDto, TestSuiteDto } from '@/app/core/services/testlab.service';
import { TestLabService } from '@/app/core/services/testlab.service';
import { CommonModule } from '@angular/common';


import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  OnInit,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom, interval, Subscription } from 'rxjs';

import type {
  ExecutionStep,
  LogLine,
  StepStatus,
  TestScenario,
  TestStatus,
} from '@/app/interfaces/execution.interface';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type LoadedExecutionTestCase = {
  id: string
  title: string
  steps: string[]
  stepDetails?: Array<{
    step: string
    expected_result?: string
    actual_result?: string
    status?: string
  }>
  urlCible: string
  executionModel?: ExecutionModelDto | null
  test_data?: unknown
  credentials?: {
    email?: string
    password?: string
    apiToken?: string
    token?: string
  }
}

type RawExecutionLog = {
  stepIndex?: number
  level?: string
  message?: string
  data?: Record<string, unknown>
}
type DetectorRecommendation = {
  error: string
  rootCause?: string
  whatHappened?: string
  example?: string
  fix: string
}
type DetectorTimelineItem = { step?: number; action?: string; result?: string }
type DetectFailureData = {
  title?: string;
  description?: string;
  rootCause?: string;
  confidence?: number;
  failedStepName?: string;
  aiActionSummary?: string;
  actionLabel?: string;
  actionText?: string;
  recommendations?: DetectorRecommendation[];
  diagnosticTips?: string[];
  suggestedSelectors?: string[];
  summary?: string;
  whatHappened?: string;
  simpleExplanation?: string;
  example?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
  whyItFailed?: string;
  severity?: string;
  evidence?: string[];
  timeline?: DetectorTimelineItem[];
  developerFix?: string[];
  testerFix?: string[];
}
type DetectFailureResponse = {
  data?: DetectFailureData;
} & DetectFailureData;

type DetectorInsight = {
  title: string
  description: string
  actionLabel: string
  actionText: string
  recommendations: DetectorRecommendation[]
  rootCause?: string
  confidence?: number
  failedStepName?: string
  aiActionSummary?: string
  diagnosticTips?: string[]
  suggestedSelectors?: string[]
  summary?: string
  whatHappened?: string
  simpleExplanation?: string
  example?: string
  expectedBehavior?: string
  actualBehavior?: string
  whyItFailed?: string
  severity?: string
  evidence?: string[]
  timeline?: DetectorTimelineItem[]
  developerFix?: string[]
  testerFix?: string[]
}

type DOMElement = {
  ariaExpanded?: string
  ariaHaspopup?: string
  ariaLabel?: string
  classes?: string
  disabled?: boolean
  form?: string
  href?: string
  id?: string
  index?: number
  name?: string
  placeholder?: string
  rect?: { height: number; width: number; x: number; y: number }
  role?: string
  tag: string
  testId?: string
  text?: string
  title?: string
  type?: string
  value?: string
  visible: boolean
}
type EditableAiAction = {
  uid: string
  stepIndex: number
  type: string
  selector: string
  value: string
  originalType: string
  originalSelector: string
  originalValue: string
  isEdited: boolean
}

type ExecutionFilters = {
  project: string
  suite: string
  testPlan: string
  testCase: string
}

@Component({
  selector: 'app-execution',
  standalone: true,
  imports: [CommonModule , FormsModule],
  templateUrl: './execution.component.html',
  styleUrls: ['./execution.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionComponent implements OnInit {
  private metricsSubscription?: Subscription;
  private logStreamSubscription?: Subscription;
  private runSubscription?: Subscription;
  private fakeTimelineSubscription?: Subscription;
  private liveRunTimer?: ReturnType<typeof setInterval>;
  private domExtractionInterval?: ReturnType<typeof setInterval>;
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private testLabService = inject(TestLabService);
  private seleniumRunner = inject(SeleniumRunnerService);
  private api = inject(ApiService);
  private seleniumRunnerService = inject(SeleniumRunnerService);
  private autoAnalysisRequestedForExecutionId: string | null = null;

  activeTab: 'timeline' | 'logs' | 'screenshot' = 'timeline';
private isAborted = false;
  /*metrics: NodeMetrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 };*/

  streamedLogs: LogLine[] = [];
  private rawExecutionLogs: RawExecutionLog[] = [];
  detectorInsight: DetectorInsight | null = null;
  isAnalyzingFailure = false;
  domElements: DOMElement[] = [];
  domSourceUrl = '';
  selectedDomElement: DOMElement | null = null;
  streamIndex = 0;
private currentExecutionId: string | null = null;

  scenario: TestScenario = this.buildPassScenario();
  isStreaming = false;
  private suiteId = '';
  private planId = '';
  private testCaseId = '';
  private loadedTestCase: LoadedExecutionTestCase | null = null;
  private loadedPlanTestCases: LoadedExecutionTestCase[] = [];
  private pendingActionOverrides: EditableAiAction[] = [];
  recentRuns: TestExecutionDto[] = [];
  liveRun: TestExecutionDto | null = null;
  recentRunsPage = 1;
  readonly recentRunsPageSize = 5;
  screenshotUrl: string | null = null;
  selectedScreenshotUrl: string | null = null;
  executionModelSummary = 'execution-model/v1 pending';
  currentScreenshotIndex = 0;
  currentScreenshots: string[] = [];
  snackbarMessage: string | null = null;
  isExportingReport = false;

private snackbarTimer?: ReturnType<typeof setTimeout>;

  private readonly PASS_LOGS: LogLine[] = [
    { index: 1, level: 'INFO', message: 'Initializing remote driver session' },
    { index: 2, level: 'INFO', message: 'Capabilities verified: { browserName: chrome, headless: false }' },
    { index: 3, level: 'SUCCESS', message: 'Session 82d1b9-af70 established' },
    { index: 4, level: 'INFO', message: 'Setting window size to 1920×1080' },
    { index: 5, level: 'INFO', message: 'Command: window.resizeTo(1920, 1080)' },
    { index: 6, level: 'INFO', message: 'Received response from chromeDriver: 200 OK' },
    { index: 7, level: 'INFO', message: 'Command: navigate_to("staging.app/login")' },
    { index: 8, level: 'WARN', message: 'WAIT awaiting document_load_state' },
    { index: 9, level: 'TRACE', message: 'DNS Resolution: staging.app → 104.22.6.192' },
    { index: 10, level: 'TRACE', message: 'TLS handshake: TLS 1.3' },
    { index: 11, level: 'SUCCESS', message: 'Page loaded in 1.2s' },
    { index: 12, level: 'SUCCESS', message: 'Credentials submitted successfully' },
    { index: 13, level: 'SUCCESS', message: 'Dashboard element detected. Test PASSED' },
    { index: 14, level: 'INFO', message: 'Session terminated. Clean-up complete' },
  ];

  private readonly FAIL_LOGS: LogLine[] = [
    { index: 1, level: 'INFO', message: 'Starting Selenium Grid Session: 84e99-ba...' },
    { index: 2, level: 'INFO', message: 'Navigating to staging.testarch.app/login' },
    { index: 3, level: 'INFO', message: 'Entering credentials for user: qa_engineer_1' },
    { index: 4, level: 'INFO', message: 'Waiting for element visibility: #submit-btn' },
    { index: 5, level: 'FAIL', message: 'ElementNotInteractableException: element not interactable at (742, 460)' },
    { index: 6, level: 'ERROR', message: 'StackTrace: selenium.common.exceptions.ElementNotInteractableException' },
    { index: 7, level: 'INFO', message: 'Capturing failure screenshot: /artifacts/shots/fail_9421.png' },
    { index: 8, level: 'INFO', message: 'Session terminated. Clean-up complete' },
  ];

ngOnInit(): void {
  this.route.queryParamMap.subscribe((qp) => {
    const suiteId = String(qp.get('suiteId') || '').trim();
    const planId = String(qp.get('planId') || '').trim();
    const projectName = qp.get('projectName');
    const suiteName = qp.get('suiteName');
    const planName = qp.get('planName');
    const testCaseName = qp.get('testCaseName');
    this.loadProjects();

    this.route.paramMap.subscribe((pp) => {
      const testCaseId = String(pp.get('id') || '').trim();
      this.suiteId = suiteId;
      this.planId = planId;
      this.testCaseId = testCaseId;

      if (projectName || suiteName || planName || testCaseName) {
        this.scenario = {
          ...this.scenario,
          projectName: projectName || this.scenario.projectName,
          suiteName: suiteName || this.scenario.suiteName,
          planName: planName || this.scenario.planName,
          caseName: testCaseName || this.scenario.caseName,
        };
      }

      this.cdr.markForCheck();

      // ─── MODE PLAN : suiteId + planId, pas de testCaseId ───
      if (suiteId && planId && !testCaseId) {
        void this.loadAndRunPlan();
      } else {
        void this.loadAndRun();
      }

      void this.loadRecentRuns();
    });
  });
}

  // ─── Public actions ────────────────────────────────────────────────────────

  toggleScenario(): void { this.rerun(); }

  rerun(): void {
    this.stopAll();
    void this.executeLoadedTestCase();
  }

  runPlan(): void {
    this.stopAll();
    void this.executeLoadedPlan();
  }

  abort(): void {
  this.isAborted = true;
  this.stopAll();

  const executionId = this.currentExecutionId;  // ← toujours EX-...

  this.scenario = {
    ...this.scenario,
    status: 'aborted',
    activeStepLabel: '■ Aborted',
    progressLabel: 'Execution aborted',
    progressPercent: 100,
  };

  if (this.liveRun) {
    this.liveRun = { ...this.liveRun, status: 'aborted' };
  }

  this.stopLiveRunTimer();

  if (executionId) {
    this.seleniumRunner.abortExecution(executionId).subscribe({
      next: () => {
        console.log('✅ Abort sent for', executionId);
        setTimeout(() => void this.loadRecentRuns(), 1500);
      },
      error: (err) => console.warn('Abort save failed:', err),
    });
  }

  this.cdr.markForCheck();
}

  setTab(tab: 'timeline' | 'logs' | 'screenshot'): void {
    this.activeTab = tab;
  }

  /**
   * Request AI analysis of test failure
   */
  async requestAIAnalysis(): Promise<void> {
    if (this.scenario.status !== 'failed' && this.scenario.status !== 'aborted') {
      this.showSnackbar('Analysis only available for failed or aborted tests', 3000);
      return;
    }

    this.isAnalyzingFailure = true;
    this.detectorInsight = null;
    this.refreshDomFromExecutionLogs();
    this.cdr.markForCheck();

    try {
      // Get the failed step index
      const failedStepIndex = this.scenario.steps.findIndex(s => s.status === 'fail');
      const failedStep = failedStepIndex >= 0 ? this.scenario.steps[failedStepIndex] : null;
      const analysisLogs = this.buildFailureAnalysisLogs();
      const rawErrorText = analysisLogs
        .map((log) => log.message)
        .find((message) => /failed_assertion|failed_execution|expected success|not detected|not available|not found|something went wrong|no results found/i.test(message))
        || failedStep?.subtitle
        || this.scenario.activeStepLabel
        || 'Unknown error';

      // Prepare payload for AI analysis
      const payload = {
        failedStep: failedStep ? {
          id: failedStep.id,
          name: failedStep.name,
          subtitle: failedStep.subtitle,
          timestamp: failedStep.timestamp,
        } : null,
        logs: analysisLogs,
        testCase: this.loadedTestCase ? {
          id: this.loadedTestCase.id,
          title: this.loadedTestCase.title,
          steps: this.loadedTestCase.steps,
          urlCible: this.loadedTestCase.urlCible,
          test_data: this.loadedTestCase.test_data,
          stepDetails: this.loadedTestCase.stepDetails,
        } : null,
        errorMessage: rawErrorText,
        errorType: this.extractErrorType(rawErrorText),
        stepIndex: failedStepIndex,
        domState: {
          sourceUrl: this.domSourceUrl,
          elements: this.compactDomForAnalysis(),
        },
        aiActions: this.extractAiActions(this.rawExecutionLogs),
        screenshotUrl: this.screenshotUrl || this.selectedScreenshotUrl || '',
        executionId: this.scenario.executionId,
      };

      console.log('[AI Analysis] Sending payload:', payload);

      const response = await firstValueFrom(
        this.api.post<DetectFailureResponse>('/api/ai/detect-failure', payload)
      );
      const analysis = response?.data ?? response;

      if (analysis?.title || analysis?.description || analysis?.actionText) {
        const recommendations = Array.isArray(analysis.recommendations)
          ? analysis.recommendations.filter((item) => item?.fix)
          : [];
        const hasDetailedAnalysis = Boolean(
          analysis.whatHappened || analysis.expectedBehavior || analysis.actualBehavior || analysis.whyItFailed
        );
        const specificInsight = hasDetailedAnalysis
          ? null
          : this.makeSpecificInsightIfGeneric(analysis, recommendations, analysisLogs);
  this.detectorInsight = specificInsight || {
    title: analysis.title || 'Failure Detected',
    description: analysis.description || 'Unable to determine cause',
    actionLabel: analysis.actionLabel || 'Recommended Fix',
    actionText: analysis.actionText || 'Review logs and adjust test configuration',
    recommendations: recommendations.length
      ? recommendations
      : [{
          error: analysis.description || 'Failure detected',
          rootCause: analysis.rootCause,
          fix: analysis.actionText || 'Review logs and adjust test configuration',
        }],
    rootCause: analysis.rootCause,
    confidence: analysis.confidence,
    failedStepName: analysis.failedStepName,
    aiActionSummary: analysis.aiActionSummary,
    diagnosticTips: analysis.diagnosticTips,
    suggestedSelectors: analysis.suggestedSelectors,
    summary: analysis.summary,
    whatHappened: analysis.whatHappened,
    simpleExplanation: analysis.simpleExplanation,
    example: analysis.example,
    expectedBehavior: analysis.expectedBehavior,
    actualBehavior: analysis.actualBehavior,
    whyItFailed: analysis.whyItFailed,
    severity: analysis.severity,
    evidence: analysis.evidence,
    timeline: analysis.timeline,
    developerFix: analysis.developerFix,
    testerFix: analysis.testerFix,
  };
        console.log('[AI Analysis] ✅ Insight received:', this.detectorInsight);
        this.showSnackbar('✅ AI analysis complete', 2000);
      } else {
        this.detectorInsight = {
          title: 'Analysis Failed',
          description: 'Unable to analyze the failure',
          actionLabel: 'Retry',
          actionText: 'Please try again',
          recommendations: [],
        };
        this.showSnackbar('⚠ Analysis failed, please try again', 3000);
      }

      this.cdr.markForCheck();
    } catch (error) {
      console.error('[AI Analysis] Error:', error);
      this.detectorInsight = {
        title: 'Analysis Error',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        actionLabel: 'Retry',
        actionText: 'Check your connection and try again',
        recommendations: [],
      };
      this.showSnackbar('❌ Analysis failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 4000);
      this.cdr.markForCheck();
    } finally {
      this.isAnalyzingFailure = false;
      this.cdr.markForCheck();
    }
  }

  /**
   * Extract error type from error message
   */
  private extractErrorType(message: string): string {
    const msg = message.toLowerCase();
    if (msg.includes('failed_assertion') || msg.includes('expected success') || msg.includes('not detected')) return 'assertion_failed';
    if (msg.includes('not available') || msg.includes('data mismatch')) return 'data_mismatch';
    if (msg.includes('timeout') || msg.includes('awaiting')) return 'timing_timeout';
    if (msg.includes('not interactable') || msg.includes('interactableexception')) return 'element_not_interactable';
    if (msg.includes('not found') || msg.includes('nosuchelement')) return 'selector_not_found';
    if (msg.includes('assertion')) return 'assertion_failed';
    if (msg.includes('navigate') || msg.includes('navigation')) return 'navigation_failed';
    if (msg.includes('error') || msg.includes('exception')) return 'application_error';
    return 'unknown';
  }

  private buildFailureAnalysisLogs(): LogLine[] {
    const rawLogs = this.mapRunResponseToLogs({ logs: this.rawExecutionLogs });
    const merged = [...rawLogs, ...this.streamedLogs];
    const seen = new Set<string>();
    const normalizeLevel = (level: string): LogLine['level'] => {
      const upper = String(level || 'INFO').toUpperCase();
      return ['INFO', 'WARN', 'ERROR', 'SUCCESS', 'FAIL', 'TRACE'].includes(upper)
        ? upper as LogLine['level']
        : 'INFO';
    };

    return merged
      .map((log, index) => ({
        index: Number(log.index) || index + 1,
        level: normalizeLevel(String(log.level || 'INFO')),
        message: this.compactFailureLogMessage(String(log.message || '')).slice(0, 900),
      }))
      .filter((log) => /fail|error|warn|assert|expected|actual|dropdown|country|region|not available|not found|timeout|exception|ai actions/i.test(log.message))
      .filter((log) => {
        const key = `${log.level}::${log.message}`;
        if (!log.message || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(-14);
  }

  private compactFailureLogMessage(message: string): string {
    return message
      .replace(/\s+/g, ' ')
      .replace(/(Afghanistan|Albania|Algeria|American Samoa|Andorra|Angola|Argentina|Armenia|Australia|Austria|Azerbaijan|Bahamas|Bahrain|Bangladesh|Belgium|Brazil|Bulgaria|Canada|China|Denmark|Egypt|France|Germany|India|Italy|Japan|Mexico|Netherlands|Norway|Poland|Portugal|Spain|Tunisia|Türkiye|United Kingdom|United States of America|Zimbabwe)(\s+\1){2,}/gi, '$1')
      .trim();
  }

  private compactDomForAnalysis(): Partial<DOMElement>[] {
    const important = this.domElements.filter((element) => {
      const text = [
        element.text,
        element.ariaLabel,
        element.name,
        element.id,
        element.placeholder,
        element.role,
        element.type,
      ].join(' ');
      return /country|region|tunisia|username|email|password|create account|copilot|error|invalid|combobox|listbox|option|submit/i.test(text);
    });

    return important.slice(0, 35).map((element) => ({
      index: element.index,
      tag: element.tag,
      role: element.role,
      type: element.type,
      id: element.id,
      name: element.name,
      ariaLabel: element.ariaLabel,
      ariaExpanded: element.ariaExpanded,
      ariaHaspopup: element.ariaHaspopup,
      text: element.text?.slice(0, 140),
      value: element.value?.slice(0, 120),
      placeholder: element.placeholder,
      visible: element.visible,
      disabled: element.disabled,
    }));
  }

  private makeSpecificInsightIfGeneric(
    analysis: DetectFailureData,
    recommendations: DetectorRecommendation[],
    logs: LogLine[],
  ): DetectorInsight | null {
    const combined = logs.map((log) => log.message).join('\n');
    const generic =
      /unable to determine failure cause/i.test(String(analysis.description || '')) ||
      /review logs and adjust selectors or timing/i.test(String(analysis.actionText || '')) ||
      !recommendations.length;

    if (!generic) return null;

    if (/username .*not available|username.*is not available/i.test(combined)) {
      const fix = 'Use an available username suggested by the page, or generate a unique username before clicking Create account. The country dropdown already shows Tunisia, so the blocking failure is the unavailable username and the expected success redirect cannot happen.';
      return {
        title: 'Registration blocked by username',
        description: 'The final assertion expected a successful registration, but GitHub reports that the selected username is not available.',
        actionLabel: 'Recommended Fix',
        actionText: fix,
        recommendations: [{
          error: 'Username is not available',
          rootCause: 'data_mismatch',
          fix,
        }],
        rootCause: 'data_mismatch',
        confidence: 0.9,
        diagnosticTips: [
          'Check the generated username before submitting the form.',
          'Keep the country dropdown value Tunisia, then retry with one of the suggested usernames.',
        ],
      };
    }

    if (/country\/region|select country|no results found|sorry, something went wrong/i.test(combined)) {
      const fix = 'Use the Country/Region dropdown trigger, type Tunisia in the dropdown filter if it opens a searchable dialog, then click the visible Tunisia option before submitting.';
      return {
        title: 'Country dropdown selection failed',
        description: 'The failure context contains dropdown filtering errors around Country/Region, so the dropdown interaction needs a more specific trigger and option selection.',
        actionLabel: 'Recommended Fix',
        actionText: fix,
        recommendations: [{
          error: 'Country/Region dropdown did not resolve cleanly',
          rootCause: 'ai_logic_error',
          fix,
        }],
        rootCause: 'ai_logic_error',
        confidence: 0.78,
      };
    }

    return null;
  }

  /**
   * Start polling the live DOM (iframe or main document) while Selenium is running,
   * so the "DOM Elements" panel reflects the page in real time instead of only
   * being populated when the user clicks "AI Analysis".
   */
  private startDomExtraction(): void {
    this.stopDomExtraction();
    this.refreshDomFromExecutionLogs();
  }

  private stopDomExtraction(): void {
    if (this.domExtractionInterval) {
      clearInterval(this.domExtractionInterval);
      this.domExtractionInterval = undefined;
    }
  }

  /**
   * Extract and organize DOM elements from the current application state
   */
  private extractDOMElements(): void {
    this.refreshDomFromExecutionLogs();
  }

  openScreenshot(url: string | null | undefined): void {
    if (!url) return;
    this.currentScreenshots = this.stepsWithScreenshots
      .map(s => s.screenshotUrl!)
      .filter(Boolean);
    this.currentScreenshotIndex = this.currentScreenshots.indexOf(url);
    this.selectedScreenshotUrl = url;
  }


  showSnackbar(message: string, durationMs = 4000): void {
  this.snackbarMessage = message;
  this.cdr.markForCheck();
  if (this.snackbarTimer) clearTimeout(this.snackbarTimer);
  this.snackbarTimer = setTimeout(() => {
    this.snackbarMessage = null;
    this.cdr.markForCheck();
  }, durationMs);
}

private async loadAndRunPlan(): Promise<void> {
  this.screenshotUrl = null;

  if (!this.suiteId || !this.planId) {
    this.scenario = {
      ...this.scenario,
      status: 'in-progress',
      progressPercent: 0,
      progressLabel: 'Select a suite and test plan to continue',
      activeStepLabel: '● Waiting for selection',
      steps: [],
    };
    this.streamedLogs = [{ index: 1, level: 'INFO', message: 'Waiting for suite and test plan selection.' }];
    this.cdr.markForCheck();
    return;
  }

  try {
    console.log("GET SUITE...");
    const suite: TestSuiteDto = await firstValueFrom(
      this.testLabService.getTestSuiteById(this.suiteId)
    );console.log("SUITE RECEIVED", suite);
    const planCases = this.getPlanTestCases(suite, this.planId);

    if (!planCases.length) {
      this.scenario = {
        ...this.scenario,
        status: 'in-progress',
        progressPercent: 0,
        progressLabel: 'Select a test case to continue',
        activeStepLabel: '● Waiting for test case',
        steps: [],
      };
      this.streamedLogs = [{ index: 1, level: 'INFO', message: 'Waiting for a test case selection.' }];
      this.cdr.markForCheck();
      return;
    }

    const total = planCases.length;

    for (const [index, testCase] of planCases.entries()) {
      this.loadedTestCase = testCase;

      // update breadcrumb caseName to current test case
      this.scenario = {
        ...this.scenario,
        caseName: testCase.title,
        progressLabel: `Test case ${index + 1} / ${total} — ${testCase.title}`,
        activeStepLabel: `▶ Running ${testCase.title}`,
      };
      this.cdr.markForCheck();

      await this.executeLoadedTestCase(testCase);

      const caseStatus = this.scenario.status;
      const emoji = caseStatus === 'passed' ? '✓' : '✕';
      const label = caseStatus === 'passed' ? 'passed' : 'failed';

      // ── Snackbar intermédiaire ──────────────────────────────────────────
      if (index < total - 1) {
        this.showSnackbar(
          `${emoji} Test case ${index + 1}/${total} "${testCase.title}" ${label} — starting next...`,
          3500
        );
        // small pause so the user sees the snackbar before next case starts
        await new Promise<void>(r => setTimeout(r, 1200));
      }

      if (caseStatus === 'aborted') {
  this.showSnackbar('■ Execution aborted by user.', 4000);
  break;
}
if (caseStatus === 'failed') break;
    }

    // ── Snackbar final ─────────────────────────────────────────────────────
    const finalStatus = this.scenario.status;
    if (finalStatus === 'passed') {
      this.showSnackbar(`🎉 Test plan completed — all ${total} test cases passed!`, 6000);
    } else {
      this.showSnackbar(`✕ Test plan finished with failures.`, 6000);
    }

    void this.loadRecentRuns();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Unable to execute plan.' }];
    this.scenario = {
      ...this.scenario,
      status: 'failed',
      progressLabel: 'Plan execution failed',
      activeStepLabel: '⚠ Unable to execute test plan',
    };
    this.cdr.markForCheck();
  }
}

  get canExportReport(): boolean {
    return Boolean(this.scenario.projectName?.trim() && this.scenario.suiteName?.trim());
  }

  async exportReport(): Promise<void> {
    if (!this.canExportReport || !this.suiteId || this.isExportingReport) return;

    this.isExportingReport = true;
    this.cdr.markForCheck();

    try {
      const blob = await firstValueFrom(
        this.api.getBlob(`/api/selenium/reports/test-suites/${encodeURIComponent(this.suiteId)}`)
      );

      const url = window.URL.createObjectURL(blob);
      const fileName = `${(this.scenario.projectName || 'project').replace(/[^\w\-]+/g, '_')}_${(this.scenario.suiteName || 'suite').replace(/[^\w\-]+/g, '_')}_report.pdf`;
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      anchor.click();
      window.URL.revokeObjectURL(url);
      this.showSnackbar('Report exported successfully', 2500);
    } catch (error) {
      console.error('Export report failed:', error);
      this.showSnackbar('Unable to export the report', 3000);
    } finally {
      this.isExportingReport = false;
      this.cdr.markForCheck();
    }
  }

  nextScreenshot(): void {
    if (!this.currentScreenshots.length) return;
    this.currentScreenshotIndex =
      (this.currentScreenshotIndex + 1) % this.currentScreenshots.length;
    this.selectedScreenshotUrl = this.currentScreenshots[this.currentScreenshotIndex];
  }

  prevScreenshot(): void {
    if (!this.currentScreenshots.length) return;
    this.currentScreenshotIndex =
      (this.currentScreenshotIndex - 1 + this.currentScreenshots.length) %
      this.currentScreenshots.length;
    this.selectedScreenshotUrl = this.currentScreenshots[this.currentScreenshotIndex];
  }

  closeScreenshot(): void {
    this.selectedScreenshotUrl = null;
  }

/*  copySnippet(): void {
    const snippet = `from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

wait = WebDriverWait(driver, 15)
element = wait.until(EC.element_to_be_clickable((By.ID, "submit-btn")))
element.click()`;
    navigator.clipboard?.writeText(snippet);
  }*/

    copySnippet(text?: string): void {
  const content = text?.trim() || this.detectorInsight?.actionText?.trim() || '';
  if (content) {
    navigator.clipboard?.writeText(content);
    this.showSnackbar('✅ Copied to clipboard', 1800);
  }
}

  // ─── Template helpers ──────────────────────────────────────────────────────

  getStatusBadgeClass(): string {
    const map: Record<TestStatus, string> = {
      'in-progress': 'badge--running',
      passed: 'badge--pass',
      failed: 'badge--fail',
      aborted: 'badge--aborted',
    };
    return map[this.scenario.status];
  }

  getStatusLabel(): string {
    const map: Record<TestStatus, string> = {
      'in-progress': '● In Progress',
      passed: '✓ Passed',
      failed: '✕ Failed',
      aborted: '■ Aborted',
    };
    return map[this.scenario.status];
  }

  getProgressClass(): string {
    const map: Record<TestStatus, string> = {
      'in-progress': 'progress--running',
      passed: 'progress--pass',
      failed: 'progress--fail',
      aborted: 'progress--aborted',
    };
    return map[this.scenario.status];
  }

  getLogClass(level: string): string {
    const map: Record<string, string> = {
      INFO: 'log--info',
      SUCCESS: 'log--success',
      FAIL: 'log--fail',
      ERROR: 'log--fail',
      WARN: 'log--warn',
      TRACE: 'log--trace',
    };
    return map[level] ?? 'log--info';
  }

  getStepIconClass(status: StepStatus): string {
    const map: Record<StepStatus, string> = {
      pass: 'step-icon--pass',
      fail: 'step-icon--fail',
      running: 'step-icon--running',
      waiting: 'step-icon--waiting',
      skipped: 'step-icon--waiting',
    };
    return map[status];
  }

  getDotClass(status: StepStatus): string {
    const map: Record<StepStatus, string> = {
      pass: 'dot--pass',
      fail: 'dot--fail',
      running: 'dot--running',
      waiting: 'dot--waiting',
      skipped: 'dot--waiting',
    };
    return map[status];
  }

  getStepStatusLabel(status: StepStatus): string {
    const map: Record<StepStatus, string> = {
      pass: 'Passed',
      fail: 'Failed',
      running: 'Running',
      waiting: 'Waiting',
      skipped: 'Skipped',
    };
    return map[status];
  }

  trackByStep(_: number, step: ExecutionStep): number { return step.id; }
  trackByLog(_: number, log: LogLine): number { return log.index; }

  get stepsWithScreenshots(): ExecutionStep[] {
    return this.scenario.steps.filter(s => Boolean(s.screenshotUrl));
  }

  get recentRunsMerged(): TestExecutionDto[] {
    const merged = [...this.recentRuns];
    if (this.liveRun) {
      const idx = merged.findIndex(r => r.executionId === this.liveRun?.executionId);
      if (idx >= 0) merged[idx] = this.liveRun;
      else merged.unshift(this.liveRun);
    }
    return merged;
  }

  get recentRunsTotalPages(): number {
    return Math.max(1, Math.ceil(this.recentRunsMerged.length / this.recentRunsPageSize));
  }

  get paginatedRecentRuns(): TestExecutionDto[] {
    const start = (this.recentRunsPage - 1) * this.recentRunsPageSize;
    return this.recentRunsMerged.slice(start, start + this.recentRunsPageSize);
  }

  get recentRunsVisibleStart(): number {
    return this.recentRunsMerged.length === 0
      ? 0
      : (this.recentRunsPage - 1) * this.recentRunsPageSize + 1;
  }

  get recentRunsVisibleEnd(): number {
    return Math.min(
      this.recentRunsPage * this.recentRunsPageSize,
      this.recentRunsMerged.length
    );
  }

  goToRecentRunsPreviousPage(): void { if (this.recentRunsPage > 1) this.recentRunsPage--; }
  goToRecentRunsNextPage(): void { if (this.recentRunsPage < this.recentRunsTotalPages) this.recentRunsPage++; }

  getRunStatusLabel(status: TestExecutionDto['status']): string {
    return status === 'passed' ? 'Passed'
      : status === 'failed' ? 'Failed'
      : status === 'aborted' ? 'Aborted'
      : 'Running';
  }

  getRunStatusClass(status: TestExecutionDto['status']): string {
    return status === 'passed' ? 'status-pill--pass'
      : status === 'failed' ? 'status-pill--fail'
      : status === 'aborted' ? 'status-pill--aborted'
      : 'status-pill--running';
  }

  // ─── Scenario builders ─────────────────────────────────────────────────────

private buildPassScenario(): TestScenario {
  return {
    projectName: '',
    suiteName: '',
    planName: '',
    caseName: '',
    executionId: '-',
    environment: '-',
    executionTime: '-',
    status: 'in-progress',
    progressPercent: 0,
    progressLabel: '-',
    activeStepLabel: '-',
    steps: [],
    logs: [],
  };
}


private buildFailScenario(): TestScenario {
  return {
    projectName: '',
    suiteName: '',
    planName: '',
    caseName: '',
    executionId: '-',
    environment: '-',
    executionTime: '-',
    status: 'failed',
    progressPercent: 0,
    progressLabel: '-',
    activeStepLabel: '-',
    steps: [],
    logs: [],
  };
}

  // ─── Execution simulation ──────────────────────────────────────────────────

  private startPassExecution(): void {
    this.scenario = this.buildPassScenario();
    this.streamedLogs = [];
    this.streamIndex = 0;
    this.isStreaming = true;
    this.cdr.markForCheck();
    /*this.startMetricsAnimation();*/

    const steps = [
      { delay: 800,  progress: 40,  label: '40% — 2 / 5 steps completed',  active: '● Navigating to Login Page' },
      { delay: 2400, progress: 60,  label: '60% — 3 / 5 steps completed',  active: '● Navigating to Login Page' },
      { delay: 4000, progress: 80,  label: '80% — 4 / 5 steps completed',  active: '● Submitting credentials' },
      { delay: 6000, progress: 100, label: '100% — 5 / 5 steps completed', active: '✓ All steps passed' },
    ];

    steps.forEach(({ delay, progress, label, active }) => {
      setTimeout(() => {
        if (!this.isStreaming) return;
        this.scenario = { ...this.scenario, progressPercent: progress, progressLabel: label, activeStepLabel: active };
        if (progress === 80) {
          this.scenario.steps[3] = { ...this.scenario.steps[3], status: 'running', subtitle: 'In progress...', timestamp: '14:29:08' };
        }
        if (progress === 100) this.finalizePassScenario();
        this.cdr.markForCheck();
      }, delay);
    });

    this.startLogStream(this.PASS_LOGS);
  }

  private finalizePassScenario(): void {
    this.isStreaming = false;
    /*this.stopMetrics();*/
    this.scenario = {
      ...this.scenario,
      status: 'passed',
      executionTime: '18s',
      steps: [
        { id: 1, name: 'Initialize WebDriver Session', subtitle: 'Completed in 1.4s', status: 'pass', timestamp: '14:29:01' },
        { id: 2, name: 'Set Viewport Dimensions (1920×1080)', subtitle: 'Completed in 0.7s', status: 'pass', timestamp: '14:29:02' },
        { id: 3, name: 'Navigate to Login Page', subtitle: 'Completed in 2.1s', status: 'pass', timestamp: '14:29:06' },
        { id: 4, name: 'Submit Credentials', subtitle: 'Completed in 1.5s', status: 'pass', timestamp: '14:29:08' },
        { id: 5, name: 'Assert Dashboard Loaded', subtitle: 'Completed in 0.9s', status: 'pass', timestamp: '14:29:09' },
      ],
    };
    /*this.metrics = { cpu: 8, memory: 1.0, latency: 18, threads: 4 };*/
    this.cdr.markForCheck();
  }

  private startLogStream(logs: LogLine[]): void {
    this.streamedLogs = [];
    let i = 0;
    this.logStreamSubscription = interval(400)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (i < logs.length) {
          this.streamedLogs = [...this.streamedLogs, logs[i]];
          i++;
          this.cdr.markForCheck();
        } else {
          this.logStreamSubscription?.unsubscribe();
        }
      });
  }

  /*private startMetricsAnimation(): void {
    this.metricsSubscription = interval(1200)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.metrics = {
          cpu: Math.round(18 + Math.random() * 20),
          memory: parseFloat((1.1 + Math.random() * 0.3).toFixed(1)),
          latency: Math.round(30 + Math.random() * 30),
          threads: 8,
        };
        this.cdr.markForCheck();
      });
  }*/

  /*private stopMetrics(): void { this.metricsSubscription?.unsubscribe(); }*/

  private stopAll(): void {
    this.isStreaming = false;
    /*this.stopMetrics();*/
    this.logStreamSubscription?.unsubscribe();
    this.runSubscription?.unsubscribe();
    this.fakeTimelineSubscription?.unsubscribe();
    this.stopLiveRunTimer();
    this.stopDomExtraction();
  }

  // ─── Real execution flow ───────────────────────────────────────────────────

  private async loadAndRun(): Promise<void> {
    console.log("LOAD AND RUN START");
    this.screenshotUrl = null;

    if (!this.suiteId || !this.planId || !this.testCaseId) {
      this.scenario = {
        ...this.scenario,
        status: 'in-progress',
        progressPercent: 0,
        progressLabel: 'Select project, suite, plan and test case',
        activeStepLabel: '● Waiting for complete selection',
        steps: [],
      };
      this.streamedLogs = [{ index: 1, level: 'INFO', message: 'Waiting for project, suite, plan and test case selection.' }];
      this.cdr.markForCheck();
      return;
    }

    try {
      const suite: TestSuiteDto = await firstValueFrom(this.testLabService.getTestSuiteById(this.suiteId));
      const urlCible = String(suite.urlCible || '').trim();
      if (!urlCible) throw new Error('Missing suite urlCible (application URL).');

      const allCases: TestCaseDto[] =
        (suite.testCasesByPlan || []).flatMap(p => p.testCases || []);

      const tc = allCases.find(c =>
  String(
    (c as any)._id ||
    (c as any).id ||
    ''
  ).trim() === this.testCaseId) || null;
      if (!tc) throw new Error(`Test case "${this.testCaseId}" not found.`);

      const steps = Array.isArray(tc.steps) ? tc.steps.map(s => String(s)) : [];
      const executionModel = this.coerceExecutionModel((tc as any).executionModel || (tc as any).execution_model);
      const credentials = this.resolveExecutionCredentials(tc, suite);
      const testData = (tc as any).test_data ?? (tc as any).testData ?? (tc as any).data ?? null;
      const stepDetails = Array.isArray((tc as any).stepDetails)
        ? (tc as any).stepDetails
        : Array.isArray((tc as any).step_details) ? (tc as any).step_details : [];

      this.loadedTestCase = {
        id: String(tc.id),
        title: String(tc.title || tc.id),
        steps,
        stepDetails,
        urlCible,
        executionModel,
        ...(testData ? { test_data: testData } : {}),
        ...(credentials ? { credentials } : {}),
      };

      this.executionModelSummary = this.describeExecutionModel(executionModel, steps.length);

      const qp = this.route.snapshot.queryParamMap;
      this.scenario = {
        ...this.scenario,
        suiteName: qp.get('suiteName') || this.scenario.suiteName,
        planName: qp.get('planName') || this.scenario.planName,
        caseName: qp.get('testCaseName') || this.loadedTestCase.title,
      };

      this.cdr.markForCheck();
      console.log("BEFORE executeLoadedTestCase");
      await this.executeLoadedTestCase();
      console.log("AFTER executeLoadedTestCase");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 0,
        progressLabel: 'Failed to load test case',
        activeStepLabel: '✖ Failed',
        steps: [],
      };
      this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Unable to load test case.' }];
      this.cdr.markForCheck();
    }
  }

  private async loadRecentRuns(): Promise<void> {
    try {
      const rows = this.suiteId
        ? await firstValueFrom(this.testLabService.getTestExecutions(this.suiteId))
        : await firstValueFrom(this.testLabService.getRecentExecutions(20));
      this.recentRuns = Array.isArray(rows) ? rows : [];
      if (this.recentRunsPage > this.recentRunsTotalPages) this.recentRunsPage = this.recentRunsTotalPages;
      this.cdr.markForCheck();
    } catch {
      try {
        const fallback = await firstValueFrom(this.testLabService.getRecentExecutions(20));
        this.recentRuns = Array.isArray(fallback) ? fallback : [];
        this.cdr.markForCheck();
      } catch {
        this.recentRuns = [];
      }
    }
  }

  private buildTimelineSteps(stepTexts: string[]): ExecutionStep[] {
    const ts = new Date().toLocaleTimeString();
    return stepTexts.map((s, idx) => ({
      id: idx + 1,
      name: s || `Step ${idx + 1}`,
      subtitle: 'Waiting...',
      status: 'waiting',
      timestamp: ts,
    }));
  }

  private coerceExecutionModel(value: unknown): ExecutionModelDto | null {
    if (!value) return null;
    if (typeof value === 'string') {
      try { return JSON.parse(value) as ExecutionModelDto; } catch { return null; }
    }
    if (typeof value === 'object') return value as ExecutionModelDto;
    return null;
  }

  private modelStepLabel(step: ExecutionModelStepDto, index: number): string {
    const raw = String(step.raw || '').trim();
    if (raw) return raw;
    const action = String(step.action || 'step').replace(/_/g, ' ');
    const target = String(step.target?.name || step.target?.kind || '').trim();
    return target ? `${action}: ${target}` : `Step ${index + 1}`;
  }

  private getTimelineSource(testCase: LoadedExecutionTestCase): string[] {
    const modelSteps = testCase.executionModel?.steps || [];
    if (modelSteps.length) return modelSteps.map((s, i) => this.modelStepLabel(s, i));
    return testCase.steps;
  }

private getPlanTestCases(
  suite: TestSuiteDto,
  planId: string
): LoadedExecutionTestCase[] {

  console.log("SELECTED PLAN ID =", planId);

  const selectedPlan =
    (suite.testPlans || []).find(
      (p: any) =>
        String(p._id || '').trim() ===
        String(planId).trim()
    );

  console.log(
    "SELECTED PLAN FOUND =",
    selectedPlan
  );

  if (!selectedPlan) {
    console.log("PLAN NOT FOUND");
    return [];
  }

  const planCases =
    (suite.testCasesByPlan || []).find(
      (p: any) =>
        String(p.planId || '').trim() ===
        String(selectedPlan.id || '').trim()
    );

  console.log(
    "PLAN CASES =",
    planCases
  );

  const urlCible =
    String(suite.urlCible || '').trim();

  if (!planCases || !urlCible) {
    return [];
  }

  return (planCases.testCases || []).map(
    (tc: TestCaseDto) => {

      const executionModel =
        this.coerceExecutionModel(
          (tc as any).executionModel ||
          (tc as any).execution_model
        );

      const credentials =
        this.resolveExecutionCredentials(
          tc,
          suite
        );

      const testData =
        (tc as any).test_data ??
        (tc as any).testData ??
        (tc as any).data ??
        null;

      return this.normalizeTestCase(
        tc,
        urlCible,
        executionModel,
        credentials,
        testData
      );
    }
  );
}

  private normalizeTestCase(
    tc: TestCaseDto,
    urlCible: string,
    executionModel: ExecutionModelDto | null,
    credentials: LoadedExecutionTestCase['credentials'] | undefined,
    testData: unknown,
  ): LoadedExecutionTestCase {
    return {
      id: String(tc.id || '').trim(),
      title: String(tc.title || (tc as any).nom || (tc as any).name || 'Untitled test case').trim(),

      urlCible,
      steps: Array.isArray(tc.steps) ? tc.steps.map(s => String(s)) : [],
      stepDetails: Array.isArray(tc.stepDetails) ? tc.stepDetails : undefined,
      executionModel,
      ...(testData ? { test_data: testData } : {}),
      credentials,
    };
  }

  private describeExecutionModel(model: ExecutionModelDto | null | undefined, fallbackSteps: number): string {
    if (!model?.steps?.length) return `local fallback pending · ${fallbackSteps} steps`;
    const channels = new Set(model.steps.map(s => String(s.channel || 'unknown').trim()).filter(Boolean));
    return `${model.version || 'execution-model/v1'} · ${model.steps.length} steps · ${Array.from(channels).join(', ') || 'unknown'}`;
  }

  private readStringField(source: unknown, keys: string[]): string {
    const record = (source || {}) as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    }
    return '';
  }

  private resolveExecutionCredentials(tc: TestCaseDto, suite: TestSuiteDto): LoadedExecutionTestCase['credentials'] | undefined {
    const qp = this.route.snapshot.queryParamMap;
    const tcRecord = tc as unknown as Record<string, unknown>;
    const suiteRecord = suite as unknown as Record<string, unknown>;
    const nested = (tcRecord['credentials'] || suiteRecord['credentials'] || {}) as Record<string, unknown>;

    const email =
      String(qp.get('loginEmail') || qp.get('appEmail') || qp.get('email') || '').trim() ||
      this.readStringField(nested, ['email', 'username', 'login']) ||
      this.readStringField(tc, ['email', 'username', 'login']);

    const password =
      String(qp.get('loginPassword') || qp.get('password') || '').trim() ||
      this.readStringField(nested, ['password', 'loginPassword']) ||
      this.readStringField(tc, ['password', 'loginPassword']);

    const apiToken =
      String(qp.get('apiToken') || qp.get('token') || '').trim() ||
      this.readStringField(nested, ['apiToken', 'token']) ||
      this.readStringField(tc, ['apiToken', 'token']);

    if (!email && !password && !apiToken) return undefined;
    return {
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
      ...(apiToken ? { apiToken } : {}),
    };
  }

  private startFakeTimeline(totalSteps: number): void {
    if (totalSteps <= 0) return;
    let idx = 0;
    this.fakeTimelineSubscription?.unsubscribe();
    this.fakeTimelineSubscription = interval(650)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isStreaming) return;
        idx = Math.min(idx, totalSteps - 1);
        const steps = [...this.scenario.steps];
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].status === 'pass' || steps[i].status === 'fail') continue;
          steps[i] = { ...steps[i], status: i === idx ? 'running' : 'waiting' };
        }
        const progress = Math.min(95, Math.round(((idx + 1) / totalSteps) * 95));
        this.scenario = {
          ...this.scenario,
          status: 'in-progress',
          steps,
          progressPercent: progress,
          progressLabel: `Running step ${idx + 1}/${totalSteps}...`,
          activeStepLabel: `▶ Step ${idx + 1}`,
        };
        this.cdr.markForCheck();
        idx++;
        if (idx >= totalSteps) idx = totalSteps - 1;
      });
  }

  private mapStepResultsToScenarioSteps(stepResults: SeleniumStepResultDto[]): ExecutionStep[] {
    const now = new Date().toLocaleTimeString();
    return (stepResults || []).map(r => ({
      id: Number(r.index) || 0,
      name: String(r.name || `Step ${r.index}`),
      subtitle: r.status === 'passed' ? 'Passed' : (r.error || r.message || 'Failed'),
      status: r.status === 'passed' ? 'pass'
        : r.status === 'failed_assertion' || r.status === 'failed_execution' ? 'fail'
        : 'waiting',
      timestamp: now,
      screenshotUrl: this.resolveScreenshotUrl(
        r.screenshots?.[0]?.publicUrl || r.screenshots?.[0]?.path ||
        r.screenshot?.publicUrl || r.screenshot?.path ||
        r.screenshotPath || ''
      ),
    }));
  }

  private mapRunResponseToLogs(resp: any): LogLine[] {
    const data = resp?.data ?? resp;
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    const formatLogValue = (value: unknown): string => {
      if (value && typeof value === 'object' && 'publicUrl' in value) {
        return String((value as any).publicUrl || '');
      }
      if (value && typeof value === 'object') {
        try {
          return JSON.stringify(value);
        } catch {
          return '[unserializable object]';
        }
      }
      return String(value);
    };
    return logs.map((log: any, i: number) => {
      const details = log?.data
        ? Object.entries(log.data).filter(([k]) => k !== 'dom').map(([k, v]) =>
            `${k}: ${formatLogValue(v)}`
          ).join(' | ')
        : '';
      return {
        index: i + 1,
        level: String(log?.level || 'INFO'),
        message: details ? `${log.message} → ${details}` : String(log?.message || ''),
      };
    });
  }

  private getRawRunLogs(resp: any): RawExecutionLog[] {
    const data = resp?.data ?? resp;
    return Array.isArray(data?.logs) ? data.logs : [];
  }

  private refreshDomFromExecutionLogs(): void {
    const domLog = [...this.rawExecutionLogs].reverse().find((log) => {
      const data = log?.data || {};
      return Array.isArray(data['dom']) || Array.isArray(data['sample']);
    });
    const data = domLog?.data || {};
    const dom = Array.isArray(data['dom'])
      ? data['dom']
      : Array.isArray(data['sample'])
        ? data['sample']
        : [];

    this.domElements = dom
      .filter((element): element is DOMElement => Boolean(element && typeof element === 'object' && 'tag' in element))
      .map((element) => element as DOMElement);
    this.domSourceUrl = String(data['sourceUrl'] || '');
    this.cdr.markForCheck();
  }

  private buildDetectorInsight(failedStep: SeleniumStepResultDto | null, rawLogs: RawExecutionLog[]): DetectorInsight | null {
    if (!failedStep) return null;

    const failedStepIndex = Number(failedStep.index) || 0;
    const relatedLogs = rawLogs.filter((log) => Number(log?.stepIndex) === failedStepIndex);
    const sourceLogs = relatedLogs.length ? relatedLogs : rawLogs;
    const aiActions = this.extractAiActions(sourceLogs);
    const lastErrorLog = [...sourceLogs].reverse().find((log) => {
      const level = String(log?.level || '').toUpperCase();
      const message = String(log?.message || '');
      return ['FAIL', 'ERROR', 'WARN'].includes(level) || /fail|error|exception|timeout/i.test(message);
    });

    const actionSummary = aiActions.length
      ? aiActions.map((action) => this.formatAiAction(action)).join(' | ')
      : 'No AI action was returned before the failure.';
    const errorText = String(failedStep.error || failedStep.message || lastErrorLog?.message || 'Selenium step failed').trim();
    const fix = this.suggestDetectorFix(errorText, aiActions);

    return {
      title: `Failed step #${failedStepIndex || '?'}: ${String(failedStep.name || 'Unnamed step')}`,
      description: `${errorText}. AI decision action: ${actionSummary}`,
      actionLabel: 'Recommended Fix',
      actionText: fix,
      recommendations: [{ error: errorText, fix }],
    };
  }

  private extractAiActions(logs: RawExecutionLog[]): Array<Record<string, unknown>> {
    const actions: Array<Record<string, unknown>> = [];
    for (const log of logs) {
      const message = String(log?.message || '');
      if (message !== 'AI actions received' && message !== 'AI actions overridden by user') {
        continue;
      }
      const data = log?.data || {};
      const directActions = Array.isArray(data['actions']) ? data['actions'] : [];
      for (const action of directActions) {
        if (action && typeof action === 'object') {
          actions.push({ ...(action as Record<string, unknown>), stepIndex: log.stepIndex });
        }
      }
    }

    const seen = new Set<string>();
    return actions.filter((action) => {
      const key = this.formatAiAction(action);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private formatAiAction(action: Record<string, unknown>): string {
    const type = String(action['type'] || action['action'] || 'action').trim();
    const selector = String(action['selector'] || '').trim();
    const value = String(action['value'] || '').trim();
    return [type, selector, value ? `value="${value}"` : ''].filter(Boolean).join(' ');
  }

  private suggestDetectorFix(errorText: string, actions: Array<Record<string, unknown>>): string {
    const text = errorText.toLowerCase();
    const selector = String(actions[actions.length - 1]?.['selector'] || '').trim();
    const target = selector ? ` for ${selector}` : '';

    if (text.includes('not interactable') || text.includes('click intercepted')) {
      return `Add an explicit wait until the element is visible and clickable${target}, then scroll it into view before executing the AI action.`;
    }
    if (text.includes('no such element') || text.includes('unable to locate')) {
      return `Refresh the selector used by AI decision${target}. Prefer data-testid/name attributes or rerun DOM capture just before the action.`;
    }
    if (text.includes('timeout')) {
      return `Increase the wait condition around the AI action${target} and wait for the page or async request to finish before continuing.`;
    }
    if (text.includes('assert')) {
      return 'Compare the expected result with the actual UI state and update the assertion target or expected text for this test case.';
    }
    if (!actions.length) {
      return 'AI decision returned no executable action. Check the captured DOM and enrich the test data or selectors for this step.';
    }
    return `Review the AI action${target} against the captured DOM and add a guard wait before retrying this step.`;
  }

  private resolveScreenshotUrl(path: string): string | null {
    if (!path) return null;
    if (path.startsWith('http')) return path;
    return 'http://localhost:3000' + path;
  }

  private async executeLoadedTestCase(testCase: LoadedExecutionTestCase | null = this.loadedTestCase): Promise<void> {
    if (!testCase) return;
this.isAborted = false; 
  this.currentExecutionId = `EX-${Date.now()}`;  // ← génère ici

    this.stopAll();
    this.isStreaming = true;
    this.screenshotUrl = null;
    this.domElements = [];
    /*this.metrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 };
    this.startMetricsAnimation();*/

    const timelineSource = this.getTimelineSource(testCase);
    const steps = this.buildTimelineSteps(timelineSource);
    this.scenario = {
      ...this.scenario,
      status: 'in-progress',
      executionTime: '—',
      steps,
      progressPercent: 5,
      progressLabel: 'Starting standardized execution...',
      activeStepLabel: '▶ Starting',
    };
    this.streamedLogs = [{ index: 1, level: 'INFO', message: 'Preparing execution...' }];
    this.rawExecutionLogs = [];
    this.detectorInsight = null;
    this.cdr.markForCheck();

    this.startLiveRun();
    this.startFakeTimeline(steps.length);
    // Live DOM capture: refresh the "DOM Elements" panel continuously while Selenium runs,
    // instead of only capturing it when the user clicks "AI Analysis".
    this.startDomExtraction();

    const startedAt = Date.now();
    const payload = {
      id: testCase.id,
      title: testCase.title,
      executionId: this.currentExecutionId,
      testSuiteId: this.suiteId,
      planId: this.planId,
      testCaseId: this.testCaseId,
      url: testCase.urlCible,
      steps: testCase.steps,
      ...(Array.isArray(testCase.stepDetails) ? { stepDetails: testCase.stepDetails } : {}),
      ...(testCase.executionModel ? { executionModel: testCase.executionModel } : {}),
      ...(testCase.test_data ? { test_data: testCase.test_data } : {}),
      ...(testCase.credentials ? { credentials: testCase.credentials } : {}),
      ...(this.pendingActionOverrides.length ? { actionOverrides: this.pendingActionOverrides.map((action) => ({
        stepIndex: action.stepIndex,
        type: action.type,
        selector: action.selector,
        value: action.value,
      })) } : {}),
    };
console.log(
  "PAYLOAD SENT",
  payload
);
    this.runSubscription = this.seleniumRunner
      .runSingleTestCase(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
           if (this.isAborted) {
          this.cdr.markForCheck();
          return;
        }console.log(
  "RUN RESPONSE",
  resp
);

          const elapsed = Math.max(0, Date.now() - startedAt);
          const secs = `${Math.max(1, Math.round(elapsed / 1000))}s`;
          const respPayload: any = (resp as any)?.data ?? resp;
          const innerData: any = respPayload?.data ?? respPayload;

          if (!respPayload || (typeof respPayload === 'object' && !Array.isArray(respPayload) && Object.keys(respPayload).length === 0)) {
            this.isStreaming = false;
            this.fakeTimelineSubscription?.unsubscribe();
            this.stopDomExtraction();
            /*this.stopMetrics();*/
            this.stopLiveRunTimer();
            this.scenario = {
              ...this.scenario,
              status: 'failed',
              progressPercent: 100,
              progressLabel: 'Empty response from runner',
              activeStepLabel: '✖ Empty response',
            };
            this.streamedLogs = [{ index: 1, level: 'ERROR', message: 'Selenium runner returned an empty response body.' }];
            void this.maybeAutoAnalyzeFailure();
            this.cdr.markForCheck();
            return;
          }

          const responseModel = this.coerceExecutionModel(innerData?.executionModel || innerData?.execution_model);
          if (responseModel) {
            this.executionModelSummary = this.describeExecutionModel(responseModel, this.loadedTestCase?.steps.length || 0);
          }

          const stepResults = Array.isArray(innerData?.stepResults) ? innerData.stepResults : [];
          const rawLogs = this.getRawRunLogs(respPayload);
          const mappedSteps = stepResults.length
            ? this.mapStepResultsToScenarioSteps(stepResults)
            : this.scenario.steps;

          const failedStep = stepResults.find((s: SeleniumStepResultDto) =>
            s.status === 'failed_execution' || s.status === 'failed_assertion'
          ) || null;

          const screenshotList = Array.isArray(innerData?.screenshots) ? innerData.screenshots : [];
          const latestScreenshot = screenshotList[screenshotList.length - 1];

          const screenshotPath = String(
            failedStep?.screenshots?.[0]?.publicUrl || failedStep?.screenshots?.[0]?.path ||
            failedStep?.screenshot?.publicUrl || failedStep?.screenshot?.path ||
            failedStep?.screenshotPath || latestScreenshot?.publicUrl || latestScreenshot?.path ||
            innerData?.screenshot?.publicUrl || innerData?.screenshotPath || ''
          ).trim();

          this.screenshotUrl = this.resolveScreenshotUrl(screenshotPath);
          this.isStreaming = false;
          this.fakeTimelineSubscription?.unsubscribe();
          this.stopDomExtraction();
          /*this.stopMetrics();*/

          this.scenario = {
            ...this.scenario,
            status: innerData?.status === 'passed' ? 'passed' : 'failed',
            executionTime: secs,
            steps: mappedSteps,
            progressPercent: 100,
            progressLabel: innerData?.status === 'passed' ? 'Completed' : 'Completed with errors',
            activeStepLabel: innerData?.status === 'passed' ? '✓ Completed' : '✖ Failed',
            errorMeta: screenshotPath ? {
              errorType: 'SeleniumStepFailed',
              stepName: String(failedStep?.name || ''),
              screenshot: this.screenshotUrl || screenshotPath,
              duration: secs,
            } : undefined,
          };

          this.rawExecutionLogs = rawLogs;
          this.refreshDomFromExecutionLogs();
          this.detectorInsight = null;
          this.startLogStream(this.mapRunResponseToLogs(respPayload));
          void this.maybeAutoAnalyzeFailure();
          void this.loadRecentRuns();
          this.stopLiveRunTimer();
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          if (this.isAborted) {
          this.cdr.markForCheck();
          return;
        }
          const msg = err instanceof Error ? err.message : String(err);
          this.isStreaming = false;
          this.fakeTimelineSubscription?.unsubscribe();
          this.stopDomExtraction();
          /*this.stopMetrics();*/
          this.scenario = {
            ...this.scenario,
            status: 'failed',
            progressPercent: 100,
            progressLabel: 'Failed',
            activeStepLabel: '✖ Failed',
          };
          this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Selenium request failed.' }];
          void this.maybeAutoAnalyzeFailure();
          this.stopLiveRunTimer();
          void this.loadRecentRuns();
          this.cdr.markForCheck();
        },
      });
  }

  private startLiveRun(): void {
    const startedAt = Date.now();
    const executionId = `LIVE-${this.suiteId}-${this.planId}-${this.loadedTestCase?.id || 'tc'}`;
    this.liveRun = {
      executionId,
      testSuiteId: this.suiteId,
      planId: this.planId,
      planKey: this.planId,
      planTitle: this.scenario.planName,
      testCaseId: this.loadedTestCase?.id || '',
      testCaseKey: this.loadedTestCase?.id || '',
      testCaseTitle: this.loadedTestCase?.title || '',
      status: 'running',
      duration: 0,
      startedAt: new Date(startedAt).toISOString(),
      createdAt: new Date(startedAt).toISOString(),
    };
    this.stopLiveRunTimer();
    this.liveRunTimer = setInterval(() => {
      if (!this.liveRun) return;
      this.liveRun = {
        ...this.liveRun,
        duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      };
      this.cdr.markForCheck();
    }, 1000);
  }

  private stopLiveRunTimer(): void {
    if (this.liveRunTimer) {
      clearInterval(this.liveRunTimer);
      this.liveRunTimer = undefined;
    }
  }

private async executeLoadedPlan(): Promise<void> {

  console.log('=== executeLoadedPlan START ===');

  console.log('suiteId =', this.suiteId);
  console.log('planId =', this.planId);

  if (!this.suiteId || !this.planId) {
    console.log('❌ suiteId ou planId manquant');
    return;
  }

  try {

    console.log('🚀 AVANT getTestSuiteById');

    const suite: TestSuiteDto =
      await firstValueFrom(
        this.testLabService.getTestSuiteById(
          this.suiteId
        )
      );

    console.log('✅ SUITE RECUE');
    console.log(suite);

    const planCases =
      this.getPlanTestCases(
        suite,
        this.planId
      );

    console.log(
      '📦 planCases =',
      planCases
    );

    if (!planCases.length) {

      console.log(
        '❌ Aucun testcase trouvé'
      );

      this.streamedLogs = [
        {
          index: 1,
          level: 'ERROR',
          message:
            'No test cases found for this test plan.'
        }
      ];

      this.cdr.markForCheck();
      return;
    }

    for (const [index, testCase] of planCases.entries()) {

      console.log(
        '▶️ EXECUTION TESTCASE',
        index,
        testCase
      );

      this.loadedTestCase = testCase;

      await this.executeLoadedTestCase(
        testCase
      );

      console.log(
        '✅ FIN TESTCASE',
        index
      );

      if (
        this.scenario.status === 'failed' ||
        this.scenario.status === 'aborted'
      ) {

        console.log(
          '⛔ STOP PLAN',
          this.scenario.status
        );

        break;
      }
    }

  } catch (err) {

    console.error(
      '🔥 executeLoadedPlan ERROR',
      err
    );

    const msg =
      err instanceof Error
        ? err.message
        : String(err);

    console.error(
      '🔥 MESSAGE =',
      msg
    );
  }
}

  showDomModal = false;
  domModalTab: 'dom' | 'actions' = 'dom';
  actionTab: 'simple' | 'selenium' = 'simple';
  aiActions: EditableAiAction[] = [];
  seleniumCode = '';

  
  setActionTab(
  tab: 'simple' | 'selenium'
): void {

  this.actionTab = tab;

  this.cdr.markForCheck();

}
private extractSeleniumCode(): string {

  const log = [...this.rawExecutionLogs]
    .reverse()
    .find(x => {

      const data = x?.data || {};

      return !!data['seleniumCode'];

    });

  return String(
    log?.data?.['seleniumCode'] || ''
  );

}

  // À ajouter avec les autres méthodes publiques
  openDomModal(): void {

    this.domModalTab = 'dom';

    this.aiActions =
      this.buildEditableActions();

    this.seleniumCode =
      this.extractSeleniumCode();

    this.showDomModal = true;
  }

  closeDomModal(): void {
    this.showDomModal = false;
  }

  setDomModalTab(tab: 'dom' | 'actions'): void {
    this.domModalTab = tab;
    if (tab === 'actions' && !this.aiActions.length) {
      this.aiActions = this.buildEditableActions();
    }
    this.cdr.markForCheck();
  }

  private buildEditableActions(): EditableAiAction[] {
    const result: EditableAiAction[] = [];

    this.rawExecutionLogs.forEach((log) => {
      const message = String(log?.message || '');
      if (message !== 'AI actions received' && message !== 'AI actions overridden by user') {
        return;
      }
      const data = (log?.data || {}) as Record<string, unknown>;
      const stepIndex = Number(log?.stepIndex) || 0;

      const directActions = Array.isArray(data['actions']) ? data['actions'] : [];
      directActions.forEach((action, i) => {
        if (action && typeof action === 'object') {
          result.push(this.toEditableAction(action as Record<string, unknown>, stepIndex, i));
        }
      });
    });

    // dédoublonne par step + type + selector + value
    const seen = new Set<string>();
    return result.filter((a) => {
      const key = `${a.stepIndex}::${a.originalType}::${a.originalSelector}::${a.originalValue}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private toEditableAction(action: Record<string, unknown>, stepIndex: number, i: number): EditableAiAction {
    const type = String(action['type'] || action['action'] || '').trim();
    const selector = String(action['selector'] || '').trim();
    const value = String(action['value'] || '').trim();
    return {
      uid: `${stepIndex}-${i}-${selector || 'na'}-${Math.random().toString(36).slice(2, 7)}`,
      stepIndex,
      type,
      selector,
      value,
      originalType: type,
      originalSelector: selector,
      originalValue: value,
      isEdited: false,
    };
  }

  updateAction(action: EditableAiAction, field: 'type' | 'selector' | 'value', newValue: string): void {
    (action as unknown as Record<string, string>)[field] = newValue;
    action.isEdited =
      action.type !== action.originalType ||
      action.selector !== action.originalSelector ||
      action.value !== action.originalValue;
    this.cdr.markForCheck();
  }

  resetAction(action: EditableAiAction): void {
    action.type = action.originalType;
    action.selector = action.originalSelector;
    action.value = action.originalValue;
    action.isEdited = false;
    this.cdr.markForCheck();
  }

  copyActionJson(action: EditableAiAction): void {
    const json = JSON.stringify({ type: action.type, selector: action.selector, value: action.value }, null, 2);
    navigator.clipboard?.writeText(json);
    this.showSnackbar('✅ Action copiée dans le presse-papiers', 1800);
  }

  applyEditedActions(): void {
    if (this.actionTab === 'selenium') {
      this.showSnackbar('Selenium code updated', 2000);
      this.closeDomModal();
      return;
    }

    const edited = this.aiActions.filter((a) => a.isEdited);
    if (!edited.length) {
      this.showSnackbar('Aucune modification à appliquer', 2000);
      return;
    }
    const editedByUid = new Map(edited.map((action) => [action.uid, action]));
    this.pendingActionOverrides = this.aiActions
      .filter((action) => edited.some((item) => item.stepIndex === action.stepIndex))
      .map((action) => ({ ...(editedByUid.get(action.uid) || action) }));
    this.closeDomModal();
    this.showSnackbar(`${edited.length} action(s) appliquée(s) — relance Selenium...`, 2500);
    this.rerun();
  }



projects: any[] = []
suites: any[] = []
plans: any[] = []
testCases: any[] = []

filters: ExecutionFilters = {
  project: '',
  suite: '',
  testPlan: '',
  testCase: '',
}


   /*loadProjects(): void {
    this.seleniumRunnerService.getProjects().subscribe((res: any) => {
      this.projects = Array.isArray(res) ? res : res?.data ?? []
    })
  }*/

  
selectedProjectName = '';
selectedSuiteName = '';
selectedPlanName = '';
selectedTestCaseName = '';


onFilterChange(key: string, event: any): void {

  const value = event.target.value;

this.filters = {
  ...this.filters,
  [key]: value
};
if (value) {

  console.log('PROJECT ID =', value);

  this.seleniumRunnerService
    .getSuitesByProject(value)
    .subscribe((res: any) => {

      console.log('SUITES RESPONSE =', res);

      this.suites = Array.isArray(res)
        ? res
        : (res?.data ?? []);

      console.log('SUITES ARRAY =', this.suites);

      this.cdr.markForCheck();
    });
}
  // PROJECT
  if (key === 'project') {

   const project = this.projects.find(
  p => p._id === value
);

  this.scenario = {
    ...this.scenario,
    projectName: project?.title ?? '',
    suiteName: '',
    planName: '',
    caseName: ''
  };


    this.filters.suite = '';
    this.filters.testPlan = '';
    this.filters.testCase = '';

    this.suites = [];
    this.plans = [];
    this.testCases = [];

    if (value) {
      
      this.seleniumRunnerService
        .getSuitesByProject(value)
       
        .subscribe((res: any) => {

          this.suites = Array.isArray(res)
            ? res
            : (res?.data ?? []);
        });
    }
  }



  
if (key === 'suite') {

  console.log('SUITE SELECTED =', value);

this.seleniumRunnerService
  .getPlansBySuite(value)
  .subscribe({
    next: (res: any) => {

      console.log('PLANS RESPONSE =', res);

      this.plans = res?.testPlans ?? [];

      console.log('PLANS ARRAY =', this.plans);

      this.cdr.markForCheck();
    },

    error: err => {
      console.error('PLANS ERROR =', err);
    }
  });console.log('FIRST PLAN =', this.plans[0]);
}


  // SUITE
/*if (key === 'suite') {

  console.log('SUITE ID =', value);

  this.seleniumRunnerService
    .getPlansBySuite(value)
    .subscribe({
      next: (res: any) => {

        console.log('PLANS RESPONSE =', res);

        this.plans = Array.isArray(res)
          ? res
          : (res?.data ?? []);

        console.log('PLANS ARRAY =', this.plans);

        this.cdr.markForCheck();
      },

      error: err => {
        console.error('PLANS ERROR =', err);
      }
    });
}*/

console.log('KEY =', key);
console.log('VALUE =', value);
console.log('FILTERS =', this.filters);

  // PLAN
if (key === 'testPlan') {

  const plan = this.plans.find(
    p => p._id === value
  );

  this.scenario = {
    ...this.scenario,
    planName: plan?.title ?? '',
    caseName: ''
  };

  this.filters.testCase = '';

  this.testCases = [];

  this.seleniumRunnerService
    .getTestCasesByPlan(value)
    .subscribe({
      next: (res: any) => {

        console.log('TEST CASES RESPONSE =', res);

        this.testCases = Array.isArray(res)
          ? res
          : (res?.testCases ?? res?.data ?? []);

        console.log('TEST CASES ARRAY =', this.testCases);
        console.log('FIRST TEST CASE =', this.testCases[0]);

        this.cdr.markForCheck();
      },
      error: err => {
        console.error('TEST CASES ERROR =', err);
      }
    });
}

  /*if (key === 'testPlan') {

  console.log('PLAN SELECTED =', value);

  const plan = this.plans.find(
    p => p._id === value
  );

  console.log('PLAN FOUND =', plan);

  this.seleniumRunnerService
    .getTestCasesByPlan(value)
    .subscribe({
      next: (res: any) => {

        console.log('TEST CASES RESPONSE =', res);

        this.testCases =
          res?.testCases ??
          res?.data ??
          [];

        console.log('TEST CASES ARRAY =', this.testCases);
        console.log('FIRST TEST CASE =', this.testCases[0]);

        this.cdr.markForCheck();
      },
      error: err => {
        console.error('TEST CASES ERROR =', err);
      }
    });
}*/

  this.cdr.markForCheck();
}



onTestCaseChange(event: any): void {

  const value = event.target.value;

  this.filters.testCase = value;

  const testCase = this.testCases.find(
    t => t._id === value
  );

  this.scenario = {
    ...this.scenario,
    caseName: testCase?.title ?? ''
  };

  this.cdr.markForCheck();
}

loadProjects(): void {

  this.seleniumRunnerService.getProjects().subscribe({
    next: (res: any) => {

      console.log('API PROJECTS RESPONSE =', res);

      this.projects = Array.isArray(res)
        ? res
        : (res?.data ?? []);

      console.log('PROJECTS ARRAY =', this.projects);

      this.cdr.markForCheck();
    },

    error: err => {
      console.error('PROJECTS ERROR', err);
    }
  });
}

get canRunSelectedCascade(): boolean {
  console.log('filters', this.filters);
  console.log('isStreaming', this.isStreaming);

  return Boolean(
    this.filters.project &&
    this.filters.suite &&
    this.filters.testPlan &&
    this.filters.testCase &&
    !this.isStreaming
  );
}

get canRun(): boolean {
  return this.canRunSelectedCascade && !this.isStreaming;
}

get canAbort(): boolean {
  return this.isStreaming;
}

get canRerun(): boolean {
  return (
    this.canRunSelectedCascade &&
    !this.isStreaming &&
    (this.scenario.status === 'passed' ||
     this.scenario.status === 'failed' ||
     this.scenario.status === 'aborted')
  );
}

private async maybeAutoAnalyzeFailure(): Promise<void> {
  if (this.scenario.status !== 'failed' && this.scenario.status !== 'aborted') return;
  const executionKey = String(this.currentExecutionId || this.scenario.executionId || '').trim();
  if (!executionKey || this.autoAnalysisRequestedForExecutionId === executionKey || this.isAnalyzingFailure) return;
  this.autoAnalysisRequestedForExecutionId = executionKey;
  await this.requestAIAnalysis();
}

async runSelectedCascade(): Promise<void> {
  console.log('RUN CLICKED');

  this.suiteId = this.filters.suite;
  this.planId = this.filters.testPlan;
  this.testCaseId = this.filters.testCase;

  await this.loadAndRun();
}
}
