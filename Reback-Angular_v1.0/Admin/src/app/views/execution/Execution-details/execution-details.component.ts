import { SeleniumRunnerService } from '@/app/core/services/selenium-runner.service';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

export interface ExecutionDetailStep {
  index: number;
  name: string;
  status:
    | 'passed'
    | 'failed'
    | 'failed_execution'
    | 'failed_assertion'
    | 'warning'
    | 'skipped';
  screenshotUrl?: string | null;
  message?: string;
  actualResult?: string;
  expectedResult?: string;
}

export interface ExecutionDetailLog {
  timestamp: string;
  level: 'INFO' | 'STEP' | 'WARN' | 'ERROR' | 'SUCCESS';
  message: string;
}

export interface ExecutionDetailData {
  executionId: string;
  testCaseKey: string;
  testCaseTitle: string;
  planTitle?: string;
  executedByName?: string;
  executedBy?: { name?: string; picture?: string } | null;
  environment?: string;
  status:
  | 'passed'
  | 'failed'
  | 'failed_execution'
  | 'failed_assertion'
  | 'aborted'
  | 'running';
  duration?: number | string;
  platform?: string;
  browser?: string;
  startedAt?: string;
  steps?: ExecutionDetailStep[];
  logs?: ExecutionDetailLog[];
  rawExecution?: unknown;
}

// ─── Types décrivant la forme brute renvoyée par le backend ───────────

interface RawScreenshotRef {
  publicUrl?: string;
  path?: string;
}

type RawScreenshot = string | RawScreenshotRef | undefined;

interface RawStepResult {
  index?: number | string;
  name?: string;
  step?: string;
  status?: string;
  screenshotPath?: RawScreenshot;
  screenshot?: RawScreenshot;
  allScreenshots?: RawScreenshotRef[];
  screenshots?: RawScreenshotRef[];
  screenshotUrl?: string;
  message?: string;
  error?: string;
  actualResult?: string;
  actual?: string;
  expectedResult?: string;
  expected?: string;
}

interface RawLogEntry {
  timestamp?: string;
  level?: string;
  message?: string;
  data?: Record<string, unknown>;
}

interface RawExecutionDetailPayload {
  executedByName?: string;
  executedBy?: { name?: string; picture?: string } | null;
  stepsResults?: RawStepResult[];
  stepResults?: RawStepResult[];
  steps?: RawStepResult[];
  logs?: RawLogEntry[];
}

interface RawExecutionDetailResponse {
  data?: RawExecutionDetailPayload;
}

@Component({
  selector: 'app-execution-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './execution-details.component.html',
  styleUrls: ['./execution-details.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionDetailModalComponent implements OnChanges, OnInit, OnDestroy {
  @Input() execution: ExecutionDetailData | null = null;
  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();
  @Output() retest = new EventEmitter<ExecutionDetailData>();
  @Output() approve = new EventEmitter<ExecutionDetailData>();

  private cdr = inject(ChangeDetectorRef);
  private seleniumRunner = inject(SeleniumRunnerService);
  private el = inject(ElementRef);

  activeTab: 'screenshots' | 'logs' = 'screenshots';
  selectedStepIndex = 0;
  isLoadingDetail = false;

  steps: ExecutionDetailStep[] = [];
  logs: ExecutionDetailLog[] = [];

  ngOnInit(): void {
    document.body.appendChild(this.el.nativeElement);
  }

  ngOnDestroy(): void {
    if (this.el.nativeElement && document.body.contains(this.el.nativeElement)) {
      document.body.removeChild(this.el.nativeElement);
    }
  }

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if (changes['execution'] && this.execution?.executionId) {

    this.activeTab = 'screenshots'
    this.selectedStepIndex = 0

    // ✅ Reset local data
    this.steps = []
    this.logs = []

    // ✅ Toujours récupérer les détails complets depuis backend
    await this.fetchExecutionDetail()

    // ✅ Sélectionner automatiquement le premier step avec screenshot
    const firstScreenshotIndex = this.steps.findIndex(
      (step) => Boolean(step.screenshotUrl)
    )

    if (firstScreenshotIndex >= 0) {
      this.selectedStepIndex = firstScreenshotIndex
    } else {
      this.selectedStepIndex = 0
    }

    console.log('✅ MODAL STEPS:', this.steps)
    console.log('✅ FIRST SCREENSHOT INDEX:', firstScreenshotIndex)

    this.cdr.markForCheck()
  }
}

private async fetchExecutionDetail(): Promise<void> {
  if (!this.execution?.executionId) return

  this.isLoadingDetail = true
  this.cdr.markForCheck()

    try {
      const detail = await firstValueFrom(
        this.seleniumRunner.getExecutionDetail(this.execution.executionId)
      ) as RawExecutionDetailResponse | RawExecutionDetailPayload

    console.log('✅ EXECUTION DETAIL RESPONSE:', detail)

    const data: RawExecutionDetailPayload =
      (detail as RawExecutionDetailResponse)?.data ??
      (detail as RawExecutionDetailPayload)

    if (this.execution) {
      this.execution = {
        ...this.execution,
        executedByName:
          data?.executedByName ||
          this.execution.executedByName ||
          data?.executedBy?.name ||
          'Unknown user',
        executedBy: data?.executedBy || this.execution.executedBy || null,
      }
    }

    const rawSteps: RawStepResult[] =
      data?.stepsResults ||
      data?.stepResults ||
      data?.steps ||
      []

    const rawLogs: RawLogEntry[] =
      data?.logs ||
      []

    console.log('✅ RAW DETAIL STEPS:', rawSteps)

    this.steps = this.mapSteps(rawSteps)
    this.logs = this.mapLogs(rawLogs)

    console.log('✅ MAPPED DETAIL STEPS:', this.steps)

  } catch (err) {
    console.error('❌ Failed to load execution details:', err)

    this.logs = [
      {
        timestamp: new Date().toLocaleTimeString(),
        level: 'ERROR',
        message: 'Failed to load execution details.'
      },
    ]
  } finally {
    this.isLoadingDetail = false
    this.cdr.markForCheck()
  }
}

private mapSteps(raw: RawStepResult[]): ExecutionDetailStep[] {
  return raw.map((r, i) => {

      const screenshotPath =
        typeof r.screenshotPath === 'string'
          ? r.screenshotPath
          : r.screenshotPath?.publicUrl ||
            r.screenshotPath?.path ||
            (typeof r.screenshot === 'string' ? r.screenshot : '') ||
            (r.screenshot as RawScreenshotRef | undefined)?.publicUrl ||
            (r.screenshot as RawScreenshotRef | undefined)?.path ||
            r.allScreenshots?.[0]?.publicUrl ||
            r.allScreenshots?.[0]?.path ||
            r.screenshots?.[0]?.publicUrl ||
            r.screenshots?.[0]?.path ||
            r.screenshotUrl ||
            ''

    return {
      index: Number(r.index ?? i + 1),

      name: String(r.name ?? r.step ?? `Step ${i + 1}`),

      status:
        r.status === 'passed'
          ? 'passed'
          : r.status === 'failed_assertion'
            ? 'failed_assertion'
            : r.status === 'failed_execution'
              ? 'failed_execution'
              : r.status === 'warning'
                ? 'warning'
                : r.status === 'skipped'
                  ? 'skipped'
                  : 'failed',

      screenshotUrl: screenshotPath
        ? this.resolveUrl(String(screenshotPath))
        : null,

      message: r.message ?? r.error ?? '',

      actualResult: r.actualResult ?? r.actual ?? '',

      expectedResult: r.expectedResult ?? r.expected ?? '',
    }
  })
}

  private mapLogs(raw: RawLogEntry[]): ExecutionDetailLog[] {
    return raw.map((l) => {
      const details = l.data
        ? Object.entries(l.data).map(([k, v]) => `${k}: ${v}`).join(' | ')
        : '';
      return {
        timestamp: l.timestamp ?? new Date().toLocaleTimeString(),
        level: (l.level as ExecutionDetailLog['level']) ?? 'INFO',
        message: details ? `${l.message} → ${details}` : String(l.message ?? ''),
      };
    });
  }

  private resolveUrl(path: string): string {
    if (!path) return '';
    if (path.startsWith('http')) return path;
    return 'http://localhost:3000' + path;
  }

  // ─── UI helpers ─────────────────────────────────────────────────

  get selectedStep(): ExecutionDetailStep | null {
    return this.steps[this.selectedStepIndex] ?? null;
  }

  get stepsWithScreenshots(): ExecutionDetailStep[] {
    return this.steps.filter((s) => Boolean(s.screenshotUrl));
  }

get statusLabel(): string {
  const map: Record<string, string> = {
    passed: 'PASSED',
    failed: 'FAILED',
    failed_execution: 'FAILED EXECUTION',
    failed_assertion: 'FAILED ASSERTION',
    aborted: 'ABORTED',
    running: 'RUNNING',
  }

  return map[this.execution?.status ?? ''] ?? 'UNKNOWN'
}

  get statusClass(): string {
    return `status-badge--${this.execution?.status ?? 'unknown'}`;
  }

  get durationLabel(): string {
    const d = this.execution?.duration;
    if (!d && d !== 0) return '—';
    return typeof d === 'number' ? `${d}s` : String(d);
  }

  get platformLabel(): string {
    const parts = [this.execution?.browser, this.execution?.platform].filter(Boolean);
    return parts.length ? parts.join(' / ') : 'Chrome / Unknown OS';
  }

  get executedByLabel(): string {
    return String(
      this.execution?.executedByName ||
      this.execution?.executedBy?.name ||
      'Unknown user'
    ).trim()
  }

  selectStep(index: number): void {
    this.selectedStepIndex = index;
    this.cdr.markForCheck();
  }

  setTab(tab: 'screenshots' | 'logs'): void {
    this.activeTab = tab;
    this.cdr.markForCheck();
  }

  onClose(): void {
    this.closed.emit();
  }

  onRetest(): void {
    if (this.execution) this.retest.emit(this.execution);
  }

  onApprove(): void {
    if (this.execution) this.approve.emit(this.execution);
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.onClose();
    }
  }

  getLogClass(level: string): string {
    const map: Record<string, string> = {
      INFO: 'log--info',
      STEP: 'log--step',
      SUCCESS: 'log--success',
      WARN: 'log--warn',
      ERROR: 'log--error',
    };
    return map[level] ?? 'log--info';
  }

getStepStatusClass(status: string): string {
  const map: Record<string, string> = {
    passed: 'thumb--pass',
    failed: 'thumb--fail',
    failed_execution: 'thumb--fail',
    failed_assertion: 'thumb--fail',
    warning: 'thumb--warn',
    skipped: 'thumb--skip',
  };
  return map[status] ?? 'thumb--skip';
}

getStepStatusIcon(status: string): string {
  return status === 'passed'
    ? '✓'
    : status === 'failed' ||
      status === 'failed_execution' ||
      status === 'failed_assertion'
        ? '✕'
        : status === 'warning'
          ? '⚠'
          : '–';
}


  /*downloadLog(): void {
    const text = this.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-${this.execution?.executionId ?? 'log'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }*/

  copyAllLabel = 'Copy All';

  async copyAllLogs(): Promise<void> {
    const text = this.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    if (!text) {
      this.copyAllLabel = 'No logs';
      window.setTimeout(() => (this.copyAllLabel = 'Copy All'), 1800);
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        this.copyWithLegacyFallback(text);
      }
      this.copyAllLabel = 'Copied';
    } catch {
      try {
        this.copyWithLegacyFallback(text);
        this.copyAllLabel = 'Copied';
      } catch {
        this.copyAllLabel = 'Copy failed';
      }
    }
    window.setTimeout(() => (this.copyAllLabel = 'Copy All'), 1800);
  }

  private copyWithLegacyFallback(text: string): void {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    if (!copied) throw new Error('Clipboard copy was rejected');
  }

  trackByStep(_: number, step: ExecutionDetailStep): number {
    return step.index;
  }

  trackByLog(_: number, log: ExecutionDetailLog): number {
    return log.timestamp as unknown as number;
  }
}
