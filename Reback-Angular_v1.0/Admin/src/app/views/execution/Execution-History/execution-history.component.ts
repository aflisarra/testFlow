import { Component, OnInit } from '@angular/core'
import { SeleniumRunnerService } from '../../../core/services/selenium-runner.service'
import { ExecutionDetailModalComponent } from '../Execution-details/execution-details.component'
export interface ExecutionRun {
  id: string
  name: string
  tags: string
  status: 'passed' | 'failed' | 'aborted' | 'running'
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  duration: string
}

@Component({
  selector: 'app-execution-history',
  templateUrl: './execution-history.component.html',
  styleUrls: ['./execution-history.component.css'],
  standalone: true,
  imports: [ExecutionDetailModalComponent]
})
export class ExecutionHistoryComponent implements OnInit {

  constructor(private seleniumRunnerService: SeleniumRunnerService) {}

  filters = {
    dateRange: '7days',
    status: '',
    project: '',
    suite: '',
    testPlan: '',
    testCase: '',
    executionState: ''
  }

  selectedExecution: any = null
isModalOpen = false


  pageSize = 5
  currentPage = 1
  totalRuns = 0

  filteredRuns: ExecutionRun[] = []

  projects: any[] = []
  suites: any[] = []
  plans: any[] = []
  testCases: any[] = []

  ngOnInit(): void {
    this.loadProjects()
    this.applyFilters()
  }


loadProjects() {
  this.seleniumRunnerService.getProjects()
    .subscribe((res: any) => {

      console.log("projects:", res)

      this.projects = Array.isArray(res)
        ? res
        : res?.data || []

    })
}


_testCasesByPlan: any[] = [] // Cache for test cases by plan to optimize suite → plan → test case flow
  onFilterChange(key: string, event: any) {

    const value = event.target.value

    this.filters = { ...this.filters, [key]: value }

    // ✅ PROJECT → SUITES
    if (key === 'project') {

      this.filters.suite = ''
      this.filters.testPlan = ''
      this.filters.testCase = ''

      this.suites = []
      this.plans = []
      this.testCases = []

      if (value) {
       
this.seleniumRunnerService.getSuitesByProject(value)
  .subscribe((res: any) => {

    console.log("suites:", res)

    this.suites = Array.isArray(res)
      ? res
      : res?.data || []

  })
      }
    }

    // ✅ SUITE → PLANS
    if (key === 'suite') {

      this.filters.testPlan = ''
      this.filters.testCase = ''

      this.plans = []
      this.testCases = []

      if (value) {
      

this.seleniumRunnerService.getPlansBySuite(value)
  .subscribe((res: any) => {

    console.log("plans:", res)

    this.plans = res?.testPlans || []

    // ✅ IMPORTANT
    this._testCasesByPlan = res?.testCasesByPlan || []

  })

      }
    }

    // ✅ PLAN → TEST CASES
if (key === 'testPlan') {

  this.filters.testCase = ''

  let selected = this._testCasesByPlan.find((p: any) =>
    String(p.testPlanId) === String(value)
  )

  // ✅ fallback si pas trouvé (très important)
  if (!selected) {
    console.warn("⚠️ fallback by index")
    const index = this.plans.findIndex((p: any) =>
      String(p._id) === String(value)
    )
    selected = this._testCasesByPlan[index]
  }

  this.testCases = selected?.testCases || []

  console.log("✅ selected:", selected)
  console.log("✅ testCases:", this.testCases)
}

  }


  applyFilters() {

    const query: any = {
      page: this.currentPage,
      limit: this.pageSize
    }

    if (this.filters.status) query.status = this.filters.status
    if (this.filters.project) query.project = this.filters.project
    if (this.filters.suite) query.testSuiteId = this.filters.suite
    if (this.filters.testPlan) query.planId = this.filters.testPlan
    if (this.filters.testCase) query.testCaseId = this.filters.testCase
    if (this.filters.executionState) query.executionState = this.filters.executionState

    if (this.filters.dateRange === '1day') query.days = 1
    if (this.filters.dateRange === '2days') query.days = 2
    if (this.filters.dateRange === '3days') query.days = 3
    if (this.filters.dateRange === '7days') query.days = 7
    if (this.filters.dateRange === '30days') query.days = 30

    this.seleniumRunnerService.getExecutions(query).subscribe((res: any) => {

      this.totalRuns = res.total || 0

      this.filteredRuns = (res.data || []).map((r: any) => ({
        id: r.executionId,
        name: r.testCaseTitle || 'Test',
        tags: r.planTitle || '',
        status: r.status,
        startDate: new Date(r.startedAt).toLocaleDateString(),
        startTime: new Date(r.startedAt).toLocaleTimeString(),
        endDate: r.finishedAt ? new Date(r.finishedAt).toLocaleDateString() : '-',
        endTime: r.finishedAt ? new Date(r.finishedAt).toLocaleTimeString() : '-',
        duration: `${r.duration || 0}s`
      }))
    })
  }

  

openExecution(run: any) {
  console.log("CLICK ✅", run)

  this.selectedExecution = {
    executionId: run.id,
    testCaseTitle: run.name,
    planTitle: run.tags,
    status: run.status
  }

  this.isModalOpen = true
}


}