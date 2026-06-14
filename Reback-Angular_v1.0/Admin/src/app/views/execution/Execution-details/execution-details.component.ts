import { SeleniumRunnerService } from '@/app/core/services/selenium-runner.service';
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
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
  rawExecution?: any;
}

@Component({
  selector: 'app-execution-details',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './execution-details.component.html',
  styleUrls: ['./execution-details.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExecutionDetailModalComponent implements OnChanges {
  @Input() execution: ExecutionDetailData | null = null;
  @Input() visible = false;
  @Output() closed = new EventEmitter<void>();
  @Output() retest = new EventEmitter<ExecutionDetailData>();
  @Output() approve = new EventEmitter<ExecutionDetailData>();

  private cdr = inject(ChangeDetectorRef);
  private seleniumRunner = inject(SeleniumRunnerService);

  activeTab: 'screenshots' | 'logs' = 'screenshots';
  selectedStepIndex = 0;
  isLoadingDetail = false;

  steps: ExecutionDetailStep[] = [];
  logs: ExecutionDetailLog[] = [];

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
    const detail: any = await firstValueFrom(
      this.seleniumRunner.getExecutionDetail(this.execution.executionId)
    )

    console.log('✅ EXECUTION DETAIL RESPONSE:', detail)

    const data = detail?.data ?? detail

    const rawSteps =
      data?.stepResults ||
      data?.steps ||
      []

    const rawLogs =
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

private mapSteps(raw: any[]): ExecutionDetailStep[] {
  return raw.map((r, i) => {

    const screenshotPath =
      typeof r.screenshotPath === 'string'
        ? r.screenshotPath
        : r.screenshotPath?.publicUrl ||
          r.screenshotPath?.path ||
          r.screenshot?.publicUrl ||
          r.screenshot?.path ||
          r.screenshots?.[0]?.publicUrl ||
          r.screenshots?.[0]?.path ||
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

  private mapLogs(raw: any[]): ExecutionDetailLog[] {
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


  downloadLog(): void {
    const text = this.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-${this.execution?.executionId ?? 'log'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  copyAllLogs(): void {
    const text = this.logs.map((l) => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
    navigator.clipboard?.writeText(text);
  }

  trackByStep(_: number, step: ExecutionDetailStep): number {
    return step.index;
  }

  trackByLog(_: number, log: ExecutionDetailLog): number {
    return log.timestamp as unknown as number;
  }
}