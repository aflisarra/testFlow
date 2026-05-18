import { CommonModule } from '@angular/common';
import {
    ChangeDetectionStrategy,
    ChangeDetectorRef,
    Component,
    OnInit,
    DestroyRef,
    inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { interval, Subscription, firstValueFrom } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TestLabService } from '@/app/core/services/testlab.service'
import { SeleniumRunnerService, type SeleniumRunResponseDto, type SeleniumStepResultDto } from '@/app/core/services/selenium-runner.service'
import type { TestCaseDto, TestCasesByPlanDto, TestSuiteDto } from '@/app/core/services/testlab.service'

import type {
  ExecutionStep,
  LogLine,
  NodeMetrics,
  StepStatus,
  TestScenario,
  TestStatus,
} from '@/app/interfaces/execution.interface'

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
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);
  private route = inject(ActivatedRoute);
  private testLabService = inject(TestLabService)
  private seleniumRunner = inject(SeleniumRunnerService)

  activeTab: 'timeline' | 'logs' | 'screenshot' = 'timeline';

  metrics: NodeMetrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 };

  streamedLogs: LogLine[] = [];
  streamIndex = 0;

  scenario: TestScenario = this.buildPassScenario();
  isStreaming = false;
  private suiteId = ''
  private planId = ''
  private testCaseId = ''
  private loadedTestCase: { id: string; title: string; steps: string[]; urlCible: string } | null = null
  screenshotUrl: string | null = null

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
    const qp = this.route.snapshot.queryParamMap;
    const pp = this.route.snapshot.paramMap;

    this.suiteId = String(qp.get('suiteId') || '').trim()
    this.planId = String(qp.get('planId') || '').trim()
    this.testCaseId = String(pp.get('id') || qp.get('testCaseId') || '').trim()

    const projectName = qp.get('projectName');
    const suiteName = qp.get('suiteName');
    const planName = qp.get('planName');
    const testCaseName = qp.get('testCaseName');

    if (projectName || suiteName || planName || testCaseName) {
      this.scenario = {
        ...this.scenario,
        projectName: projectName || this.scenario.projectName,
        suiteName: suiteName || this.scenario.suiteName,
        planName: planName || this.scenario.planName,
        caseName: testCaseName || this.scenario.caseName,
      };
      this.cdr.markForCheck();
    }

    void this.loadAndRun()
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
    this.screenshotUrl = null

    if (!this.suiteId || !this.planId || !this.testCaseId) {
      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 0,
        progressLabel: 'Missing navigation parameters',
        activeStepLabel: '⚠ Missing suiteId/planId/testCaseId',
        steps: [],
      }
      this.streamedLogs = [
        { index: 1, level: 'ERROR', message: 'Missing suiteId, planId or testCaseId. Navigate from Test List → Run.' },
      ]
      this.cdr.markForCheck()
      return
    }

    try {
      const suite: TestSuiteDto = await firstValueFrom(this.testLabService.getTestSuiteById(this.suiteId))
      const urlCible = String(suite.urlCible || '').trim()
      const plans: TestCasesByPlanDto[] = suite.testCasesByPlan || []
      const plan = plans.find((p) => String(p.planId || '').trim() === this.planId) || null
      const cases: TestCaseDto[] = plan?.testCases || []
      const tc = cases.find((c) => String(c.id || '').trim() === this.testCaseId) || null

      if (!tc) {
        throw new Error(`Test case "${this.testCaseId}" not found in plan "${this.planId}".`)
      }
      if (!urlCible) {
        throw new Error('Missing suite urlCible (application URL).')
      }

      const steps = Array.isArray(tc.steps) ? tc.steps.map((s) => String(s)) : []
      this.loadedTestCase = { id: String(tc.id), title: String(tc.title || tc.id), steps, urlCible }

      // Fill breadcrumb labels if not provided
      const qp = this.route.snapshot.queryParamMap
      this.scenario = {
        ...this.scenario,
        suiteName: qp.get('suiteName') || this.scenario.suiteName,
        planName: qp.get('planName') || this.scenario.planName,
        caseName: qp.get('testCaseName') || this.loadedTestCase.title,
      }

      await this.executeLoadedTestCase()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.scenario = {
        ...this.scenario,
        status: 'failed',
        progressPercent: 0,
        progressLabel: 'Failed to load test case',
        activeStepLabel: '✖ Failed',
        steps: [],
      }
      this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Unable to load test case.' }]
      this.cdr.markForCheck()
    }
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

  private mapStepResultsToScenarioSteps(stepResults: SeleniumStepResultDto[]): ExecutionStep[] {
    const now = new Date().toLocaleTimeString()
    return (stepResults || []).map((r) => ({
      id: Number(r.index) || 0,
      name: String(r.name || `Step ${r.index}`),
      subtitle: r.status === 'passed' ? 'Passed' : (r.message || 'Failed'),
      status: r.status === 'passed' ? 'pass' : 'fail',
      timestamp: now,
    }))
  }

  private mapRunResponseToLogs(resp: SeleniumRunResponseDto): LogLine[] {
    const stepResults = Array.isArray(resp?.stepResults) ? resp.stepResults : []
    const logs: LogLine[] = []
    let i = 1
    logs.push({ index: i++, level: 'INFO', message: 'Selenium execution started' })
    for (const s of stepResults) {
      if (s.status === 'passed') {
        logs.push({ index: i++, level: 'SUCCESS', message: `Step ${s.index}: ${s.name} → passed` })
      } else {
        logs.push({ index: i++, level: 'FAIL', message: `Step ${s.index}: ${s.name} → failed` })
        if (s.message) logs.push({ index: i++, level: 'ERROR', message: String(s.message) })
        if (s.screenshotPath) logs.push({ index: i++, level: 'INFO', message: `Screenshot: /api/uploads/${s.screenshotPath}` })
      }
    }
    if (resp?.status === 'passed') logs.push({ index: i++, level: 'SUCCESS', message: 'Test PASSED' })
    if (resp?.status === 'failed') logs.push({ index: i++, level: 'FAIL', message: 'Test FAILED' })
    if (resp?.status === 'error') logs.push({ index: i++, level: 'ERROR', message: resp.errorMessage || resp.message || 'Test ERROR' })
    return logs
  }

  private async executeLoadedTestCase(): Promise<void> {
    if (!this.loadedTestCase) return

    this.stopAll()
    this.isStreaming = true
    this.screenshotUrl = null
    this.metrics = { cpu: 24, memory: 1.2, latency: 42, threads: 8 }
    this.startMetricsAnimation()

    const steps = this.buildTimelineSteps(this.loadedTestCase.steps)
    this.scenario = {
      ...this.scenario,
      status: 'in-progress',
      executionTime: '—',
      steps,
      progressPercent: 5,
      progressLabel: 'Starting Selenium execution...',
      activeStepLabel: '▶ Starting',
    }
    this.streamedLogs = [{ index: 1, level: 'INFO', message: 'Preparing Selenium request...' }]
    this.cdr.markForCheck()

    this.startFakeTimeline(steps.length)

    const startedAt = Date.now()
    const payload = {
      id: this.loadedTestCase.id,
      title: this.loadedTestCase.title,
      urlCible: this.loadedTestCase.urlCible,
      steps: this.loadedTestCase.steps,
    }

    this.runSubscription = this.seleniumRunner.runSingleTestCase(payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (resp) => {
          const elapsed = Math.max(0, Date.now() - startedAt)
          const secs = `${Math.max(1, Math.round(elapsed / 1000))}s`
          const stepResults = Array.isArray(resp?.stepResults) ? resp.stepResults : []
          const mappedSteps = stepResults.length ? this.mapStepResultsToScenarioSteps(stepResults) : this.scenario.steps

          const failedStep = stepResults.find((s) => s.status === 'failed') || null
          const screenshotPath = String(failedStep?.screenshotPath || resp?.screenshotPath || '').trim()
          this.screenshotUrl = screenshotPath ? `/api/uploads/${screenshotPath}` : null

          this.isStreaming = false
          this.fakeTimelineSubscription?.unsubscribe()
          this.stopMetrics()

          this.scenario = {
            ...this.scenario,
            status: resp?.status === 'passed' ? 'passed' : 'failed',
            executionTime: secs,
            steps: mappedSteps,
            progressPercent: 100,
            progressLabel: resp?.status === 'passed' ? 'Completed' : 'Completed with errors',
            activeStepLabel: resp?.status === 'passed' ? '✓ Completed' : '✖ Failed',
            errorMeta: screenshotPath ? {
              errorType: 'SeleniumStepFailed',
              stepName: String(failedStep?.name || ''),
              screenshot: screenshotPath,
              duration: secs,
            } : undefined,
          }

          const logs = this.mapRunResponseToLogs(resp || { status: 'error' })
          this.startLogStream(logs)
          this.cdr.markForCheck()
        },
        error: (err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err)
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
          this.streamedLogs = [{ index: 1, level: 'ERROR', message: msg || 'Selenium request failed.' }]
          this.cdr.markForCheck()
        },
      })
  }
}
