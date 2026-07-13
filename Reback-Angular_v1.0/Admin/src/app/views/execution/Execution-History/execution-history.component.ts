import { CommonModule } from '@angular/common'
import { Component, OnInit } from '@angular/core'
import { forkJoin } from 'rxjs'
import { SeleniumRunnerService } from '../../../core/services/selenium-runner.service'
import { ExecutionDetailModalComponent } from '../Execution-details/execution-details.component'
import {
  MinPipe,
  StatusLabelPipe,
  UserInitialsPipe,
} from './execution-history.pipes'

export interface ExecutionRun {
  id: string
  testCaseName: string
  executedBy: string
  executedByPicture: string | null
  status:
    | 'passed'
    | 'failed'
    | 'failed_execution'
    | 'failed_assertion'
    | 'aborted'
    | 'running'
  executionDate: string
  executionTime: string
  duration: string
}

@Component({
  selector: 'app-execution-history',
  templateUrl: './execution-history.component.html',
  styleUrls: ['./execution-history.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ExecutionDetailModalComponent,
    StatusLabelPipe,
    UserInitialsPipe,
    MinPipe,
  ],
})
export class ExecutionHistoryComponent implements OnInit {

  constructor(private seleniumRunnerService: SeleniumRunnerService) {}

  // ─── Filters state ──────────────────────────────────────────────────────────
  filters = {
    dateRange: '',
    status: '',
    project: '',
    suite: '',
    testPlan: '',
  }

  // ─── Modal state ────────────────────────────────────────────────────────────
  selectedExecution: any = null
  isModalOpen = false

  // ─── Pagination ─────────────────────────────────────────────────────────────
  pageSize = 5
  currentPage = 1
  totalRuns = 0

  // ─── Data ───────────────────────────────────────────────────────────────────
  filteredRuns: ExecutionRun[] = []
  projects: any[] = []
  suites: any[] = []
  plans: any[] = []
  isExportingReport = false

  // ─── Aggregate metrics (independent of table pagination) ────────────────────
  // Restent à null tant que l'utilisateur n'a pas cliqué sur "Apply filters" ;
  // le template affiche alors "—" au lieu d'un chiffre.
  stats: {
    total: number | null
    passed: number | null
    failed: number | null
    passRate: number | null
  } = {
    total: null,
    passed: null,
    failed: null,
    passRate: null,
  }
  statsComputed = false

  // ─── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.loadProjects()
    // Charge uniquement le tableau au démarrage — les cartes de métriques
    // restent à "—" tant qu'aucun "Apply filters" n'a été déclenché.
    this.currentPage = 1
    this.fetchExecutions()
  }

  // ─── Page numbers for pagination ────────────────────────────────────────────
  get pageNumbers(): (number | '…')[] {
    const total = Math.ceil(this.totalRuns / this.pageSize)
    const c = this.currentPage
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)

    const pages: (number | '…')[] = [1]
    if (c > 3) pages.push('…')
    for (let i = Math.max(2, c - 1); i <= Math.min(total - 1, c + 1); i++) {
      pages.push(i)
    }
    if (c < total - 2) pages.push('…')
    pages.push(total)
    return pages
  }

  changePage(page: number): void {
    const total = Math.ceil(this.totalRuns / this.pageSize)
    if (page < 1 || page > total) return
    this.currentPage = page
    this.fetchExecutions()
  }

  // ─── Data loading ────────────────────────────────────────────────────────────
  loadProjects(): void {
    this.seleniumRunnerService.getProjects().subscribe((res: any) => {
      this.projects = Array.isArray(res) ? res : res?.data ?? []
    })
  }

  onFilterChange(key: string, event: any): void {
    const value = event.target.value
    this.filters = { ...this.filters, [key]: value }

    if (key === 'project') {
      this.filters.suite = ''
      this.filters.testPlan = ''
      this.suites = []
      this.plans = []
      if (value) {
        this.seleniumRunnerService.getSuitesByProject(value).subscribe((res: any) => {
          this.suites = Array.isArray(res) ? res : res?.data ?? []
        })
      }
    }

    if (key === 'suite') {
      this.filters.testPlan = ''
      this.plans = []
      if (value) {
        this.seleniumRunnerService.getPlansBySuite(value).subscribe((res: any) => {
          this.plans = res?.testPlans ?? []
        })
      }
    }
  }

  get canExportReport(): boolean {
    return Boolean(this.filters.project && this.filters.suite && !this.isExportingReport)
  }

  applyFilters(): void {
    this.currentPage = 1
    this.fetchExecutions()
    this.fetchStats()
  }

  exportReport(): void {
    if (!this.filters.project || !this.filters.suite || this.isExportingReport) return
    this.isExportingReport = true

    this.seleniumRunnerService.getExecutionHistoryReport(this.filters.suite).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob)
        const projectName = this.projects.find((project) => project._id === this.filters.project)?.title || 'project'
        const suiteName = this.suites.find((suite) => suite._id === this.filters.suite)?.nom || this.suites.find((suite) => suite._id === this.filters.suite)?.nametest || 'suite'
        const fileName = `${String(projectName).replace(/[^\w\-]+/g, '_')}_${String(suiteName).replace(/[^\w\-]+/g, '_')}_execution_history.pdf`
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = fileName
        anchor.click()
        window.URL.revokeObjectURL(url)
        this.isExportingReport = false
      },
      error: () => {
        this.isExportingReport = false
      },
    })
  }

  private fetchExecutions(): void {
    const query: any = { page: this.currentPage, limit: this.pageSize }

    const dayMap: Record<string, number> = {
      '1day': 1, '2days': 2, '3days': 3, '7days': 7, '30days': 30,
    }
    if (this.filters.dateRange && dayMap[this.filters.dateRange]) {
      query.days = dayMap[this.filters.dateRange]
    }

    if (this.filters.status)   query.status      = this.filters.status
    if (this.filters.project)  query.project     = this.filters.project
    if (this.filters.suite)    query.testSuiteId = this.filters.suite
    if (this.filters.testPlan) query.planId      = this.filters.testPlan

    this.seleniumRunnerService.getExecutions(query).subscribe((res: any) => {
      this.totalRuns = res.total ?? 0
      this.filteredRuns = (res.data ?? []).map((r: any): ExecutionRun => ({
        id: r.executionId,
        testCaseName: r.testCaseTitle ?? r.testCaseKey ?? 'Untitled test case',
        executedBy:
          r.executedByName ||
          r.executedBy?.name ||
          r.executedBy?.fullName ||
          r.executedBy?.username ||
          r.createdBy?.name ||
          r.createdBy?.fullName ||
          r.createdBy?.username ||
          '',
        executedByPicture: r.executedBy?.picture ?? r.createdBy?.picture ?? null,
        status: r.status,
        executionDate: r.startedAt ? new Date(r.startedAt).toLocaleDateString() : '—',
        executionTime: r.startedAt ? new Date(r.startedAt).toLocaleTimeString() : '—',
        duration: `${r.duration ?? 0}s`,
      }))
    })
  }

  // ─── Aggregate stats (Total / Passed / Failed / Pass rate) ──────────────────
  // Volontairement indépendant du filtre "status" : les 4 cartes montrent
  // la répartition complète pour project/suite/plan/date, quel que soit le
  // statut sélectionné dans le tableau en dessous. Ne se déclenche que sur
  // un clic explicite sur "Apply filters" (voir applyFilters()).
  private fetchStats(): void {
    const baseQuery: any = { page: 1, limit: 1 }

    const dayMap: Record<string, number> = {
      '1day': 1, '2days': 2, '3days': 3, '7days': 7, '30days': 30,
    }
    if (this.filters.dateRange && dayMap[this.filters.dateRange]) {
      baseQuery.days = dayMap[this.filters.dateRange]
    }
    if (this.filters.project)  baseQuery.project     = this.filters.project
    if (this.filters.suite)    baseQuery.testSuiteId = this.filters.suite
    if (this.filters.testPlan) baseQuery.planId      = this.filters.testPlan

    forkJoin({
      total:           this.seleniumRunnerService.getExecutions({ ...baseQuery }),
      passed:          this.seleniumRunnerService.getExecutions({ ...baseQuery, status: 'passed' }),
      failed:          this.seleniumRunnerService.getExecutions({ ...baseQuery, status: 'failed' }),
      failedExecution: this.seleniumRunnerService.getExecutions({ ...baseQuery, status: 'failed_execution' }),
      failedAssertion: this.seleniumRunnerService.getExecutions({ ...baseQuery, status: 'failed_assertion' }),
    }).subscribe(({ total, passed, failed, failedExecution, failedAssertion }: any) => {
      const totalCount  = total?.total ?? 0
      const passedCount = passed?.total ?? 0
      const failedCount =
        (failed?.total ?? 0) +
        (failedExecution?.total ?? 0) +
        (failedAssertion?.total ?? 0)

      this.stats = {
        total: totalCount,
        passed: passedCount,
        failed: failedCount,
        passRate: totalCount ? Math.round((passedCount / totalCount) * 100) : 0,
      }
      this.statsComputed = true
    })
  }

  // ─── Modal ──────────────────────────────────────────────────────────────────
  openExecution(run: ExecutionRun): void {
    this.selectedExecution = {
      executionId:   run.id,
      testCaseTitle: run.testCaseName,
      planTitle:     '',
      executedByName: run.executedBy,
      status:        run.status,
      duration:      run.duration,
      startedAt:     `${run.executionDate} ${run.executionTime}`,
    }
    this.isModalOpen = true
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement
    img.style.display = 'none'
  }
}