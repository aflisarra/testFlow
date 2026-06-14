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
  NodeMetrics,
  StepStatus,
  TestScenario,
  TestStatus,
} from '@/app/interfaces/execution.interface';

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type LoadedExecutionTestCase = {
  id: string
  title: string
  steps: string[]
  urlCible: string
  executionModel?: ExecutionModelDto | null
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
  private testLabService = inject(TestLabService)
  private seleniumRunner = inject(SeleniumRunnerService)
  private api = inject(ApiService)

  activeTab: 'timeline' | 'logs' | 'screenshot' = 'timeline';

  metrics: NodeMetrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 };

  streamedLogs: LogLine[] = [];
  streamIndex = 0;

  scenario: TestScenario = this.buildPassScenario();
  isStreaming = false;
  private suiteId = ''
  private planId = ''
  private testCaseId = ''
  private loadedTestCase: LoadedExecutionTestCase | null = null
  recentRuns: TestExecutionDto[] = []
  liveRun: TestExecutionDto | null = null
  recentRunsPage = 1
  readonly recentRunsPageSize = 5
  screenshotUrl: string | null = null
  selectedScreenshotUrl: string | null = null
  executionModelSummary = 'execution-model/v1 pending'

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
  console.log("📍 INIT ExecutionComponent");

  this.route.queryParamMap.subscribe((qp) => {
    const suiteId = String(qp.get('suiteId') || '').trim();
    const planId = String(qp.get('planId') || '').trim();

    const projectName = qp.get('projectName');
    const suiteName = qp.get('suiteName');
    const planName = qp.get('planName');
    const testCaseName = qp.get('testCaseName');

    this.route.paramMap.subscribe((pp) => {
      const testCaseId = String(pp.get('id') || '').trim();

      // ✅ assignation finale
      this.suiteId = suiteId;
      this.planId = planId;
      this.testCaseId = testCaseId;

      console.log("✅ ALL PARAMS READY:", {
        suiteId: this.suiteId,
        planId: this.planId,
        testCaseId: this.testCaseId
      });

      // ✅ mise à jour UI
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

      // ✅ LANCEMENT UNIQUEMENT ICI
      void this.loadAndRun();
      void this.loadRecentRuns();
    });
  });
}

  // ─── Public actions ───────────────────────────────────────────

  toggleScenario(): void {
    this.rerun()
  }

  rerun(): void {
    this.stopAll();
    void this.executeLoadedTestCase()
  }

  abort(): void {
    this.stopAll();
    this.scenario = {
      ...this.scenario,
      status: 'aborted',
      activeStepLabel: '■ Aborted',
    };
    this.cdr.markForCheck();
  }

  setTab(tab: 'timeline' | 'logs' | 'screenshot'): void {
    this.activeTab = tab;
  }

  openScreenshot(url: string | null | undefined): void {
    if (!url) return
    this.selectedScreenshotUrl = url
  }

  closeScreenshot(): void {
    this.selectedScreenshotUrl = null
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

  // ─── Scenario builders ─────────────────────────────────────────

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
        { id: 3, name: 'Navigating to Login Page', subtitle: 'Attempting connection to staging.app/login...', status: 'running', timestamp: '14:29:06' },
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

  // ─── Execution simulation ──────────────────────────────────────

  private startPassExecution(): void {
    this.scenario = this.buildPassScenario();
    this.streamedLogs = [];
    this.streamIndex = 0;
    this.isStreaming = true;
    this.cdr.markForCheck();

    this.startMetricsAnimation();

    // Progress steps over time
    const steps = [
      { delay: 800, progress: 40, label: '40% — 2 / 5 steps completed', active: '● Navigating to Login Page' },
      { delay: 2400, progress: 60, label: '60% — 3 / 5 steps completed', active: '● Navigating to Login Page' },
      { delay: 4000, progress: 80, label: '80% — 4 / 5 steps completed', active: '● Submitting credentials' },
      { delay: 6000, progress: 100, label: '100% — 5 / 5 steps completed', active: '✓ All steps passed' },
    ];

    steps.forEach(({ delay, progress, label, active }) => {
      setTimeout(() => {
        if (this.isStreaming) {
          this.scenario = { ...this.scenario, progressPercent: progress, progressLabel: label, activeStepLabel: active };
          if (progress === 80) {
            this.scenario.steps[3] = { ...this.scenario.steps[3], status: 'running', subtitle: 'In progress...', timestamp: '14:29:08' };
          }
          if (progress === 100) {
            this.finalizePassScenario();
          }
          this.cdr.markForCheck();
        }
      }, delay);
    });

    this.startLogStream(this.PASS_LOGS);
  }

  private finalizePassScenario(): void {
    this.isStreaming = false;
    this.stopMetrics();
    this.scenario = {
      ...this.scenario,
      status: 'passed',
      executionTime: '18s',
      steps: [
        { id: 1, name: 'Initialize WebDriver Session', subtitle: 'Completed in 1.4s', status: 'pass', timestamp: '14:29:01' },
        { id: 2, name: 'Set Viewport Dimensions (1920×1080)', subtitle: 'Completed in 0.7s', status: 'pass', timestamp: '14:29:02' },
        { id: 3, name: 'Navigating to Login Page', subtitle: 'Completed in 2.1s', status: 'pass', timestamp: '14:29:06' },
        { id: 4, name: 'Submit Credentials', subtitle: 'Completed in 1.5s', status: 'pass', timestamp: '14:29:08' },
        { id: 5, name: 'Assert Dashboard Loaded', subtitle: 'Completed in 0.9s', status: 'pass', timestamp: '14:29:09' },
      ],
    };
    this.metrics = { cpu: 8, memory: 1.0, latency: 18, threads: 4 };
    this.cdr.markForCheck();
  }

  private loadFailScenario(): void {
    this.scenario = this.buildFailScenario();
    this.streamedLogs = [...this.FAIL_LOGS];
    this.metrics = { cpu: 31, memory: 1.4, latency: 65, threads: 8 };
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

  private startMetricsAnimation(): void {
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
  }

  private stopMetrics(): void {
    this.metricsSubscription?.unsubscribe();
  }

  private stopAll(): void {
    this.isStreaming = false;
    this.stopMetrics();
    this.logStreamSubscription?.unsubscribe();
    this.runSubscription?.unsubscribe();
    this.fakeTimelineSubscription?.unsubscribe();
    this.stopLiveRunTimer()
  }

  get recentRunsMerged(): TestExecutionDto[] {
    const merged = [...this.recentRuns]
    if (this.liveRun) {
      const idx = merged.findIndex((run) => run.executionId === this.liveRun?.executionId)
      if (idx >= 0) merged[idx] = this.liveRun
      else merged.unshift(this.liveRun)
    }
    return merged
  }

  get recentRunsTotalPages(): number {
    return Math.max(1, Math.ceil(this.recentRunsMerged.length / this.recentRunsPageSize))
  }

  get paginatedRecentRuns(): TestExecutionDto[] {
    const start = (this.recentRunsPage - 1) * this.recentRunsPageSize
    return this.recentRunsMerged.slice(start, start + this.recentRunsPageSize)
  }

  get recentRunsVisibleStart(): number {
    return this.recentRunsMerged.length === 0 ? 0 : (this.recentRunsPage - 1) * this.recentRunsPageSize + 1
  }

  get recentRunsVisibleEnd(): number {
    return Math.min(this.recentRunsPage * this.recentRunsPageSize, this.recentRunsMerged.length)
  }

  goToRecentRunsPreviousPage(): void {
    if (this.recentRunsPage > 1) this.recentRunsPage--
  }

  goToRecentRunsNextPage(): void {
    if (this.recentRunsPage < this.recentRunsTotalPages) this.recentRunsPage++
  }

  // ─── Template helpers ──────────────────────────────────────────

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

  trackByStep(_: number, step: ExecutionStep): number {
    return step.id;
  }

  trackByLog(_: number, log: LogLine): number {
    return log.index;
  }

  // â”€â”€â”€ Real execution flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private async loadAndRun(): Promise<void> {
  console.log("🚀 loadAndRun START");

  console.log("📍 PARAMS:", {
    suiteId: this.suiteId,
    planId: this.planId,
    testCaseId: this.testCaseId
  });

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
    this.streamedLogs = [
      { index: 1, level: 'ERROR', message: 'Missing suiteId, planId or testCaseId.' },
    ];
    this.cdr.markForCheck();
    return;
  }

  try {
    const suite: TestSuiteDto = await firstValueFrom(
      this.testLabService.getTestSuiteById(this.suiteId)
    );

    console.log("✅ SUITE LOADED:", suite);

    const urlCible = String(suite.urlCible || '').trim();

    if (!urlCible) {
      throw new Error('Missing suite urlCible (application URL).');
    }

    // ✅ ✅ ✅ FIX MAJEUR : récupérer TOUS les test cases
    const allCases: TestCaseDto[] =
      (suite.testCasesByPlan || []).flatMap(p => p.testCases || []);

    console.log("📋 ALL TEST CASES:", allCases.map(c => c.id));

    // ✅ chercher le test case directement
    const tc = allCases.find(
      (c) => String(c.id || '').trim() === this.testCaseId
    ) || null;

    console.log("✅ TEST CASE FOUND:", tc);

    if (!tc) {
      throw new Error(`Test case "${this.testCaseId}" not found.`);
    }

    // ✅ construire le test case chargé
    const steps = Array.isArray(tc.steps)
      ? tc.steps.map((s) => String(s))
      : [];

    const executionModel = this.coerceExecutionModel(
      (tc as any).executionModel || (tc as any).execution_model
    );

    const credentials = this.resolveExecutionCredentials(tc, suite);

    this.loadedTestCase = {
      id: String(tc.id),
      title: String(tc.title || tc.id),
      steps,
      urlCible,
      executionModel,
      ...(credentials ? { credentials } : {}),
    };

    console.log("✅ LOADED TEST CASE FINAL:", this.loadedTestCase);

    this.executionModelSummary = this.describeExecutionModel(
      executionModel,
      steps.length
    );

    // UI labels
    const qp = this.route.snapshot.queryParamMap;
    this.scenario = {
      ...this.scenario,
      suiteName: qp.get('suiteName') || this.scenario.suiteName,
      planName: qp.get('planName') || this.scenario.planName,
      caseName: qp.get('testCaseName') || this.loadedTestCase.title,
    };

    this.cdr.markForCheck();

    // ✅ LANCEMENT
    await this.executeLoadedTestCase();

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    console.error("❌ loadAndRun ERROR:", msg);

    this.scenario = {
      ...this.scenario,
      status: 'failed',
      progressPercent: 0,
      progressLabel: 'Failed to load test case',
      activeStepLabel: '✖ Failed',
      steps: [],
    };

    this.streamedLogs = [
      { index: 1, level: 'ERROR', message: msg || 'Unable to load test case.' }
    ];

    this.cdr.markForCheck();
  }
}

  private async loadRecentRuns(): Promise<void> {
    try {
      const rows = this.suiteId
        ? await firstValueFrom(this.testLabService.getTestExecutions(this.suiteId))
        : await firstValueFrom(this.testLabService.getRecentExecutions(20))
      this.recentRuns = Array.isArray(rows) ? rows : []
      if (this.recentRunsPage > this.recentRunsTotalPages) this.recentRunsPage = this.recentRunsTotalPages
      this.cdr.markForCheck()
    } catch {
      try {
        const fallbackRows = await firstValueFrom(this.testLabService.getRecentExecutions(20))
        this.recentRuns = Array.isArray(fallbackRows) ? fallbackRows : []
        this.cdr.markForCheck()
      } catch {
        this.recentRuns = []
      }
    }
  }

  getRunStatusLabel(status: TestExecutionDto['status']): string {
    return status === 'passed' ? 'Passed' : status === 'failed' ? 'Failed' : status === 'aborted' ? 'Aborted' : 'Running'
  }

  private buildTimelineSteps(stepTexts: string[]): ExecutionStep[] {
    const ts = new Date().toLocaleTimeString()
    return stepTexts.map((s, idx) => ({
      id: idx + 1,
      name: s || `Step ${idx + 1}`,
      subtitle: 'Waiting...',
      status: 'waiting',
      timestamp: ts,
    }))
  }

  private coerceExecutionModel(value: unknown): ExecutionModelDto | null {
    if (!value) return null

    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as ExecutionModelDto
      } catch {
        return null
      }
    }

    if (typeof value === 'object') return value as ExecutionModelDto
    return null
  }

  private modelStepLabel(step: ExecutionModelStepDto, index: number): string {
    const raw = String(step.raw || '').trim()
    if (raw) return raw

    const action = String(step.action || 'step').replace(/_/g, ' ')
    const target = String(step.target?.name || step.target?.kind || '').trim()
    return target ? `${action}: ${target}` : `Step ${index + 1}`
  }

  private getTimelineSource(testCase: LoadedExecutionTestCase): string[] {
    const modelSteps = testCase.executionModel?.steps || []
    if (modelSteps.length) return modelSteps.map((step, index) => this.modelStepLabel(step, index))
    return testCase.steps
  }

  private describeExecutionModel(model: ExecutionModelDto | null | undefined, fallbackSteps: number): string {
    if (!model?.steps?.length) return `local fallback pending · ${fallbackSteps} steps`

    const channels = new Set(model.steps.map((step) => String(step.channel || 'unknown').trim()).filter(Boolean))
    const channelText = Array.from(channels).join(', ') || 'unknown'
    return `${model.version || 'execution-model/v1'} · ${model.steps.length} steps · ${channelText}`
  }

  private readStringField(source: unknown, keys: string[]): string {
    const record = (source || {}) as Record<string, unknown>

    for (const key of keys) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
      if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    }

    return ''
  }

  private resolveExecutionCredentials(tc: TestCaseDto, suite: TestSuiteDto): LoadedExecutionTestCase['credentials'] | undefined {
    const qp = this.route.snapshot.queryParamMap
    const tcRecord = tc as unknown as Record<string, unknown>
    const suiteRecord = suite as unknown as Record<string, unknown>
    const nestedCredentials = (tcRecord['credentials'] || suiteRecord['credentials'] || {}) as Record<string, unknown>

    const email =
      String(qp.get('loginEmail') || qp.get('appEmail') || qp.get('basicAuthEmail') || qp.get('basicAuthUsername') || qp.get('username') || qp.get('jiraEmail') || qp.get('email') || '').trim() ||
      this.readStringField(nestedCredentials, ['email', 'username', 'login', 'userEmail', 'basicAuthEmail', 'basicAuthUsername', 'jiraEmail']) ||
      this.readStringField(tc, ['email', 'username', 'login', 'userEmail', 'basicAuthEmail', 'basicAuthUsername', 'jiraEmail']) ||
      this.readStringField(suite, ['email', 'username', 'login', 'userEmail', 'basicAuthEmail', 'basicAuthUsername', 'jiraEmail'])

    const password =
      String(qp.get('loginPassword') || qp.get('appPassword') || qp.get('password') || '').trim() ||
      this.readStringField(nestedCredentials, ['password', 'loginPassword', 'appPassword']) ||
      this.readStringField(tc, ['password', 'loginPassword', 'appPassword']) ||
      this.readStringField(suite, ['password', 'loginPassword', 'appPassword'])

    const apiToken =
      String(qp.get('basicAuthToken') || qp.get('basicAuthPassword') || qp.get('apiToken') || qp.get('token') || qp.get('jiraApiToken') || '').trim() ||
      this.readStringField(nestedCredentials, ['apiToken', 'token', 'basicAuthToken', 'basicAuthPassword', 'jiraApiToken']) ||
      this.readStringField(tc, ['apiToken', 'token', 'basicAuthToken', 'basicAuthPassword', 'jiraApiToken']) ||
      this.readStringField(suite, ['apiToken', 'token', 'basicAuthToken', 'basicAuthPassword', 'jiraApiToken'])

    if (!email && !password && !apiToken) return undefined

    return {
      ...(email ? { email } : {}),
      ...(password ? { password } : {}),
      ...(apiToken ? { apiToken } : {}),
    }
  }

  private startFakeTimeline(totalSteps: number): void {
    if (totalSteps <= 0) return
    let idx = 0
    this.fakeTimelineSubscription?.unsubscribe()
    this.fakeTimelineSubscription = interval(650)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!this.isStreaming) return
        idx = Math.min(idx, totalSteps - 1)

        const steps = [...this.scenario.steps]
        for (let i = 0; i < steps.length; i++) {
          if (steps[i].status === 'pass' || steps[i].status === 'fail') continue
          steps[i] = { ...steps[i], status: i === idx ? 'running' : 'waiting' }
        }

        const progress = Math.min(95, Math.round(((idx + 1) / totalSteps) * 95))
        this.scenario = {
          ...this.scenario,
          status: 'in-progress',
          steps,
          progressPercent: progress,
          progressLabel: `Running step ${idx + 1}/${totalSteps}...`,
          activeStepLabel: `▶ Step ${idx + 1}`,
        }
        this.cdr.markForCheck()

        idx++
        if (idx >= totalSteps) idx = totalSteps - 1
      })
  }

private mapStepResultsToScenarioSteps(
  stepResults: SeleniumStepResultDto[]
): ExecutionStep[] {

  const now = new Date().toLocaleTimeString()

  return (stepResults || []).map((r) => ({

    id: Number(r.index) || 0,

    name: String(r.name || `Step ${r.index}`),

    subtitle:
      r.status === 'passed'
        ? 'Passed'
        : (
            r.error ||
            r.message ||
            'Failed'
          ),

    status:
      r.status === 'passed'
        ? 'pass'
        : r.status === 'failed_assertion'
          ? 'fail'
          : r.status === 'failed_execution'
            ? 'fail'
            : 'waiting',

    timestamp: now,

    screenshotUrl: this.resolveScreenshotUrl(

      r.screenshots?.[0]?.publicUrl ||

      r.screenshots?.[0]?.path ||

      r.screenshot?.publicUrl ||

      r.screenshot?.path ||

      r.screenshotPath ||

      ''

    )
  }))
}

  get stepsWithScreenshots(): ExecutionStep[] {
    return this.scenario.steps.filter((step) => Boolean(step.screenshotUrl))
  }

private mapRunResponseToLogs(resp: any): LogLine[] {

  const data = resp?.data ?? resp

  const logs = Array.isArray(data?.logs)
    ? data.logs
    : []

  return logs.map((log: any, i: number) => {

    const details =
      log?.data
        ? Object.entries(log.data)
            .map(([k, v]) => {

              if (
                typeof v === 'object' &&
                v !== null &&
                'publicUrl' in v
              ) {
                return `${k}: ${(v as any).publicUrl}`
              }

              return `${k}: ${String(v)}`
            })
            .join(' | ')
        : ''

    return {

      index: i + 1,

      level: String(log?.level || 'INFO'),

      message: details
        ? `${log.message} → ${details}`
        : String(log?.message || '')
    }
  })
}

 private resolveScreenshotUrl(path: string): string | null {

  if (!path) return null

  if (path.startsWith('http')) return path

  // ✅ FIX URL BACKEND
  return 'http://localhost:3000' + path
}

  private async executeLoadedTestCase(): Promise<void> {
    
console.log("🚀 EXECUTE LOADED TEST CASE");
console.log("📦 loadedTestCase:", this.loadedTestCase);

    if (!this.loadedTestCase) return

    this.stopAll()
    this.isStreaming = true
    this.screenshotUrl = null
    this.metrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 }
    this.startMetricsAnimation()

    const timelineSource = this.getTimelineSource(this.loadedTestCase)
    const steps = this.buildTimelineSteps(timelineSource)
    this.scenario = {
      ...this.scenario,
      status: 'in-progress',
      executionTime: '—',
      steps,
      progressPercent: 5,
      progressLabel: 'Starting standardized execution...',
      activeStepLabel: '▶ Starting',
    }
    
this.streamedLogs = [
  { index: 1, level: 'INFO', message: 'Preparing execution...' }]

    this.cdr.markForCheck()

    this.startLiveRun()

    this.startFakeTimeline(steps.length)

    const startedAt = Date.now()
    const payload = {
  id: this.loadedTestCase.id,
  title: this.loadedTestCase.title,

  testSuiteId: this.suiteId,
  planId: this.planId,

  // ✅ FIX IMPORTANT
  url: this.loadedTestCase.urlCible,

  steps: this.loadedTestCase.steps,

  ...(this.loadedTestCase.executionModel
    ? { executionModel: this.loadedTestCase.executionModel }
    : {}),

  ...(this.loadedTestCase.credentials
    ? { credentials: this.loadedTestCase.credentials }
    : {})
}

      this.runSubscription = this.seleniumRunner
  .runSingleTestCase(payload)
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe({

    next: (resp) => {

      console.log('[execution] run response', resp)

      const elapsed = Math.max(0, Date.now() - startedAt)
      const secs = `${Math.max(1, Math.round(elapsed / 1000))}s`

      const payload: any = (resp as any)?.data ?? resp

      const responseModel = this.coerceExecutionModel(
        payload?.executionModel || payload?.execution_model
      )

      if (responseModel) {
        this.executionModelSummary =
          this.describeExecutionModel(
            responseModel,
            this.loadedTestCase?.steps.length || 0
          )
      }

      const stepResults =
        Array.isArray(payload?.stepResults)
          ? payload.stepResults
          : []

      const mappedSteps =
        stepResults.length
          ? this.mapStepResultsToScenarioSteps(stepResults)
          : this.scenario.steps

      const failedStep = stepResults.find(
        (s: SeleniumStepResultDto) =>
          s.status === 'failed_execution' ||
          s.status === 'failed_assertion'
      ) || null

      const screenshotList = Array.isArray(payload?.screenshots)
        ? payload.screenshots
        : []

      const latestScreenshot =
        screenshotList[screenshotList.length - 1]

      const screenshotPath = String(

  typeof failedStep?.screenshots?.[0] === 'string'
    ? failedStep?.screenshots?.[0]
    : failedStep?.screenshots?.[0]?.publicUrl ||

      failedStep?.screenshots?.[0]?.path ||

      failedStep?.screenshot?.publicUrl ||

      failedStep?.screenshot?.path ||

      failedStep?.screenshotPath ||

      latestScreenshot?.publicUrl ||

      latestScreenshot?.path ||

      payload?.screenshot?.publicUrl ||

      payload?.screenshotPath ||

      ''

).trim()

  

      this.screenshotUrl =
        this.resolveScreenshotUrl(screenshotPath)

      this.isStreaming = false

      this.fakeTimelineSubscription?.unsubscribe()

      this.stopMetrics()

      this.scenario = {
        ...this.scenario,

        status:
          payload?.status === 'passed'
            ? 'passed'
            : 'failed',

        executionTime: secs,

        steps: mappedSteps,

        progressPercent: 100,

        progressLabel:
          payload?.status === 'passed'
            ? 'Completed'
            : 'Completed with errors',

        activeStepLabel:
          payload?.status === 'passed'
            ? '✓ Completed'
            : '✖ Failed',

        errorMeta: screenshotPath
          ? {
              errorType: 'SeleniumStepFailed',
              stepName: String(failedStep?.name || ''),
              screenshot: this.screenshotUrl || screenshotPath,
              duration: secs,
            }
          : undefined,
      }

      // ✅ LOGS FIX
      const logs = this.mapRunResponseToLogs(payload)

      this.startLogStream(logs)

      void this.loadRecentRuns()

      this.stopLiveRunTimer()

      this.cdr.markForCheck()
    },

    error: (err: unknown) => {

      console.error('[execution] run error', err)

      const msg =
        err instanceof Error
          ? err.message
          : String(err)

      this.isStreaming = false

      this.fakeTimelineSubscription?.unsubscribe()

      this.stopMetrics()

      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 100,
        progressLabel: 'Failed',
        activeStepLabel: '✖ Failed',
      }

      this.streamedLogs = [
        {
          index: 1,
          level: 'ERROR',
          message: msg || 'Selenium request failed.'
        }
      ]

      this.stopLiveRunTimer()

      void this.loadRecentRuns()

      this.cdr.markForCheck()
    },
  })
      
  }

  private startLiveRun(): void {
    const startedAt = Date.now()
    const executionId = `LIVE-${this.suiteId}-${this.planId}-${this.loadedTestCase?.id || 'tc'}`
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
    }
    this.stopLiveRunTimer()
    this.liveRunTimer = setInterval(() => {
      if (!this.liveRun) return
      this.liveRun = {
        ...this.liveRun,
        duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      }
      this.cdr.markForCheck()
    }, 1000)
  }

  private stopLiveRunTimer(): void {
    if (this.liveRunTimer) {
      clearInterval(this.liveRunTimer)
      this.liveRunTimer = undefined
    }
  }
}
