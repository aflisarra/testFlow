import { AuthenticationService } from '@/app/core/services/auth.service'
import { UINotificationService } from '@/app/core/services/ui-notification.service'
import {  ChangeDetectorRef } from '@angular/core'
import {
  TestLabService,
  type TestCaseDto,
  type TestLabProjectDto,
  type TestLabProjectUserDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { TestGenerationStatus, TestSuiteStatusKey } from '@/app/views/test/models/status.types'
import { getErrorMessage } from '@/app/views/test/utils/error.utils'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, HostListener, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ConfirmModalComponent } from '../../admin/shared/confirm-modal.component'

@Component({
  selector: 'app-test-cases-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-test.component.html',
  styleUrls: ['./list-test.component.css'],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  //encapsulation: ViewEncapsulation.None,
})
export class TestCasesValidationComponent implements OnInit {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private uiNotification = inject(UINotificationService)
  private testLabService = inject(TestLabService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)
  private modalService = inject(NgbModal)
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

  onSearchQueryInput(event: Event): void {
    const target = event.target as HTMLInputElement | null
    this.searchQuery = target?.value ?? ''
    this.currentPage = 1
  }

readonly statusFilters: readonly { key: TestSuiteStatusKey; label: string }[] = [
  { key: 'completed', label: 'Completed' },
  { key: 'incomplete', label: 'Incomplete' },
  { key: 'all', label: 'All' },
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

  // Test Status System
  testGenerationStatus: TestGenerationStatus = 'Draft'
  hasUnsavedChanges = false
  planGenerationStatus: Record<string, TestGenerationStatus> = {}
  lastGeneratedAt: Date | null = null
  savedAt: Date | null = null
  showUnsavedWarning = false
  unsavedWarningAction: 'leave' | 'close' | 'refresh' | null = null

  // Computed
  get filteredSuites(): TestSuiteDto[] {
    const q = this.searchQuery.toLowerCase().trim()
    const wantedStatus = this.statusFilter

    return this.suites.filter((suite) => {
      const name = this.getSuiteDisplayName(suite).toLowerCase()
      const description = String(suite.description || '').toLowerCase()
      const creator = String(suite.creatorName || '').toLowerCase()
      const matchesSearch =
        !q || name.includes(q) || description.includes(q) || creator.includes(q)
      const matchesStatus = wantedStatus === 'all' || this.getSuiteStatusKey(suite) === wantedStatus
      return matchesSearch && matchesStatus
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

  get totalTestCases(): number {
    return this.getTotalCases(this.suiteDetail)
  }

  async ngOnInit() {
    await this.loadSuites()
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
    if (suite?.canOpen === false) {
      this.uiNotification.accessDenied("Access denied: you are not authorized to open this test.")
      return
    }
    void this.onOpenSuite(suite)
  }

  async onRunSuiteFromList(suite: TestSuiteDto): Promise<void> {
    if (suite?.canOpen === false) {
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
        (detail as any)?.projectTitle ||
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

  toggleMembers(): void {
    this.membersOpen = !this.membersOpen
  }

  get projectMembers(): (TestLabProjectUserDto | string)[] {
    const fromProject = this.projectDetail?.assignedUsers
    const fromSuiteProject =
      this.suiteDetail?.projectId && typeof this.suiteDetail.projectId === 'object'
        ? (this.suiteDetail.projectId as TestLabProjectDto)?.assignedUsers
        : undefined

    const members = fromProject ?? fromSuiteProject ?? []
    return Array.isArray(members) ? members : []
  }

  async onSelectPlan(plan: TestPlanDto) {
    this.selectedPlanId = plan.id
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

  async onUploadSpec(event: Event, suiteId: string) {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('testSuiteId', suiteId)
    formData.append('regenerate', 'false')

    try {
      await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
      await this.loadSuites()
    } catch (err: unknown) {

    if (err instanceof Error) {
      this.errorMessage = err.message
    } else {
      this.errorMessage = 'Upload failed'
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

  getSuiteStatusKey(suite: TestSuiteDto): Exclude<TestSuiteStatusKey, 'all'> {
    const raw = suite.status ?? suite.validationStatus ?? 'incomplete'
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

  getSuiteStatusLabel(suite: TestSuiteDto): string {
    const key = this.getSuiteStatusKey(suite)
    const labels: Record<Exclude<TestSuiteStatusKey, 'all'>, string> = {
      completed: 'Completed',
      incomplete: 'Incomplete',
    }
    return labels[key]
  }

  getBadgeClass(suite: TestSuiteDto): string {
    const status = this.getSuiteStatusKey(suite)
    const map: Record<Exclude<TestSuiteStatusKey, 'all'>, string> = {
      completed: 'text-bg-success',
      incomplete: 'text-bg-danger',
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
    try {
      return new URL(pictureUrl).toString()
    } catch {
      return pictureUrl || '/assets/images/users/default-user.svg'
    }
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
    if (!member || typeof member === 'string') return ''
    return String(member.picture || '').trim()
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
    ;(event.target as HTMLImageElement).src = '/assets/images/users/default-user.svg'
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
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to generate test cases')
    } finally {
      this.generatingCasesPlanId = null
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
  // Ne pas interférer avec les clics dans tv-cases-body
  if (target?.closest('.tv-cases-body')) return
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
}
