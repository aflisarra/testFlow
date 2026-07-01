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

@Component({
  selector: 'app-execution',
  standalone: true,
  imports: [CommonModule],
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
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private testLabService = inject(TestLabService);
  private seleniumRunner = inject(SeleniumRunnerService);
  private api = inject(ApiService);

  activeTab: 'timeline' | 'logs' | 'screenshot' = 'timeline';
private isAborted = false;
  /*metrics: NodeMetrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 };*/

  streamedLogs: LogLine[] = [];
  streamIndex = 0;
private currentExecutionId: string | null = null;

  scenario: TestScenario = this.buildPassScenario();
  isStreaming = false;
  private suiteId = '';
  private planId = '';
  private testCaseId = '';
  private loadedTestCase: LoadedExecutionTestCase | null = null;
  private loadedPlanTestCases: LoadedExecutionTestCase[] = [];
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
      status: 'failed',
      progressPercent: 0,
      progressLabel: 'Missing suiteId or planId',
      activeStepLabel: '⚠ Missing parameters',
      steps: [],
    };
    this.streamedLogs = [{ index: 1, level: 'ERROR', message: 'Missing suiteId or planId.' }];
    this.cdr.markForCheck();
    return;
  }

  try {
    const suite: TestSuiteDto = await firstValueFrom(
      this.testLabService.getTestSuiteById(this.suiteId)
    );
    const planCases = this.getPlanTestCases(suite, this.planId);

    if (!planCases.length) {
      this.streamedLogs = [{ index: 1, level: 'ERROR', message: 'No test cases found for this plan.' }];
      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 0,
        progressLabel: 'No test cases found',
        activeStepLabel: '⚠ Empty plan',
        steps: [],
      };
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

  copySnippet(): void {
    const snippet = `from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.by import By

wait = WebDriverWait(driver, 15)
element = wait.until(EC.element_to_be_clickable((By.ID, "submit-btn")))
element.click()`;
    navigator.clipboard?.writeText(snippet);
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
      projectName: 'Phoenix Nexus',
      suiteName: 'E2E Regression Suite',
      planName: 'Checkout Flow Validation',
      caseName: 'TC-1.1',
      executionId: 'TX-B8402',
      environment: 'Staging',
      executionTime: '—',
      status: 'in-progress',
      progressPercent: 0,
      progressLabel: '0% — 0 / 5 steps completed',
      activeStepLabel: '● Initializing...',
      steps: [
        { id: 1, name: 'Initialize WebDriver Session', subtitle: 'Completed in 1.4s', status: 'pass', timestamp: '14:29:01' },
        { id: 2, name: 'Set Viewport Dimensions (1920×1080)', subtitle: 'Completed in 0.7s', status: 'pass', timestamp: '14:29:02' },
        { id: 3, name: 'Navigate to Login Page', subtitle: 'Attempting connection...', status: 'running', timestamp: '14:29:06' },
        { id: 4, name: 'Submit Credentials', subtitle: 'Waiting...', status: 'waiting', timestamp: '—' },
        { id: 5, name: 'Assert Dashboard Loaded', subtitle: 'Waiting...', status: 'waiting', timestamp: '—' },
      ],
      logs: [],
    };
  }

  private buildFailScenario(): TestScenario {
    return {
      projectName: 'Synthetik Core v2.4',
      suiteName: 'Authentication Suite',
      planName: 'Authentication Flux',
      caseName: 'Auth Flow Validation',
      executionId: 'SR-9421',
      environment: 'Production-Mirror',
      executionTime: '42s',
      status: 'failed',
      progressPercent: 60,
      progressLabel: '100% — failed at step 3 / 5',
      activeStepLabel: '✕ ElementNotInteractable',
      steps: [
        { id: 1, name: 'Initialize WebDriver Session', subtitle: 'Completed in 1.1s', status: 'pass', timestamp: '14:26:01' },
        { id: 2, name: 'Set Viewport Dimensions (1920×1080)', subtitle: 'Completed in 0.5s', status: 'pass', timestamp: '14:26:02' },
        { id: 3, name: 'Login Form Submission', subtitle: 'FAILED: ElementNotInteractableException', status: 'fail', timestamp: '14:26:06' },
        { id: 4, name: 'Submit Credentials', subtitle: 'Skipped (prior step failed)', status: 'skipped', timestamp: '—' },
        { id: 5, name: 'Assert Dashboard Loaded', subtitle: 'Skipped (prior step failed)', status: 'skipped', timestamp: '—' },
      ],
      logs: this.FAIL_LOGS,
      aiRecommendation: {
        element: '#submit-btn',
        description: 'was detected in the DOM but was not yet interactable when the click action was dispatched.',
        suggestedFix: 'Implement an explicit wait for element_to_be_clickable before the action. Current implicit timeout (5s) may be insufficient for this dynamic form.',
      },
      errorMeta: {
        errorType: 'ElementNotInteractable',
        stepName: 'Login Form Submission',
        screenshot: 'capture_fail.png',
        duration: '42s',
      },
      failureSnapshot: `Element: #submit-btn\nAction: click()\nState: ElementNotInteractableException\nDOM: rendered, partially obstructed\nViewport: (742, 460) — outside clickable region\nScreenshot: /artifacts/shots/fail_9421.png`,
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
  }

  // ─── Real execution flow ───────────────────────────────────────────────────

  private async loadAndRun(): Promise<void> {
    this.screenshotUrl = null;

    if (!this.suiteId || !this.planId || !this.testCaseId) {
      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 0,
        progressLabel: 'Missing navigation parameters',
        activeStepLabel: '⚠ Missing suiteId/planId/testCaseId',
        steps: [],
      };
      this.streamedLogs = [{ index: 1, level: 'ERROR', message: 'Missing suiteId, planId or testCaseId.' }];
      this.cdr.markForCheck();
      return;
    }

    try {
      const suite: TestSuiteDto = await firstValueFrom(this.testLabService.getTestSuiteById(this.suiteId));
      const urlCible = String(suite.urlCible || '').trim();
      if (!urlCible) throw new Error('Missing suite urlCible (application URL).');

      const allCases: TestCaseDto[] =
        (suite.testCasesByPlan || []).flatMap(p => p.testCases || []);

      const tc = allCases.find(c => String(c.id || '').trim() === this.testCaseId) || null;
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
      await this.executeLoadedTestCase();
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

  private getPlanTestCases(suite: TestSuiteDto, planId: string): LoadedExecutionTestCase[] {
    const plan = (suite.testCasesByPlan || []).find((p: any) => String(p.id || p._id || p.planId || '').trim() === planId) || null;
    const urlCible = String(suite.urlCible || '').trim();
    if (!plan || !urlCible) return [];

    return (plan.testCases || []).map((tc: TestCaseDto) => {
      const executionModel = this.coerceExecutionModel((tc as any).executionModel || (tc as any).execution_model);
      const credentials = this.resolveExecutionCredentials(tc, suite);
      const testData = (tc as any).test_data ?? (tc as any).testData ?? (tc as any).data ?? null;
      return this.normalizeTestCase(tc, urlCible, executionModel, credentials, testData);
    });
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
    return logs.map((log: any, i: number) => {
      const details = log?.data
        ? Object.entries(log.data).map(([k, v]) =>
            typeof v === 'object' && v !== null && 'publicUrl' in v
              ? `${k}: ${(v as any).publicUrl}`
              : `${k}: ${String(v)}`
          ).join(' | ')
        : '';
      return {
        index: i + 1,
        level: String(log?.level || 'INFO'),
        message: details ? `${log.message} → ${details}` : String(log?.message || ''),
      };
    });
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
    this.cdr.markForCheck();

    this.startLiveRun();
    this.startFakeTimeline(steps.length);

    const startedAt = Date.now();
    const payload = {
      id: testCase.id,
      title: testCase.title,
      executionId: this.currentExecutionId,
      testSuiteId: this.suiteId,
      planId: this.planId,
      url: testCase.urlCible,
      steps: testCase.steps,
      ...(Array.isArray(testCase.stepDetails) ? { stepDetails: testCase.stepDetails } : {}),
      ...(testCase.executionModel ? { executionModel: testCase.executionModel } : {}),
      ...(testCase.test_data ? { test_data: testCase.test_data } : {}),
      ...(testCase.credentials ? { credentials: testCase.credentials } : {}),
    };

    this.runSubscription = this.seleniumRunner
      .runSingleTestCase(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
           if (this.isAborted) {
          this.cdr.markForCheck();
          return;
        }
          const elapsed = Math.max(0, Date.now() - startedAt);
          const secs = `${Math.max(1, Math.round(elapsed / 1000))}s`;
          const respPayload: any = (resp as any)?.data ?? resp;
          const innerData: any = respPayload?.data ?? respPayload;

          if (!respPayload || (typeof respPayload === 'object' && !Array.isArray(respPayload) && Object.keys(respPayload).length === 0)) {
            this.isStreaming = false;
            this.fakeTimelineSubscription?.unsubscribe();
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
            this.cdr.markForCheck();
            return;
          }

          const responseModel = this.coerceExecutionModel(innerData?.executionModel || innerData?.execution_model);
          if (responseModel) {
            this.executionModelSummary = this.describeExecutionModel(responseModel, this.loadedTestCase?.steps.length || 0);
          }

          const stepResults = Array.isArray(innerData?.stepResults) ? innerData.stepResults : [];
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

          this.startLogStream(this.mapRunResponseToLogs(respPayload));
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
          /*this.stopMetrics();*/
          this.scenario = {
            ...this.scenario,
            status: 'failed',
            progressPercent: 100,
            progressLabel: 'Failed',
            activeStepLabel: '✖ Failed',
          };
          this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Selenium request failed.' }];
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
    if (!this.suiteId || !this.planId) return;

    try {
      const suite: TestSuiteDto = await firstValueFrom(this.testLabService.getTestSuiteById(this.suiteId));
      const planCases = this.getPlanTestCases(suite, this.planId);

      if (!planCases.length) {
        this.streamedLogs = [{ index: 1, level: 'ERROR', message: 'No test cases found for this test plan.' }];
        this.cdr.markForCheck();
        return;
      }

      for (const [index, testCase] of planCases.entries()) {
        this.loadedTestCase = testCase;
        this.scenario = {
          ...this.scenario,
          caseName: testCase.title,
          progressLabel: `Executing test case ${index + 1}/${planCases.length}`,
          activeStepLabel: `Running ${testCase.title}`,
        };
        this.cdr.markForCheck();
        await this.executeLoadedTestCase(testCase);
        if (this.scenario.status === 'failed' || this.scenario.status === 'aborted') {
          break;
        }
      }
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
}
