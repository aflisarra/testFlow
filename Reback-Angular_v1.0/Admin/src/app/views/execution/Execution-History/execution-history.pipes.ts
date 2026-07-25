import { Pipe, PipeTransform } from '@angular/core'

// ─── Shared minimal shape used by the pipes below ─────────────────────────────
interface RunWithStatus {
  status: string
}

// ─── Status label ──────────────────────────────────────────────────────────────
@Pipe({ name: 'statusLabel', standalone: true })
export class StatusLabelPipe implements PipeTransform {
  private map: Record<string, string> = {
    passed:            'Passed',
    failed:            'Failed',
    failed_execution:  'Exec error',
    failed_assertion:  'Assertion',
    running:           'Running',
    aborted:           'Aborted',
  }
  transform(value: string): string {
    return this.map[value] ?? value
  }
}

// ─── User initials ─────────────────────────────────────────────────────────────
@Pipe({ name: 'userInitials', standalone: true })
export class UserInitialsPipe implements PipeTransform {
  transform(name: string): string {
    if (!name) return '?'
    return name
      .split(' ')
      .map(w => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase()
  }
}

// ─── Pass rate ─────────────────────────────────────────────────────────────────
@Pipe({ name: 'passRate', standalone: true })
export class PassRatePipe implements PipeTransform {
  transform(runs: RunWithStatus[]): number {
    if (!runs?.length) return 0
    const passed = runs.filter(r => r.status === 'passed').length
    return Math.round((passed / runs.length) * 100)
  }
}

// ─── Status count ──────────────────────────────────────────────────────────────
@Pipe({ name: 'statusCount', standalone: true })
export class StatusCountPipe implements PipeTransform {
  transform(runs: RunWithStatus[], status: string): number {
    if (!runs?.length) return 0
    if (status === 'failed') {
      return runs.filter(r =>
        r.status === 'failed' ||
        r.status === 'failed_execution' ||
        r.status === 'failed_assertion'
      ).length
    }
    return runs.filter(r => r.status === status).length
  }
}

// ─── Min (for footer "showing X–Y of N") ──────────────────────────────────────
@Pipe({ name: 'min', standalone: true })
export class MinPipe implements PipeTransform {
  transform([a, b]: [number, number]): number {
    return Math.min(a, b)
  }
}