import { ApiService } from '@/app/core/services/api.service'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import {
    TestLabService,
    type TestCaseDto,
    type TestLabProjectDto,
    type TestLabProjectUserDto,
    type TestPlanDto,
    type TestSuiteDto,
} from '@/app/core/services/testlab.service'
import { UINotificationService } from '@/app/core/services/ui-notification.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { SuiteSessionStatus, TestGenerationStatus, TestSuiteStatusKey } from '@/app/views/test/models/status.types'
import { getErrorMessage } from '@/app/views/test/utils/error.utils'
import { CommonModule } from '@angular/common'
import { ChangeDetectorRef, Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, inject, NgZone, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTabsModule } from '@angular/material/tabs'
import { ActivatedRoute, Router } from '@angular/router'
import { ProjectService } from '@core/services/Project.service'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ConfirmModalComponent } from '../../admin/shared/confirm-modal.component'

interface ExecutionEntryDto {
  executedAt: string
  duration: string
  status: 'passed' | 'failed'
   // ✅ AJOUTE
  executedByName?: string
  executedByPicture?: string
}

interface TeamMemberView {
  id: string
  name: string
  initials: string
  hasPhoto: boolean
  photoUrl: string | null
  isOwner: boolean
}


@Component({
  selector: 'app-test-cases-validation',
  standalone: true,
  imports: [CommonModule, FormsModule,MatTabsModule],
  templateUrl: './list-test.component.html',
  styleUrls: ['./list-test.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  //encapsulation: ViewEncapsulation.None,
})
export class TestCasesValidationComponent implements OnInit {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private apiService = inject(ApiService)
  private uiNotification = inject(UINotificationService)
  private projectsState = inject(ProjectsStateService)
  private testLabService = inject(TestLabService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private modalService = inject(NgbModal)
  private projectService = inject(ProjectService)
  private ngZone = inject(NgZone)
private cdr = inject(ChangeDetectorRef)
  loading = false
  errorMessage = ''
  view: 'list' | 'detail' = 'list'
  readonly vm = this

  // List
  suites: TestSuiteDto[] = []
  searchQuery = ''
  statusFilter: TestSuiteStatusKey = 'all'
  filterOpen = false
  actionMenuSuiteId: string | null = null
  projectFilterId = ''
  private acceptedProjectIds = new Set<string>()

  onSearchQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement | null
    this.searchQuery = target?.value ?? ''
    this.currentPage = 1
  }

readonly statusFilters: readonly { key: TestSuiteStatusKey; label: string }[] = [
  { key: 'completed', label: 'Completed' },
  { key: 'incomplete', label: 'Incomplete' },
]

  // Pagination
  currentPage = 1
  pageSize = 7
  exportingSuiteId: string | null = null

  // Detail
  testSuiteId = ''
  currentSuiteName = ''
  suiteDetail: TestSuiteDto | null = null
  projectDetail: TestLabProjectDto | null = null
  showTestDetails = false
  membersOpen = false

  testPlans: TestPlanDto[] = []
  selectedPlanId: string | null = null
  generatingCasesPlanId: string | null = null
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  testCaseFilter: 'all' | 'valid' | 'invalid' = 'all'
  caseOpen: Record<string, boolean> = {}
  focusedTestCaseId: string | null = null

  // Test Status System
  testGenerationStatus: TestGenerationStatus = 'Draft'
  hasUnsavedChanges = false
  planGenerationStatus: Record<string, TestGenerationStatus> = {}
  lastGeneratedAt: Date | null = null
  savedAt: Date | null = null
  showUnsavedWarning = false
  unsavedWarningAction: 'leave' | 'close' | 'refresh' | null = null

  detailsModalOpen = false 
  detailsModalLoading = false
  detailsModalTab: 'details' | 'execution' = 'details'
  detailsModalSuite: TestSuiteDto | null = null
  detailsModalProject: TestLabProjectDto | null = null
  detailsModalPlans: TestPlanDto[] = []
  detailsModalCasesByPlan: Record<string, TestCaseDto[]> = {}
  detailsModalSelectedPlanId: string | null = null
  detailsModalOpenCaseSteps: Record<string, boolean> = {}
  detailsModalExecutionHistory: Record<string, ExecutionEntryDto[]> = {}

  // Computed
  get filteredSuites(): TestSuiteDto[] {
    const q = this.searchQuery.toLowerCase().trim()
    const wantedStatus = this.statusFilter

    return this.suites.filter((suite) => {
      const name = this.getSuiteDisplayName(suite).toLowerCase()
      const description = String(suite.description || '').toLowerCase()
      const creator = String(suite.creatorName || '').toLowerCase()
      const suiteProjectId = this.getSuiteProjectId(suite)
      const matchesSearch =
        !q || name.includes(q) || description.includes(q) || creator.includes(q)
      const matchesStatus = wantedStatus === 'all' || this.getSuiteStatusKey(suite) === wantedStatus
      const matchesProject = !this.projectFilterId || suiteProjectId === this.projectFilterId
      return matchesSearch && matchesStatus && matchesProject
    })
  }

  get paginatedSuites(): TestSuiteDto[] {
    const start = (this.currentPage - 1) * this.pageSize
    return this.filteredSuites.slice(start, start + this.pageSize)
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSuites.length / this.pageSize))
  }

  get visibleStart(): number {
    return this.filteredSuites.length === 0
      ? 0
      : (this.currentPage - 1) * this.pageSize + 1
  }

  get visibleEnd(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredSuites.length)
  }

  get selectedPlan(): TestPlanDto | null {
    return this.testPlans.find((p) => p.id === this.selectedPlanId) ?? null
  }

  get selectedTestCases(): TestCaseDto[] {
    return this.testCasesByPlan[this.selectedPlanId ?? ''] ?? []
  }

  get filteredSelectedTestCases(): TestCaseDto[] {
    const wanted = this.testCaseFilter
    const cases = this.selectedTestCases
    if (wanted === 'all') return cases

    return cases.filter((tc) => {
      const hasSteps = Array.isArray(tc?.steps) && tc.steps.length > 0
      const hasExpected = String(tc?.expected_result || '').trim().length > 0
      const isValid = hasSteps && hasExpected
      return wanted === 'valid' ? isValid : !isValid
    })
  }

  get visibleSelectedTestCases(): TestCaseDto[] {
    const cases = this.filteredSelectedTestCases
    if (!this.focusedTestCaseId) return cases
    return cases.filter((tc) => tc.id === this.focusedTestCaseId)
  }

  get totalTestCases(): number {
    return this.getTotalCases(this.suiteDetail)
  }

  get detailsModalSuiteName(): string {
    return this.detailsModalSuite ? this.getSuiteDisplayName(this.detailsModalSuite) : '—'
  }

  get detailsModalSelectedPlan(): TestPlanDto | null {
    return this.detailsModalPlans.find((plan) => plan.id === this.detailsModalSelectedPlanId) ?? null
  }

  get detailsModalSelectedCases(): TestCaseDto[] {
    return this.detailsModalCasesByPlan[this.detailsModalSelectedPlanId ?? ''] ?? []
  }

  get detailsModalSelectedPlanExecutionKey(): string {
    return this.getExecutionHistoryStorageKey(this.detailsModalSuite?._id || '')
  }

  get detailsModalTotalCases(): number {
    return this.detailsModalPlans.reduce((total, plan) => {
      return total + (this.detailsModalCasesByPlan[plan.id]?.length ?? plan.testCases?.length ?? plan.casesCount ?? 0)
    }, 0)
  }

  get detailsModalProjectName(): string {
    return this.detailsModalProject?.title || this.detailsModalSuite?.projectTitle || '—'
  }

  async ngOnInit() {
    await this.loadAcceptedProjects()
    await this.loadSuites()
    await this.applyRouteSelection()
  }

  private async loadAcceptedProjects(): Promise<void> {
    try {
      await this.projectsState.refresh(false)
      const projects = await firstValueFrom(this.projectsState.projects$.pipe(take(1)))
      this.acceptedProjectIds = new Set(
        (Array.isArray(projects) ? projects : [])
          .map((p) => String(p?._id || '').trim())
          .filter(Boolean)
      )
    } catch {
      this.acceptedProjectIds = new Set<string>()
    }
  }

  async loadSuites() {
    this.loading = true
    this.errorMessage = ''
    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      const token = String(user?.token || this.authService.session || '').trim()
      if (!token) {
        this.errorMessage = 'Session expirée.'
        return
      }
      this.suites = await firstValueFrom(this.testLabService.getAllTestSuites())
    } catch (err: unknown) {

    if (err instanceof Error) {
      this.errorMessage = err.message
    } else {
      this.errorMessage = 'Unable to load test suites'
    }

  } finally {
    this.loading = false
  }
  }

  async onExportSuite(suite: TestSuiteDto): Promise<void> {
    const id = String(suite?._id || '').trim()
    if (!id) return

    this.exportingSuiteId = id
    this.errorMessage = ''
    try {
      const blob = await firstValueFrom(this.testLabService.exportWord(id))
      const safeName =
  this.getSuiteDisplayName(suite)
    .trim()
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80) || 'TestSuite'

      const now = new Date()
      const yyyy = now.getFullYear()
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      const dd = String(now.getDate()).padStart(2, '0')
      const filename = `TestPlan_${safeName}_${yyyy}-${mm}-${dd}.docx`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
    } catch (err: unknown) {

    if (err instanceof Error) {
      this.errorMessage = err.message
    } else {
      this.errorMessage = 'Unable to export Word document'
    }

  } finally {
     this.exportingSuiteId = null
  }
  }

  toggleActionMenu(suite: TestSuiteDto, event: Event): void {
    event.stopPropagation()
    const id = String(suite?._id || '').trim()
    this.actionMenuSuiteId = this.actionMenuSuiteId === id ? null : id
  }

  closeActionMenu(): void {
    this.actionMenuSuiteId = null
  }

  async onActionExportSuite(suite: TestSuiteDto, event: Event): Promise<void> {
    event.stopPropagation()
    this.closeActionMenu()
    await this.onExportSuite(suite)
  }

  onActionOpenSuite(suite: TestSuiteDto, event: Event): void {
  event.stopPropagation()
  event.preventDefault()
  
  // Capture la suite AVANT de fermer le menu
  const targetSuite = suite
  
  // Ferme le menu après un tick pour ne pas interférer
  setTimeout(() => {
    this.actionMenuSuiteId = null
    void this.openDetailsModal(targetSuite)
  }, 0)
}

async openDetailsModal(suite: TestSuiteDto): Promise<void> {
  if (!this.canOpenSuite(suite)) {
    this.uiNotification.accessDenied("Access denied: you are not authorized to open this test.")
    return
  }

  const suiteId = String(suite?._id || '').trim()
  if (!suiteId) return

  this.ngZone.run(() => {
    this.detailsModalOpen = true
    this.detailsModalLoading = true
    this.detailsModalTab = 'details'
    this.detailsModalSuite = suite
    this.detailsModalProject = null
    this.detailsModalPlans = []
    this.detailsModalCasesByPlan = {}
    this.detailsModalSelectedPlanId = null
    this.detailsModalOpenCaseSteps = {}
    this.detailsModalExecutionHistory = {}
    this.errorMessage = ''
    this.cdr.detectChanges()
  })

  try {
    const detail = await firstValueFrom(this.testLabService.getTestSuiteById(suiteId))
    const resp = await firstValueFrom(this.testLabService.getTestPlans(suiteId))
    const plans = resp?.testPlans?.length ? resp.testPlans : (detail.testPlans || [])
    const casesRows = resp?.testCasesByPlan?.length ? resp.testCasesByPlan : (detail.testCasesByPlan || [])
    const casesByPlan: Record<string, TestCaseDto[]> = {}

    for (const plan of plans) {
      casesByPlan[plan.id] = plan.testCases || []
    }
    for (const row of casesRows) {
      const planId = String(row?.planId || '').trim()
      if (planId) casesByPlan[planId] = row.testCases || []
    }

    // ✅ Extraire le projet ICI, avant le ngZone.run
    const resolvedProject =
      detail?.projectId && typeof detail.projectId === 'object'
        ? (detail.projectId as TestLabProjectDto)
        : null

    // ✅ Extraire le projectId ICI aussi
    const projectId = String(resolvedProject?._id || '').trim()

    this.ngZone.run(() => {
      this.detailsModalSuite = detail
      this.detailsModalProject = resolvedProject  // ✅ objet complet avec assignedUsers
      this.detailsModalPlans = plans
      this.detailsModalCasesByPlan = casesByPlan
      this.detailsModalSelectedPlanId = plans[0]?.id ?? null
      this.detailsModalExecutionHistory = this.readExecutionHistory(suiteId)
      this.cdr.detectChanges()
    })

    // ✅ Maintenant projectId est disponible directement
    if (projectId) {
      try {
        await this.loadMembers(projectId)
        this.cdr.detectChanges()  // ✅ refresh après loadMembers
      } catch {
        // ignore
      }
    }

  } catch (err: unknown) {
    this.ngZone.run(() => {
      this.errorMessage = getErrorMessage(err, 'Unable to load test details')
      this.cdr.detectChanges()
    })
  } finally {
    this.ngZone.run(() => {
      this.detailsModalLoading = false
      this.cdr.detectChanges()
    })
  }
}

  closeDetailsModal(): void {
    this.detailsModalOpen = false
    this.detailsModalLoading = false
    this.detailsModalSuite = null
    this.detailsModalProject = null
    this.detailsModalPlans = []
    this.detailsModalCasesByPlan = {}
    this.detailsModalSelectedPlanId = null
    this.detailsModalOpenCaseSteps = {}
    this.detailsModalExecutionHistory = {}
     this.cdr.detectChanges()
  }

  selectDetailsModalPlan(planId: string): void {
    this.detailsModalSelectedPlanId = planId
  }

  setDetailsModalTab(tab: 'details' | 'execution'): void {
    this.detailsModalTab = tab
  }

  isDetailsModalCaseStepsOpen(planId: string | null | undefined, caseId: string): boolean {
    return Boolean(this.detailsModalOpenCaseSteps[this.getCaseKey(planId, caseId)])
  }

  toggleDetailsModalCaseSteps(planId: string | null | undefined, caseId: string): void {
    const key = this.getCaseKey(planId, caseId)
    this.detailsModalOpenCaseSteps = {
      ...this.detailsModalOpenCaseSteps,
      [key]: !this.detailsModalOpenCaseSteps[key],
    }
  }

  formatTestData(value: unknown): string {
    if (value === null || value === undefined) return '—'
    if (typeof value === 'string') {
      const trimmed = value.trim()
      return trimmed || '—'
    }

    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }

  async onOpenSuite(suite: TestSuiteDto) {
    this.testSuiteId = String(suite._id).trim()
    if (!this.testSuiteId) return

    this.view = 'detail'
    this.suiteDetail = null
    this.projectDetail = null
    this.showTestDetails = false
    this.membersOpen = false
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}
    this.caseOpen = {}
    this.focusedTestCaseId = null
    this.loading = true
    this.errorMessage = ''

    try {
      const detail = await firstValueFrom(this.testLabService.getTestSuiteById(this.testSuiteId))
      this.suiteDetail = detail
      this.currentSuiteName = this.getSuiteDisplayName(detail)
      this.projectDetail =
        detail?.projectId && typeof detail.projectId === 'object'
          ? (detail.projectId as TestLabProjectDto)
          : null

      const resp = await firstValueFrom(this.testLabService.getTestPlans(this.testSuiteId))
      this.testPlans = resp?.testPlans ?? []
      if (!this.testPlans.length) {
        this.errorMessage = 'No test plans found.'
        return
      }
      this.selectedPlanId = this.testPlans[0].id
      await this.generateTestCases(this.testPlans[0], false)
    } catch (err: unknown) {

    if (err instanceof Error) {
      this.errorMessage = err.message
    } else {
      this.errorMessage = 'Unable to load plans'
    }

  } finally {
    this.loading = false
  }
  }

  onSuiteRowClick(suite: TestSuiteDto): void {
    if (!this.canOpenSuite(suite)) {
      this.uiNotification.accessDenied("Access denied: you are not authorized to open this test.")
      return
    }
    void this.onOpenSuite(suite)
  }

  private async applyRouteSelection(): Promise<void> {
    const query = this.route.snapshot.queryParamMap
    this.projectFilterId = String(query.get('projectId') || '').trim()
    const suiteId = String(query.get('suiteId') || '').trim()

    if (suiteId) {
      const target = this.suites.find((suite) => String(suite?._id || '').trim() === suiteId)
      if (target) {
        if (!this.canOpenSuite(target)) {
          this.uiNotification.accessDenied("Access denied: you are not authorized to open this test.")
          return
        }
        await this.onOpenSuite(target)
        return
      }
    }

    if (this.projectFilterId) {
      const projectSuites = this.suites.filter((suite) => this.getSuiteProjectId(suite) === this.projectFilterId)
      if (projectSuites.length === 1) {
        if (!this.canOpenSuite(projectSuites[0])) return
        await this.onOpenSuite(projectSuites[0])
      }
    }
  }

  private getSuiteProjectId(suite: TestSuiteDto): string {
    const raw = suite?.projectId
    if (!raw) return ''
    if (typeof raw === 'string') return raw.trim()
    return String((raw as TestLabProjectDto)?._id || '').trim()
  }

  async onRunSuiteFromList(suite: TestSuiteDto): Promise<void> {
    if (!this.canOpenSuite(suite)) {
      this.uiNotification.accessDenied("Access denied: you are not authorized to run this test.")
      return
    }

    const suiteId = String(suite?._id || '').trim()
    if (!suiteId) return

    this.loading = true
    this.errorMessage = ''

    try {
      const detail = await firstValueFrom(this.testLabService.getTestSuiteById(suiteId))

      const projectName =
        (detail?.projectId && typeof detail.projectId === 'object'
          ? (detail.projectId as TestLabProjectDto)?.title
          : undefined) ||
        detail?.projectTitle ||
        '—'

      const suiteName = this.getSuiteDisplayName(detail) || this.getSuiteDisplayName(suite) || '—'

      await this.router.navigate(['/execution/Execution-Management'], {
        queryParams: {
          suiteId,
          projectName,
          suiteName,
          planId: undefined,
          planName: '—',
        },
      })
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to run test suite')
    } finally {
      this.loading = false
    }
  }

  onBackToList() {
    this.view = 'list'
    this.testSuiteId = ''
    this.currentSuiteName = ''
    this.suiteDetail = null
    this.projectDetail = null
    this.showTestDetails = false
    this.membersOpen = false
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}
    this.caseOpen = {}
    this.focusedTestCaseId = null
    this.errorMessage = ''
  }

  private getCaseKey(planId: string | null | undefined, caseId: string): string {
    return `${String(planId || '')}::${String(caseId || '')}`
  }

  isCaseOpen(planId: string | null | undefined, caseId: string): boolean {
    return Boolean(this.caseOpen[this.getCaseKey(planId, caseId)])
  }

toggleCase(planId: string | null | undefined, caseId: string): void {
  const key = this.getCaseKey(planId, caseId)
  this.caseOpen = { ...this.caseOpen, [key]: !this.caseOpen[key] }
  this.cdr.detectChanges()
}

  focusTestCase(testCaseId: string): void {
    this.focusedTestCaseId = testCaseId
  }

  clearFocusedTestCase(): void {
    this.focusedTestCaseId = null
  }

  toggleMembers(): void {
    this.membersOpen = !this.membersOpen
  }

  get projectMembers(): (TestLabProjectUserDto | string)[] {
    const fromProject = this.projectDetail?.assignedUsers
    const fromProjectOwner =
      this.projectDetail?.ownerId && typeof this.projectDetail.ownerId === 'object'
        ? [this.projectDetail.ownerId as TestLabProjectUserDto]
        : []
    const fromSuiteProject =
      this.suiteDetail?.projectId && typeof this.suiteDetail.projectId === 'object'
        ? (this.suiteDetail.projectId as TestLabProjectDto)?.assignedUsers
        : undefined
    const fromSuiteProjectOwner =
      this.suiteDetail?.projectId &&
      typeof this.suiteDetail.projectId === 'object' &&
      (this.suiteDetail.projectId as TestLabProjectDto)?.ownerId &&
      typeof (this.suiteDetail.projectId as TestLabProjectDto).ownerId === 'object'
        ? [((this.suiteDetail.projectId as TestLabProjectDto).ownerId as TestLabProjectUserDto)]
        : []

    const baseMembers = (fromProject ?? fromSuiteProject ?? []) as (TestLabProjectUserDto | string)[]
    const merged = [...fromProjectOwner, ...fromSuiteProjectOwner, ...baseMembers]
    const seen = new Set<string>()
    return merged.filter((member) => {
      const id = this.getMemberId(member)
      if (!id) return false
      if (seen.has(id)) return false
      seen.add(id)
      return true
    })
  }

  async onSelectPlan(plan: TestPlanDto) {
    this.selectedPlanId = plan.id
    this.focusedTestCaseId = null
    if (this.testCasesByPlan[plan.id]?.length) return
    await this.generateTestCases(plan, false)
  }

  async onRunPlan(plan: TestPlanDto): Promise<void> {
    this.selectedPlanId = plan.id
    await this.onRunSuite()
  }

  onDeletePlan(plan: TestPlanDto): void {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Confirm'
    ref.componentInstance.message = 'Are you sure you want to delete this test case?'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'

    ref.closed.subscribe(() => {
      this.applyDeletePlanLocally(plan.id)
      void this.refreshPlans()
    })
  }

  async onRegenerate(plan: TestPlanDto) {
    await this.generateTestCases(plan, true)
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    this.testCasesByPlan[planId] = (this.testCasesByPlan[planId] ?? []).filter(
      (tc) => tc.id !== testCaseId
    )
    void this.saveAllValidationChanges()
  }

  onConfirmDeleteTestCase(planId: string, testCaseId: string): void {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })
    ref.componentInstance.title = 'Confirm'
    ref.componentInstance.message = 'Are you sure you want to delete this test case?'
    ref.componentInstance.confirmText = 'Delete'
    ref.componentInstance.cancelText = 'Cancel'

    ref.closed.subscribe(() => {
      this.onDeleteTestCase(planId, testCaseId)
      void this.refreshPlans()
    })
  }

  async onRunTestCase(planId: string, testCaseId: string): Promise<void> {
    this.selectedPlanId = planId
    if (!this.suiteDetail) return
    this.loading = true
    this.errorMessage = ''
    try {
      const projectName =
        this.projectDetail?.title || this.suiteDetail?.projectTitle || '—'
      const suiteName = this.currentSuiteName || this.getSuiteDisplayName(this.suiteDetail)
      const planName = this.testPlans.find((p) => p.id === planId)?.title || '—'
      const testCaseName =
        this.testCasesByPlan[planId]?.find((tc) => tc.id === testCaseId)?.title || testCaseId

      await this.router.navigate(['/execution', testCaseId], {
        queryParams: {
          suiteId: this.testSuiteId,
          planId,
          projectName,
          suiteName,
          planName,
          testCaseName,
        },
      })
    } catch {
      this.errorMessage = 'Unable to run test suite'
    } finally {
      this.loading = false
    }
  }

async onRunTestCaseFromModal(planId: string, testCase: TestCaseDto): Promise<void> {
  console.log("🧪 CLICK RUN TEST CASE");

  const suite = this.detailsModalSuite;
  console.log("📦 SUITE:", suite);

  if (!suite) {
    console.error("❌ suite = null");
    return;
  }

  const suiteId = String(suite._id || '').trim();
  console.log("🆔 suiteId:", suiteId);

  if (!suiteId || !planId || !testCase?.id) {
    console.error("❌ Missing data:", { suiteId, planId, testCase });
    return;
  }

  console.log("✅ TEST CASE SELECTED:", testCase);

  const projectName = this.detailsModalProjectName;
  const suiteName = this.getSuiteDisplayName(suite);
  const planName =
    this.detailsModalPlans.find((plan) => plan.id === planId)?.title || '—';

  console.log("📌 NAVIGATION DATA:", {
    projectName,
    suiteName,
    planName,
    testCaseId: testCase.id
  });

  // save history
  this.recordExecutionHistory(suiteId, planId, testCase.id);

  // close modal
  console.log("🪟 Closing modal...");
  this.closeDetailsModal();

  // navigate
  console.log("➡️ Navigating to execution...");
  
await this.router.navigate(['/execution', testCase.id], {
  queryParams: {
    suiteId,
    planId: testCase.planId, // ✅ FIX ICI
    projectName,
    suiteName,
    planName,
    testCaseName: testCase.title || testCase.id,
  },
})
;

  console.log("✅ Navigation DONE");
}

// Add this method right after onRunTestCaseFromModal
async onRunPlanFromModal(plan: TestPlanDto): Promise<void> {
  const suite = this.detailsModalSuite;
  if (!suite) return;

  const suiteId = String(suite._id || '').trim();
  const planId = String(plan.id || '').trim();
  if (!suiteId || !planId) return;

  const projectName = this.detailsModalProjectName;
  const suiteName = this.getSuiteDisplayName(suite);
  const planName = plan.title || planId;

  this.closeDetailsModal();

  await this.router.navigate(['/execution/Execution-Management'], {
    queryParams: {
      suiteId,
      planId,
      projectName,
      suiteName,
      planName,
    },
  });
}

  getExecutionEntries(planId: string, caseId: string): ExecutionEntryDto[] {
    return this.detailsModalExecutionHistory[this.getExecutionHistoryKey(planId, caseId)] ?? []
  }

  getLatestExecutionEntry(planId: string, caseId: string): ExecutionEntryDto | null {
    const entries = this.getExecutionEntries(planId, caseId)
    return entries.length ? entries[entries.length - 1] : null
  }

  private getExecutionHistoryKey(planId: string, caseId: string): string {
    return `${String(planId || '')}::${String(caseId || '')}`
  }

  private getExecutionHistoryStorageKey(suiteId: string): string {
    return `testlab.executionHistory.${String(suiteId || '').trim()}`
  }

  private readExecutionHistory(suiteId: string): Record<string, ExecutionEntryDto[]> {
    try {
      const raw = localStorage.getItem(this.getExecutionHistoryStorageKey(suiteId))
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, ExecutionEntryDto[]>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch {
      return {}
    }
  }

  private writeExecutionHistory(suiteId: string, history: Record<string, ExecutionEntryDto[]>): void {
    try {
      localStorage.setItem(this.getExecutionHistoryStorageKey(suiteId), JSON.stringify(history))
    } catch {
      // ignore storage failures
    }
  }

  private recordExecutionHistory(suiteId: string, planId: string, caseId: string): void {
    const key = this.getExecutionHistoryKey(planId, caseId)
    const history = { ...this.detailsModalExecutionHistory }
    const current = history[key] ?? []
    const entry: ExecutionEntryDto = {
      executedAt: new Date().toISOString(),
      duration: '0s',
      status: 'passed',
    }
    history[key] = [...current, entry]
    this.detailsModalExecutionHistory = history
    this.writeExecutionHistory(suiteId, history)
  }

  async onUploadSpec(event: Event, suiteId: string) {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return

    try {
      const user = await firstValueFrom(
        this.store.select(getUser).pipe(take(1))
      )
      const userId = String(user?.id ?? user?._id ?? '').trim()
      
      if (!userId) {
        this.errorMessage = 'Session expired. Please reconnect.'
        this.uiNotification.error('Session expired. Please reconnect.')
        return
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('testSuiteId', suiteId)
      formData.append('userId', userId)
      formData.append('regenerate', 'false')

      await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
      await this.loadSuites()
      this.uiNotification.success('Test plan generated successfully')
    } catch (err: unknown) {
      if (err instanceof Error) {
        this.errorMessage = err.message
        this.uiNotification.error(err.message)
      } else {
        this.errorMessage = 'Upload failed'
        this.uiNotification.error('Upload failed')
      }
    }
  }

  onSearchQueryChange(): void {
    this.currentPage = 1
  }

  setStatusFilter(status: TestSuiteStatusKey): void {
    this.statusFilter = status
    this.currentPage = 1
  }

  goToPreviousPage(): void {
    if (this.currentPage > 1) this.currentPage--
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages) this.currentPage++
  }

  private normalizeStatusKey(value: unknown): string {
    const v = String(value || '').toLowerCase().trim()
    if (!v) return ''
    return v
  }

  getSuiteStatusKey(suite: TestSuiteDto | null | undefined): Exclude<TestSuiteStatusKey, 'all'> {
    const raw = suite?.status ?? suite?.validationStatus ?? 'incomplete'
    const key = this.normalizeStatusKey(raw)
    switch (key) {
      case 'completed':
      case 'incomplete':
        return key
      case 'validated':
        return 'completed'
      case 'invalid':
        return 'incomplete'
      default:
        return 'incomplete'
    }
  }

  getSuiteStatusLabel(suite: TestSuiteDto | null | undefined): string {
    const key = this.getSuiteStatusKey(suite)
    const labels: Record<Exclude<TestSuiteStatusKey, 'all'>, string> = {
      completed: 'Completed',
      incomplete: 'Incomplete',
    }
    return labels[key]
  }

getBadgeClass(suite: TestSuiteDto | null | undefined): string {
  const status = this.getSuiteStatusKey(suite)
  const map: Record<Exclude<TestSuiteStatusKey, 'all'>, string> = {
    completed: 'completed',   // ← correspond à votre CSS
    incomplete: 'incomplete', // ← correspond à votre CSS
  }
  return map[status]
}

  getSuiteDisplayName(suite: TestSuiteDto): string {
    const userFacing = String(suite?.nametest || '').trim()
    if (userFacing) return userFacing
    const name = String(suite?.nom || '').trim()
    return name || String(suite?._id || '')
  }

  getSuiteInitials(suite: TestSuiteDto): string {
    const name = this.getSuiteDisplayName(suite) || '?'
    return name.slice(0, 2).toUpperCase()
  }

getTotalCases(suite: TestSuiteDto | null | undefined): number {
  if (!suite) return 0
  return (
    suite.totalCases ??
    suite.casesCount ??
    suite.totalTestCases ??
    (suite.testPlans?.reduce((acc: number, plan: TestPlanDto) => {
      return acc + (plan.testCases?.length ?? plan.casesCount ?? 0)
    }, 0) ?? 0)
  )
}
 

  resolveAvatarUrl(pictureUrl?: string): string {
    if (!pictureUrl) return '/assets/images/users/default-user.svg'
    return this.apiService.toAbsoluteUrl(pictureUrl)
  }

  scrollToSection(sectionId: string): void {
    const id = String(sectionId || '').trim()
    if (!id) return
    try {
      const el = typeof document !== 'undefined' ? document.getElementById(id) : null
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      // ignore
    }
  }

  toggleTestDetails(): void {
    this.showTestDetails = !this.showTestDetails
    if (!this.showTestDetails) return
    setTimeout(() => this.scrollToSection('tv-test-section'), 0)
  }

  getMemberId(member: TestLabProjectUserDto | string | null | undefined): string {
    if (!member) return ''
    if (typeof member === 'string') return member
    return String(member._id || '').trim()
  }

  getMemberDisplayName(member: TestLabProjectUserDto | string | null | undefined): string {
    if (!member) return ''
    if (typeof member === 'string') return member
    return String(member.name || member.email || '').trim()
  }

getMemberPicture(member: TestLabProjectUserDto | string | null | undefined): string {
  if (!member || typeof member === 'string') {
    return '/assets/images/users/default-user.svg'
  }

  const pic = member.picture?.trim()

  if (!pic) {
    return '/assets/images/users/default-user.svg'
  }

  return this.apiService.toAbsoluteUrl(pic)
}

  getUserInitials(value?: string): string {
    const raw = String(value || '').trim()
    if (!raw) return 'U'
    const parts = raw.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) {
      return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
    }
    return raw.slice(0, 2).toUpperCase()
  }

  
onAvatarError(event: Event): void {
  const img = event.target as HTMLImageElement
  img.src = '/assets/images/users/default-user.svg'
}


  private async generateTestCases(plan: TestPlanDto, regenerate: boolean) {
    this.generatingCasesPlanId = plan.id
    this.errorMessage = ''
    try {
      const resp = await firstValueFrom(
        this.testLabService.generateTestCases({
          testSuiteId: this.testSuiteId,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          regenerate,
        })
      )
      this.testCasesByPlan[plan.id] = resp?.testCases ?? []
      await this.saveAllValidationChanges()
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to generate test cases')
    } finally {
      this.generatingCasesPlanId = null
    }
  }

  private getPlanSessionStatus(planId: string): string {
    const list = this.testCasesByPlan[planId] || []
    return list.length > 0 ? 'completed' : 'incomplete'
  }

  private computeSuiteSessionStatus(): SuiteSessionStatus {
    if (!this.testPlans.length) return 'incomplete'
    const allReady = this.testPlans.every((p) => (this.testCasesByPlan[p.id] || []).length > 0)
    return allReady ? 'completed' : 'incomplete'
  }

  private async saveAllValidationChanges(): Promise<void> {
    const suiteId = String(this.testSuiteId || '').trim()
    if (!suiteId || !this.testPlans.length) return

    const planStatuses: Record<string, string> = {}
    for (const plan of this.testPlans) {
      planStatuses[plan.id] = this.getPlanSessionStatus(plan.id)
    }

    const testCasesByPlan = this.testPlans.map((plan) => ({
      planId: plan.id,
      planTitle: plan.title,
      testCases: this.testCasesByPlan[plan.id] || [],
    }))

    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(suiteId, {
          sessionKind: 'validation',
          suiteStatus: this.computeSuiteSessionStatus(),
          planStatuses,
          testCasesByPlan,
        })
      )
    } catch {
      // Do not block UI actions when autosave fails.
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const u = (decoded?.['user'] as Record<string, unknown>) ?? decoded ?? {}
      return String(u['userId'] ?? u['id'] ?? u['_id'] ?? u['sub'] ?? '').trim()
    } catch {
      return ''
    }
  }

  countByStatus(status: string): number {
    const wanted = this.normalizeStatusKey(status)
    if (!wanted || wanted === 'all') {
      return wanted === 'all' ? this.suites.length : 0
    }
    return this.suites.filter((suite) => this.getSuiteStatusKey(suite) === wanted).length
  }

  getSuiteSpecFile(suite: TestSuiteDto): string {
    return suite.specFile || suite.spec_file || ''
  }

  getCleanDescription(suite: TestSuiteDto): string {
    const raw = suite.description || ''
    const cleaned = raw
      .replace(/style\s*=\s*fontsize[^-]*/gi, '')
      .replace(/----?\s*SPEC EXTRACT\s*----?/gi, '')
      .trim()
    return cleaned.length > 80 ? cleaned.slice(0, 80) + '…' : cleaned || '—'
  }

 canOpenSuite(suite: TestSuiteDto | null | undefined): boolean {
  if (!suite) return false;
  // Seulement false explicite bloque, pas undefined/null
  if (suite.canOpen === false) return false;
  return true;
}
//do to selenium web driver 
  async onRunSuite(): Promise<void> {
    if (!this.suiteDetail) {
      this.errorMessage = 'No test suite selected'
      return
    }

    this.loading = true
    this.errorMessage = ''

    try {
      const projectName =
        this.projectDetail?.title || this.suiteDetail?.projectTitle || '—'
      const suiteName = this.currentSuiteName || this.getSuiteDisplayName(this.suiteDetail)
      const planId = this.selectedPlanId || undefined
      const planName = planId ? (this.testPlans.find((p) => p.id === planId)?.title || '—') : '—'

      await this.router.navigate(['/execution/Execution-Management'], {
        queryParams: {
          suiteId: this.testSuiteId,
          planId,
          projectName,
          suiteName,
          planName,
        },
      })
    } catch {
      this.errorMessage =  'Unable to run test suite'
    } finally {
      this.loading = false
    }
  }

  toggleFilterDropdown(): void {
    this.filterOpen = !this.filterOpen
  }

  getFilterLabel(key: string): string {
    return this.statusFilters.find((f) => f.key === key)?.label ?? key
  }

@HostListener('document:click', ['$event'])
closeDropdown(event: MouseEvent): void {
  const target = event.target as HTMLElement
  if (target?.closest('.tv-cases-body')) return
  
  // Ignore si clic vient du menu actions (géré par toggleActionMenu/onAction*)
  if (target?.closest('.tv-actions-menu')) return  // ← ajoute cette ligne
  
  if (!target?.closest('.tv-actions-menu-wrap')) {
    this.actionMenuSuiteId = null
  }
  const filterWrap = target?.closest('.tv-filter-wrap')
  if (!filterWrap) {
    this.filterOpen = false
  }
}

  private applyDeletePlanLocally(planId: string): void {
    this.testPlans = this.testPlans.filter((p) => p.id !== planId)
    delete this.testCasesByPlan[planId]
    if (this.selectedPlanId === planId) {
      this.selectedPlanId = this.testPlans[0]?.id ?? null
    }
    void this.saveAllValidationChanges()
  }

  private async refreshPlans(): Promise<void> {
    if (!this.testSuiteId) return
    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(this.testSuiteId))
      this.testPlans = resp?.testPlans ?? []
    } catch {
      // keep current list on failure
    }
  }

  getProjectProgress(): number {
  if (!this.detailsModalPlans.length) return 0

  const total = this.detailsModalPlans.length

  const completed = this.detailsModalPlans.filter(plan => {
    const cases =
      this.detailsModalCasesByPlan[plan.id] ||
      plan.testCases ||
      []

    return cases.length > 0
  }).length

  return Math.round((completed / total) * 100)
}

get modalTeamMembers(): TeamMemberView[] {
  // Récupère les membres du projet du modal
  let members: (TestLabProjectUserDto | string)[] = []

  // 1. Depuis le projet du modal
  if (this.detailsModalProject?.assignedUsers) {
    members = [...members, ...this.detailsModalProject.assignedUsers]
  }

  // 2. Owner du projet du modal
  if (this.detailsModalProject?.ownerId && typeof this.detailsModalProject.ownerId === 'object') {
    const owner = this.detailsModalProject.ownerId as TestLabProjectUserDto
    if (!members.find((m) => this.getMemberId(m) === this.getMemberId(owner))) {
      members.push(owner)
    }
  }

  // 3. Fallback: depuis la suite du modal
  if (this.detailsModalSuite?.projectId && typeof this.detailsModalSuite.projectId === 'object') {
    const suiteProjUsers = (this.detailsModalSuite.projectId as TestLabProjectDto)?.assignedUsers
    if (suiteProjUsers?.length) {
      for (const user of suiteProjUsers) {
        if (!members.find((m) => this.getMemberId(m) === this.getMemberId(user))) {
          members.push(user)
        }
      }
    }
  }

  // 4. Fallback: owner du projet de la suite
  if (
    this.detailsModalSuite?.projectId &&
    typeof this.detailsModalSuite.projectId === 'object'
  ) {
    const suiteProjectOwner = (this.detailsModalSuite.projectId as TestLabProjectDto)?.ownerId
    if (suiteProjectOwner && typeof suiteProjectOwner === 'object') {
      const owner = suiteProjectOwner as TestLabProjectUserDto
      if (!members.find((m) => this.getMemberId(m) === this.getMemberId(owner))) {
        members.push(owner)
      }
    }
  }

  // Convertir en TeamMemberView
  return members
    .filter((m): m is TestLabProjectUserDto => !!m && typeof m !== 'string')
    .map((member) => {
      const name = String(member.name || member.email || '').trim()

      const initials = name
        .split(' ')
        .map(p => p[0])
        .slice(0, 2)
        .join('')
        .toUpperCase() || 'U'

      const photo = member.picture?.trim() || ''

      return {
        id: member._id || '',
        name,
        initials,
        hasPhoto: true,
        photoUrl: photo
          ? this.resolveAvatarUrl(photo)
          : '/assets/images/users/default-user.svg',
        isOwner: false
      }
    })
}


get safeModalMembers(): TeamMemberView[] {
  return this.modalTeamMembers || []
}

get detailsModalProjectMembers(): (TestLabProjectUserDto | string)[] {
  // combine members loaded from API (`this.members`) with project/suite embedded users
  const membersFromApi = Array.isArray(this.members) ? (this.members as TestLabProjectUserDto[]) : []
  const collected: (TestLabProjectUserDto | string)[] = []

  // add API-loaded members first
  for (const m of membersFromApi) {
    if (this.getMemberId(m)) collected.push(m)
  }

  // add assignedUsers from detailsModalProject
  if (this.detailsModalProject?.assignedUsers) {
    for (const m of this.detailsModalProject.assignedUsers) {
      if (!collected.find((x) => this.getMemberId(x) === this.getMemberId(m))) collected.push(m)
    }
  }

  // add owner from detailsModalProject
  if (this.detailsModalProject?.ownerId && typeof this.detailsModalProject.ownerId === 'object') {
    const owner = this.detailsModalProject.ownerId as TestLabProjectUserDto
    if (!collected.find((x) => this.getMemberId(x) === this.getMemberId(owner))) collected.push(owner)
  }

  // fallback: suite embedded project users
  if (this.detailsModalSuite?.projectId && typeof this.detailsModalSuite.projectId === 'object') {
    const suiteProjUsers = (this.detailsModalSuite.projectId as TestLabProjectDto)?.assignedUsers || []
    for (const m of suiteProjUsers) {
      if (!collected.find((x) => this.getMemberId(x) === this.getMemberId(m))) collected.push(m)
    }
    const suiteOwner = (this.detailsModalSuite.projectId as TestLabProjectDto)?.ownerId
    if (suiteOwner && typeof suiteOwner === 'object') {
      if (!collected.find((x) => this.getMemberId(x) === this.getMemberId(suiteOwner))) collected.push(suiteOwner as TestLabProjectUserDto)
    }
  }

  return collected
}

members: TestLabProjectUserDto[] = []

async loadMembers(projectId: string) {
  this.members = await firstValueFrom(
    this.projectService.getUsersByProject(projectId)
  )}
}
