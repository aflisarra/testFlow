import type { TestPlanDto } from '@/app/interfaces/testlab.interface'
import { CommonModule } from '@angular/common'
import { Component, OnInit, inject } from '@angular/core'
import { forkJoin } from 'rxjs'
import {
  ExecutionListItemDto,
  ExecutionListResponseDto,
  ExecutionTrendItemDto,
  ProjectListItemDto,
  SeleniumRunnerService,
  SuiteListItemDto,
  TypeBreakdownItemDto,
} from '../../../core/services/selenium-runner.service'
import { ExecutionDetailModalComponent } from '../../execution/Execution-details/execution-details.component'
import {
  MinPipe,
  StatusLabelPipe,
  UserInitialsPipe,
} from '../../execution/Execution-History/execution-history.pipes'

export interface ExecutionRun {
  id: string
  testCaseName: string
  testCaseKey: string
  projectName: string
  suiteName: string
  planName: string
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

interface StatsQuery {
  page: number
  limit: number
  days?: number
  project?: string
  testSuiteId?: string
  planId?: string
  status?: ExecutionRun['status']
}

interface InsightsParams {
  project?: string
  testSuiteId?: string
  planId?: string
  days?: number
}

interface SelectedExecution {
  executionId: string
  testCaseTitle: string
  testCaseKey: string
  planTitle: string
  executedByName: string
  status: ExecutionRun['status']
  duration: string
  startedAt: string
}
@Component({
  selector: 'app-analytics',
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ExecutionDetailModalComponent,
    StatusLabelPipe,
    UserInitialsPipe,
    MinPipe,
  ],
})
export class AnalyticsComponent implements OnInit {

  private seleniumRunnerService = inject(SeleniumRunnerService)

  // ─── Filters state ──────────────────────────────────────────────────────────
  filters = {
    dateRange: '',
    status: '',
    project: '',
    suite: '',
    testPlan: '',
  }

  // ─── Modal state ────────────────────────────────────────────────────────────
  selectedExecution: SelectedExecution | null = null
  isModalOpen = false

  // ─── Pagination ─────────────────────────────────────────────────────────────
  pageSize = 5
  currentPage = 1
  totalRuns = 0

  // ─── Data ───────────────────────────────────────────────────────────────────
  filteredRuns: ExecutionRun[] = []
  projects: ProjectListItemDto[] = []
  suites: SuiteListItemDto[] = []
  plans: TestPlanDto[] = []
  isExportingReport = false
  filtersApplied = false

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
    this.currentPage = 1
    this.fetchExecutions()
    this.fetchInsights()
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
    this.seleniumRunnerService.getProjects().subscribe((res) => {
      this.projects = (res ?? []).map((project) => this.normalizeProject(project))
    })
  }

  onFilterChange(key: string, event: Event): void {
    const value = (event.target as HTMLSelectElement | HTMLInputElement).value
    this.filters = { ...this.filters, [key]: value }
    this.filtersApplied = false
    if (key === 'project') {
      this.filters.suite = ''
      this.filters.testPlan = ''
      this.suites = []
      this.plans = []
      if (value) {
        this.seleniumRunnerService.getSuitesByProject(value).subscribe((res) => {
          this.suites = (res ?? []).map((suite) => this.normalizeSuite(suite))
        })
      }
    }

    if (key === 'suite') {
      this.filters.testPlan = ''
      this.plans = []
      if (value) {
        this.seleniumRunnerService.getPlansBySuite(value).subscribe((res) => {
          this.plans = (res?.testPlans ?? []).map((plan) => this.normalizePlan(plan))
        })
      }
    }
  }

  get canExportReport(): boolean {
    return Boolean(
      this.filters.project &&
      this.filters.suite &&
      this.filtersApplied &&
      !this.isExportingReport
    )
  }

  private getDisplayName(record: unknown): string {
    const item = record as Record<string, unknown> | null | undefined
    return String(item?.['title'] || item?.['name'] || item?.['nom'] || '').trim()
  }

  private normalizeProject(project: unknown): ProjectListItemDto {
    const item = project as Record<string, unknown> | null | undefined
    return {
      _id: String(item?.['_id'] || item?.['id'] || '').trim(),
      title: this.getDisplayName(item),
    }
  }

  private normalizeSuite(suite: unknown): SuiteListItemDto {
    const item = suite as Record<string, unknown> | null | undefined
    return {
      _id: String(item?.['_id'] || item?.['id'] || '').trim(),
      title: this.getDisplayName(item),
    }
  }

  private normalizePlan(plan: unknown): TestPlanDto {
    const item = plan as Record<string, unknown> | null | undefined
    return {
      id: String(item?.['id'] || item?.['_id'] || '').trim(),
      title: this.getDisplayName(item),
      description: String(item?.['description'] || '').trim(),
      testCases: Array.isArray(item?.['testCases']) ? item?.['testCases'] as TestPlanDto['testCases'] : undefined,
    }
  }

  applyFilters(): void {
    this.currentPage = 1
    this.filtersApplied = true
    this.fetchExecutions()
    this.fetchStats()
    this.fetchInsights()
  }

  exportReport(): void {
    if (!this.filters.project || !this.filters.suite || this.isExportingReport) return
    this.isExportingReport = true

    this.seleniumRunnerService.getExecutionHistoryReport(this.filters.suite).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob)
        const projectName = this.projects.find((project) => project._id === this.filters.project)?.title || 'project'
        const suiteName = this.suites.find((suite) => suite._id === this.filters.suite)?.title || 'suite'
        const fileName = `${String(projectName).replace(/[^\w-]+/g, '_')}_${String(suiteName).replace(/[^\w-]+/g, '_')}_execution_history.pdf`
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
    const query: StatsQuery = { page: this.currentPage, limit: this.pageSize }

    const dayMap: Record<string, number> = {
      '1day': 1, '2days': 2, '3days': 3, '7days': 7, '30days': 30,
    }
    if (this.filters.dateRange && dayMap[this.filters.dateRange]) {
      query.days = dayMap[this.filters.dateRange]
    }

    if (this.filters.status)   query.status      = this.filters.status as ExecutionRun['status']
    if (this.filters.project)  query.project     = this.filters.project
    if (this.filters.suite)    query.testSuiteId = this.filters.suite
    if (this.filters.testPlan) query.planId      = this.filters.testPlan

    this.seleniumRunnerService.getExecutions(query).subscribe((res: ExecutionListResponseDto) => {
      this.totalRuns = res.total ?? 0
this.filteredRuns = (res.data ?? []).map((r: ExecutionListItemDto): ExecutionRun => ({
  id: r.executionId,
  testCaseName: r.testCaseTitle ?? r.testCaseKey ?? 'Untitled test case',
  testCaseKey: r.testCaseKey ?? r.executionId,
  projectName: this.getExecutionProjectName(r),
  suiteName: r.testSuiteName || r.testSuite?.nom || r.testSuite?.nametest || '—',
  planName: r.planTitle || r.planKey || '—',
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

  private getExecutionProjectName(execution: ExecutionListItemDto): string {
    const project = execution.project ?? execution.projectId
    const isObjectProject = typeof project === 'object' && project !== null

    const embeddedName =
      execution.projectName ??
      execution.projectTitle ??
      (isObjectProject ? project.title : undefined)
    if (embeddedName) return String(embeddedName)

    const projectId = isObjectProject ? project._id : project
    return String(this.projects.find((item) => item?._id === projectId)?.title || '—')
  }

  // ─── Aggregate stats (Total / Passed / Failed / Pass rate) ──────────────────
  private fetchStats(): void {
    const baseQuery: StatsQuery = { page: 1, limit: 1 }

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
    }).subscribe(({ total, passed, failed, failedExecution, failedAssertion }) => {
      const totalCount  = total.total ?? 0
      const passedCount = passed.total ?? 0
      const failedCount =
        (failed.total ?? 0) +
        (failedExecution.total ?? 0) +
        (failedAssertion.total ?? 0)

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
    testCaseKey:   run.testCaseKey,
    planTitle:     run.planName,
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

  // ─── Trend & health (dynamic) ────────────────────────────────────────────────
  trendPoints = { success: '', failure: '' }
  trendMax = 1
  typeBreakdown: { type: string; percent: number }[] = []
  healthScore = 0
  healthDasharrays: { color: string; dasharray: string; dashoffset: string }[] = []

  private fetchInsights(): void {
    const params: InsightsParams = {}
    if (this.filters.project)  params.project     = this.filters.project
    if (this.filters.suite)    params.testSuiteId = this.filters.suite
    if (this.filters.testPlan) params.planId      = this.filters.testPlan

    this.seleniumRunnerService.getExecutionTrend({ ...params, days: 7 }).subscribe((res) => {
      const days = res.data || []
      const max = Math.max(1, ...days.map(d => Math.max(d.passed, d.failed)))
      this.trendMax = max

      const toPoints = (key: 'passed' | 'failed') =>
        days.map((d: ExecutionTrendItemDto, i: number) => {
          const x = (i / (days.length - 1 || 1)) * 500
          const y = 150 - (d[key] / max) * 140
          return `${x.toFixed(1)},${y.toFixed(1)}`
        }).join(' ')

      this.trendPoints = {
        success: toPoints('passed'),
        failure: toPoints('failed'),
      }
    })

    this.seleniumRunnerService.getTypeBreakdown(params).subscribe((res) => {
      this.typeBreakdown = (res.data || []) as TypeBreakdownItemDto[]
      this.buildHealthDonut()
    })
  }

  private buildHealthDonut(): void {
    this.healthScore = this.stats.passRate ?? 0

    const circumference = 2 * Math.PI * 50
    const colors = ['#185fa5', '#ec8a00', '#059669', '#9333ea', '#d97706']

    // Garde les 4 plus grosses catégories, regroupe le reste en "Other"
    const sorted = [...this.typeBreakdown].sort((a, b) => b.percent - a.percent)
    const top = sorted.slice(0, 4)
    const otherPercent = sorted.slice(4).reduce((sum, item) => sum + item.percent, 0)

    const display = otherPercent > 0
      ? [...top, { type: 'other', percent: otherPercent }]
      : top

    this.typeBreakdown = display

    let offset = 0
    this.healthDasharrays = display.map((item, i) => {
      const length = (item.percent / 100) * circumference
      const entry = {
        color: colors[i % colors.length],
        dasharray: `${length.toFixed(1)} ${circumference.toFixed(1)}`,
        dashoffset: `-${offset.toFixed(1)}`,
      }
      offset += length
      return entry
    })
  }
}
