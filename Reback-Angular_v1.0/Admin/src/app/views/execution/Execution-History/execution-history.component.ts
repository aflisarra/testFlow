import { Component, OnInit } from '@angular/core'
import { SeleniumRunnerService } from '../../../core/services/selenium-runner.service'
import { ExecutionDetailModalComponent } from '../Execution-details/execution-details.component'
export interface ExecutionRun {
  id: string
  testCaseName: string
  executedBy: string
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
  imports: [ExecutionDetailModalComponent]
})
export class ExecutionHistoryComponent implements OnInit {

  constructor(private seleniumRunnerService: SeleniumRunnerService) {}


filters = {
  dateRange: '', // ✅ par défaut = all database
  status: '',
  project: '',
  suite: '',
  testPlan: ''
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
    
  // ✅ au début : all executions from database
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
onFilterChange(key: string, event: any): void {
  const value = event.target.value

  this.filters = {
    ...this.filters,
    [key]: value
  }

  // ✅ PROJECT → SUITES only
  if (key === 'project') {
    this.filters.suite = ''
    this.filters.testPlan = ''

    this.suites = []
    this.plans = []

    if (value) {
      this.seleniumRunnerService.getSuitesByProject(value)
        .subscribe((res: any) => {
          console.log('✅ suites:', res)

          this.suites = Array.isArray(res)
            ? res
            : res?.data || []
        })
    }
  }

  // ✅ SUITE → PLANS only
  if (key === 'suite') {
    this.filters.testPlan = ''
    this.plans = []

    if (value) {
      this.seleniumRunnerService.getPlansBySuite(value)
        .subscribe((res: any) => {
          console.log('✅ plans:', res)

          this.plans = res?.testPlans || []
        })
    }
  }

  // ❌ IMPORTANT:
  // do NOT call applyFilters() here
}



applyFilters(): void {
  this.currentPage = 1

  const query: any = {
    page: this.currentPage,
    limit: this.pageSize
  }

  // ✅ Date range
  if (this.filters.dateRange === '1day') query.days = 1
  if (this.filters.dateRange === '2days') query.days = 2
  if (this.filters.dateRange === '3days') query.days = 3
  if (this.filters.dateRange === '7days') query.days = 7
  if (this.filters.dateRange === '30days') query.days = 30

  // ✅ Status
  if (this.filters.status) {
    query.status = this.filters.status
  }

  // ✅ Project
  if (this.filters.project) {
    query.project = this.filters.project
  }

  // ✅ Suite
  if (this.filters.suite) {
    query.testSuiteId = this.filters.suite
  }

  // ✅ Plan
  if (this.filters.testPlan) {
    query.planId = this.filters.testPlan
  }

  console.log('✅ APPLY FILTER QUERY:', query)

  this.seleniumRunnerService.getExecutions(query)
    .subscribe((res: any) => {
      console.log('✅ executions:', res)

      this.totalRuns = res.total || 0

      this.filteredRuns = (res.data || []).map((r: any) => ({
        id: r.executionId,

        testCaseName:
          r.testCaseTitle ||
          r.testCaseKey ||
          'Untitled test case',

        executedBy:
          r.executedByName ||
          r.executedBy?.name ||
          r.createdByName ||
          r.userName ||
          'Unknown user',

        status: r.status,

        executionDate: r.startedAt
          ? new Date(r.startedAt).toLocaleDateString()
          : '-',

        executionTime: r.startedAt
          ? new Date(r.startedAt).toLocaleTimeString()
          : '-',

        duration: `${r.duration || 0}s`
      }))
    })
}

  

openExecution(run: ExecutionRun): void {
  console.log('CLICK ✅', run)

  this.selectedExecution = {
    executionId: run.id,
    testCaseTitle: run.testCaseName,
    planTitle: '',
    status: run.status,
    duration: run.duration,
    startedAt: `${run.executionDate} ${run.executionTime}`
  }

  this.isModalOpen = true
}


}