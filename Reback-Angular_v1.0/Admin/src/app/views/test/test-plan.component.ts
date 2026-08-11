import { AdminManagementService } from '@/app/core/services/admin-management.service'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import { PlanEditModalComponent } from './plan-edit-modal.component'
import { SpecItemsExplorerComponent } from './spec-items-explorer/spec-items-explorer.component'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
  type RoleLabel,
  type RoleReviewItem,
} from '@/app/core/services/testlab.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import type { AppProject } from '@/app/interfaces/admin-management.interface'
import type { CanDeactivateComponent } from '@/app/interfaces/route-guards.interface'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { ConfirmModalComponent } from '@/app/views/admin/shared/confirm-modal.component'
import type { PlanStatus } from '@/app/views/test/models/status.types'
import { getErrorMessage, getErrorStatus } from '@/app/views/test/utils/error.utils'
import { CommonModule, DOCUMENT } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, ElementRef, HostListener, inject, NgZone, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'


interface CreateSuiteResponse {
  testSuiteId?: string
}
// Statuts possibles pour chaque plan dans le flux sÃ©quentiel
@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgbModalModule,
    PlanEditModalComponent,
    SpecItemsExplorerComponent,
  ],
  templateUrl: './test-plan.component.html',
  styleUrl: './test-plan.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})

export class TestSuiteConfigurationComponent implements CanDeactivateComponent {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)
  private adminManagementService = inject(AdminManagementService)
  private projectsRefresh = inject(ProjectsRefreshService)
  private projectsState = inject(ProjectsStateService)
  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
  private modalService = inject(NgbModal)
  private toastr = inject(ToastrService)
  private zone = inject(NgZone)
  private fb = inject(FormBuilder)
  private destroyRef = inject(DestroyRef)
  private document = inject(DOCUMENT)

  @ViewChild('plansResult') private plansResultRef?: ElementRef<HTMLElement>

  projects: AppProject[] = []
  loadingProjects = false
  private lastProjectId = ''

  // Reactive Form
testPlanForm: FormGroup = this.fb.group({
  name: ['', Validators.required],
  specDocument: ['', Validators.required],
  projectId: ['', Validators.required],
  applicationUrl: ['', [Validators.pattern(/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(\/.*)?$/)]],
})



  // Banner for existing test plan
  showExistingBanner = false
  existingTestPlan: { suiteId: string; name: string; specFileName: string } | null = null
  private suppressExistingProjectModal = false

  styleConfig = ''
  uploadedFileName = ''
  selectedFile: File | null = null
  uploadingSpecification = false
  specificationUploaded = false
isEditMode = false
  generatingPlans = false
  regeneratingPlanId: string | null = null
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  editingPlanIds: Record<string, boolean> = {}

  readonly roleLabels: RoleLabel[] = [
    'CONTEXT', 'ACTOR', 'FEATURE', 'REQUIREMENT', 'ACCEPTANCE',
    'NON_FUNCTIONAL', 'OUT_OF_SCOPE', 'GLOSSARY',
  ]
  roleReviewOpen = false
  roleReviewLoading = false
  roleReviewBusyItemId = ''
  roleReviewItems: RoleReviewItem[] = []
  roleReviewSelections: Record<string, RoleLabel | ''> = {}
  pendingRoleReviewCount = 0
  roleReviewLegacySuite = false
  roleReviewError = ''
  activeResultTab: 'plans' | 'items' = 'plans'

  // ── Flux séquentiel ─────────────────────────────────────────
  currentPlanIndex = -1
  planStatuses: Record<string, PlanStatus> = {}
  generatingCases = false
  finishing = false
  plansValidated = false
  sessionSaved = false
  generationGuardModalOpen = false
  generationStopping = false
  planEditModalOpen = false
  planEditDraft: TestPlanDto | null = null
  planEditMode: 'edit' | 'add' = 'edit'
  private generationGuardResolve: ((allowed: boolean) => void) | null = null
  private allowGenerationNavigation = false
  private pendingBrowserReload = false
  private plansGenerationToken = 0
  private casesGenerationToken = 0
  private activePlanGenerationRequestId = ''
  private activeCaseGenerationRequestId = ''

  // Getters for backward compatibility
  get selectedProjectId(): string {
    return this.testPlanForm.value.projectId || '';
  }

  get nameTest(): string {
    return this.testPlanForm.value.name || '';
  }

  onNameTestChange(value: string): void {
    this.testPlanForm.patchValue({ name: String(value || '') })
  }

  onNameTestInput(event: Event): void {
    const target = event.target as HTMLInputElement | null
    this.onNameTestChange(target?.value ?? '')
  }

  constructor() {
    this.destroyRef.onDestroy(() => this.document.body.classList.remove('test-plan-modal-open'))
    void this.loadProjects()
    void this.initializeFromQueryParams()

    this.projectsState.projects$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((projects: AppProject[]) => {
        this.projects = Array.isArray(projects) ? projects : []
      })

    this.projectsRefresh.changes$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadProjects())
  }

  private async initializeFromQueryParams(): Promise<void> {
    this.activatedRoute.queryParams.subscribe(async (params) => {
      const projectId = String(params['projectId'] || '').trim()

      if (!projectId) return

      this.testPlanForm.patchValue({ projectId })
      this.lastProjectId = projectId

      await this.loadExistingTestPlanBanner(projectId)
    })
  }

  private async loadProjects() {
    this.loadingProjects = true
    this.syncProjectIdControlDisabled()
    try {
      await this.projectsState.refresh(false)
    } catch {
      this.projects = []
    } finally {
      this.loadingProjects = false
      this.syncProjectIdControlDisabled()
    }
  }

  get selectedProjectTitle(): string {
    const match = this.projects.find((p) => String(p?._id || '') === String(this.testPlanForm.value.projectId || ''))
    return String(match?.title || '').trim()
  }

  get isSelectedProjectAccepted(): boolean {
    const selectedId = String(this.testPlanForm.getRawValue().projectId || '').trim()
    if (!selectedId) return false
    return this.projects.some((p) => String(p?._id || '').trim() === selectedId)
  }

  private isProjectAccepted(projectId: string): boolean {
    const id = String(projectId || '').trim()
    if (!id) return false
    return this.projects.some((p) => String(p?._id || '').trim() === id)
  }

  // â”€â”€â”€ Project Change Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async onProjectChange(): Promise<void> {
  const projectId = String(this.testPlanForm.value.projectId || '').trim()

  if (!projectId) {
    this.lastProjectId = ''
    this.showExistingBanner = false
    this.existingTestPlan = null
    this.currentTestSuiteId = ''
    return
  }

  try {
    if (!this.isProjectAccepted(projectId)) {
      this.showExistingBanner = false
      this.existingTestPlan = null
      this.currentTestSuiteId = ''
      this.toastr.warning(
        'You must accept this project before accessing its tests.',
        'Project Access'
      )
      return
    }

    // ✅ FIX 🔥
    if (this.lastProjectId === projectId) {
      this.suppressExistingProjectModal = false
    }

    if (this.lastProjectId && this.lastProjectId !== projectId) {
      this.resetFullState()
    }

    this.lastProjectId = projectId

    await this.loadExistingTestPlanBanner(projectId, true)

  } catch (error) {
    console.error('Error checking for existing test plan:', error)
    this.showExistingBanner = false
    this.existingTestPlan = null
    this.currentTestSuiteId = ''
  }
}

  // â”€â”€â”€ Banner Actions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private resetProjectContext(): void {
    this.currentTestSuiteId = ''
    this.selectedFile = null
    this.uploadedFileName = ''
    this.testPlanForm.patchValue({ specDocument: '', name: '' })
  }

  private async loadExistingTestPlanBanner(projectId: string, promptToEdit = false): Promise<void> {
    if (!projectId) {
      this.showExistingBanner = false
      this.existingTestPlan = null
      return
    }
    if (!this.isProjectAccepted(projectId)) {
      this.showExistingBanner = false
      this.existingTestPlan = null
      this.currentTestSuiteId = ''
      return
    }

    try {
      const suites = await firstValueFrom(this.testLabService.getTestSuitesByProject(projectId))
      const suite = suites[0] || null
      if (!suite) {
        this.showExistingBanner = false
        this.existingTestPlan = null
        this.currentTestSuiteId = ''
        return
      }

      this.existingTestPlan = {
        suiteId: String(suite._id || '').trim(),
        name: suite.nametest || suite.nom || 'Unnamed Test Plan',
        specFileName: suite.specFileName || 'No spec document',
      }
      this.showExistingBanner = true

      

if (promptToEdit && !this.suppressExistingProjectModal) {
  this.suppressExistingProjectModal = true // ✅ ANTI DOUBLE

  this.modalService.dismissAll()

  await this.handleExistingProjectTests(projectId, suites)
}


    } catch (error) {
      console.error('Error checking for existing test plan:', error)
      this.showExistingBanner = false
      this.existingTestPlan = null
      this.currentTestSuiteId = ''
    }
  }

  private async handleExistingProjectTests(projectId: string, suites: TestSuiteDto[]): Promise<void> {
    if (!suites.length) return
    const projectTitle = this.selectedProjectTitle || 'this project'
    const action = await this.openProjectTestModeModal(projectTitle, suites.length)
    if (!action) return

    if (action === 'new') {
      this.prepareFreshTestForSelectedProject()
      return
    }

    if (suites.length === 1) {
      await this.loadExistingSuiteForEditing(suites[0])
      return
    }

    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })

    ref.componentInstance.title = 'Choose test to edit'
    ref.componentInstance.message = `This project already has ${suites.length} tests.`
    ref.componentInstance.details = 'Select the test you want to edit manually.'
    ref.componentInstance.confirmText = 'Open'
    ref.componentInstance.cancelText = 'Cancel'
    ref.componentInstance.confirmButtonClass = 'btn-brand'
    ref.componentInstance.icon = 'iconamoon:document-check-duotone'

    ref.componentInstance.selectLabel = `Test for ${projectTitle}`
    ref.componentInstance.selectPlaceholder = '-- Select test --'
    ref.componentInstance.selectOptions = suites.map((suite) => ({
      value: String(suite._id || '').trim(),
      label: this.getSuiteDisplayName(suite),
    }))
    ref.componentInstance.selectedValue = String(suites[0]?._id || '').trim()
    ref.componentInstance.requireSelection = true

    ref.closed.subscribe((result) => {
      const selectedSuiteId = String(result || '').trim()
      if (!selectedSuiteId) return

      const suite = suites.find((item) => String(item?._id || '').trim() === selectedSuiteId)
      if (suite) void this.loadExistingSuiteForEditing(suite)
    })
  }

  private openProjectTestModeModal(
    projectTitle: string,
    existingCount: number
  ): Promise<'new' | 'existing' | null> {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })

    ref.componentInstance.title = 'Existing tests detected'
    ref.componentInstance.message = `This project already has ${existingCount} test(s).`
    ref.componentInstance.details =
      `Choose what you want to do for ${projectTitle}.`
    ref.componentInstance.confirmText = 'Continue'
    ref.componentInstance.cancelText = 'Cancel'
    ref.componentInstance.confirmButtonClass = 'btn-brand'
    ref.componentInstance.icon = 'iconamoon:file-document-duotone'

    ref.componentInstance.selectLabel = 'Action'
    ref.componentInstance.selectPlaceholder = '-- Choose an action --'
    ref.componentInstance.selectOptions = [
      { value: 'new', label: 'Create a new test' },
      { value: 'existing', label: 'Choose an existing test to edit' },
    ]
    ref.componentInstance.selectedValue = 'new'
    ref.componentInstance.requireSelection = true

    return new Promise<'new' | 'existing' | null>((resolve) => {
      ref.closed.subscribe((result) => {
        const value = String(result || '').trim()
        if (value === 'new' || value === 'existing') {
          resolve(value)
          return
        }
        resolve(null)
      })
      ref.dismissed.subscribe(() => resolve(null))
    })
  }
  

private prepareFreshTestForSelectedProject(): void {
  const projectId = String(this.testPlanForm.value.projectId || '').trim()

  this.currentTestSuiteId = ''
  this.errorMessage = ''
  this.generatingPlans = false
  this.regeneratingPlanId = null
  this.generatingCases = false
  this.finishing = false
  this.testPlans = []
  this.testCasesByPlan = {}
  this.currentPlanIndex = -1
  this.planStatuses = {}
  this.plansValidated = false
  this.sessionSaved = false
  this.editingPlanIds = {}
  this.selectedFile = null
  this.uploadedFileName = ''

  // ✅ RESET champ
  this.testPlanForm.patchValue({
    name: '',
    specDocument: '',
    applicationUrl: '',
    projectId,
  })
}



  private async loadExistingSuiteForEditing(suite: TestSuiteDto): Promise<void> {
    const suiteId = String(suite?._id || '').trim()
    if (!suiteId) return

    this.suppressExistingProjectModal = true
    this.currentTestSuiteId = suiteId
    this.resetRoleReviewState()
    this.currentPlanIndex = -1
    this.errorMessage = ''
    this.generatingPlans = false
    this.regeneratingPlanId = null
    this.editingPlanIds = {}
this.testPlanForm.patchValue({
  name: this.getSuiteDisplayName(suite),
  specDocument: suite.specFileName || 'Existing specification',
  applicationUrl: suite.urlCible || '' // ✅ AJOUT
})

this.specText = suite.specText || ''       // ✅ IMPORTANT
this.styleConfig = suite.styleConfig || '' // ✅ BONUS
    this.uploadedFileName = suite.specFileName || ''
    this.selectedFile = null
    this.isEditMode = true

    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(suiteId))
      this.testPlans = Array.isArray(resp?.testPlans) ? resp.testPlans : []
      this.testCasesByPlan = {}
      this.planStatuses = {}
      for (const plan of this.testPlans) {
        this.planStatuses[plan.id] = 'pending'
      }
      for (const row of resp?.validationPlanStatuses || resp?.planStatuses || []) {
        const planId = String(row?.planId || '').trim()
        const status = String(row?.status || '').trim().toLowerCase()
        if (planId) this.planStatuses[planId] = status === 'completed' || status === 'confirmed' ? 'confirmed' : 'pending'
      }
      this.plansValidated = this.allPlansConfirmed
      this.sessionSaved = true
      this.showExistingBanner = false
      await this.loadExistingSpecDocumentIfAvailable(suite)
      this.scrollToPlansResult()
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Unable to load existing test plans')
      this.toastr.error(this.errorMessage, 'Test Plan')
    }
    
  }

  private getSuiteDisplayName(suite: TestSuiteDto): string {
    const userFacing = String(suite?.nametest || '').trim()
    if (userFacing) return userFacing
    const name = String(suite?.nom || '').trim()
    return name || String(suite?._id || 'Unnamed test')
  }

  useExistingData(): void {
    if (this.existingTestPlan) {
      this.currentTestSuiteId = this.existingTestPlan.suiteId
      this.testPlanForm.patchValue({
        specDocument: this.existingTestPlan.specFileName,
      })
      this.uploadedFileName = this.existingTestPlan.specFileName
      this.selectedFile = null
      this.toastr.info(
        'Existing data loaded. Please re-upload the spec document file to generate plans.',
        'Test Plan'
      )
    }
    this.showExistingBanner = false
  }

  declineExistingData(): void {
    this.testPlanForm.patchValue({
      name: '',
      specDocument: ''
    })
    this.uploadedFileName = ''
    this.selectedFile = null
    this.showExistingBanner = false
    this.existingTestPlan = null
    this.currentTestSuiteId = ''
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€â”€ Getters utilitaires â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  get currentPlan(): TestPlanDto | null {
    if (this.currentPlanIndex < 0 || this.currentPlanIndex >= this.testPlans.length) return null
    return this.testPlans[this.currentPlanIndex]
  }

  get currentTestCases(): TestCaseDto[] {
    const plan = this.currentPlan
    if (!plan) return []
    return this.testCasesByPlan[plan.id] || []
  }

  get isLastPlan(): boolean {
    return this.currentPlanIndex === this.testPlans.length - 1
  }

  get allPlansConfirmed(): boolean {
    return (
      this.testPlans.length > 0 &&
      this.testPlans.every((p) => this.planStatuses[p.id] === 'confirmed')
    )
  }

  /** Nombre de plans confirmÃ©s */
  get confirmedCount(): number {
    return this.testPlans.filter((p) => this.planStatuses[p.id] === 'confirmed').length
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // ðŸ”¹ Style config
  onStyleConfigChange(value: string) {
    this.styleConfig = value
  }

  onStyleConfigInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null
    this.onStyleConfigChange(target?.value ?? '')
  }

  // ðŸ”¹ SÃ©lection de fichier
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0] || null
    this.selectedFile = file
    this.uploadedFileName = file?.name || ''
    this.testPlanForm.patchValue({ specDocument: file?.name || '' })
    this.specificationUploaded = false
    this.currentTestSuiteId = ''
    this.testPlans = []
    this.activeResultTab = 'plans'
    this.resetRoleReviewState()
  }

  get canUploadSpecification(): boolean {
    return this.testPlanForm.valid && !!this.selectedFile && !this.uploadingSpecification
  }

  async onUploadSpecification(): Promise<void> {
    this.testPlanForm.markAllAsTouched()
    if (!this.canUploadSpecification || !this.selectedFile) {
      this.toastr.warning('Choose a DOCX file and complete the required fields first.', 'Specification upload')
      return
    }

    this.uploadingSpecification = true
    this.errorMessage = ''
    try {
      const raw = this.testPlanForm.getRawValue()
      const form = new FormData()
      form.append('file', this.selectedFile)
      form.append('projectId', String(raw.projectId || '').trim())
      form.append('nom', this.nameTest.trim())
      form.append('nametest', this.nameTest.trim())
      form.append('urlCible', String(raw.applicationUrl || '').trim())
      form.append('styleConfig', this.styleConfig.trim())

      const response = await firstValueFrom(this.testLabService.ingestSpecification(form))
      this.currentTestSuiteId = String(response?.testSuiteId || '').trim()
      this.specificationUploaded = Boolean(this.currentTestSuiteId)
      this.activeResultTab = 'items'
      this.resetRoleReviewState()
      this.roleReviewOpen = true
      this.pendingRoleReviewCount = Number(response?.pendingReviewCount || 0)
      await this.loadRoleReviews()
      this.toastr.success('Specification uploaded and ready for role review.', 'Specification upload')
    } catch (error: unknown) {
      this.errorMessage = getErrorMessage(error, 'Unable to upload specification.')
      this.toastr.error(this.errorMessage, 'Specification upload')
    } finally {
      this.uploadingSpecification = false
    }
  }

  // ðŸ”¹ Bouton "Generate Plan"
  onGeneratePlan() {
    if (!this.isSelectedProjectAccepted) {
      this.toastr.warning('You must accept this project before generating test plans.', 'Project Access')
      return
    }
    this.testPlanForm.markAllAsTouched()
    if (this.testPlanForm.invalid) {
      this.toastr.warning('Please fill all required fields.', 'Validation')
      return
    }
    if (!this.specificationUploaded || !this.currentTestSuiteId) {
      this.toastr.warning('Upload the specification before generating test plans.', 'Test Plan')
      return
    }
    this.activeResultTab = 'plans'
    void this.generateStoredPlans()
  }

  onRequestStopGeneration(): void {
    if (this.generationGuardModalOpen) return
    if (!this.isGenerationInProgress()) {
      this.toastr.info('No active generation to stop.', 'Generation')
      return
    }
    this.pendingBrowserReload = false
    void this.openGenerationGuardModal()
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.isGenerationInProgress()) return
    event.preventDefault()
    event.returnValue = 'Generation in progress.'
  }

  @HostListener('window:keydown', ['$event'])
  onWindowKeydown(event: KeyboardEvent): void {
    if (!this.isGenerationInProgress()) return
    const key = String(event.key || '').toLowerCase()
    const wantsReload = key === 'f5' || ((event.ctrlKey || event.metaKey) && key === 'r')
    if (!wantsReload) return
    event.preventDefault()
    if (this.generationGuardModalOpen) return
    this.pendingBrowserReload = true
    void this.openGenerationGuardModal()
  }


  canDeactivate(): boolean | Promise<boolean> {
    if (this.allowGenerationNavigation) {
      this.allowGenerationNavigation = false
      return true
    }
    if (!this.isGenerationInProgress()) return true
    return this.openGenerationGuardModal()
  }

  onGenerationGuardYes(): void {
    const shouldReload = this.pendingBrowserReload
    this.pendingBrowserReload = false
    // "Yes" = continue generation, so stay on the current page.
    this.allowGenerationNavigation = false
    this.closeGenerationGuardModal(false)
    if (shouldReload) {
      // Cancel browser reload when user chooses to continue generation.
      return
    }
  }

  async onGenerationGuardNo(): Promise<void> {
    if (this.generationStopping) return
    this.generationStopping = true
    const shouldReload = this.pendingBrowserReload
    try {
      this.pendingBrowserReload = false
      this.allowGenerationNavigation = true
      this.closeGenerationGuardModal(true)
      await this.stopGenerationFlow()
      if (shouldReload) {
        setTimeout(() => window.location.reload(), 0)
      }
    } finally {
      this.generationStopping = false
    }
  }

  onValidatePlans() {
    if (!this.testPlans.length) return
    this.testPlans.forEach((p) => {
      this.planStatuses[p.id] = 'confirmed'
    })
    this.plansValidated = this.allPlansConfirmed
    this.sessionSaved = false
    this.toastr.success('Test plans validated successfully.', 'Validation')
  }

onTogglePlanValidation(planId: string) {
  const current = this.planStatuses[planId] || 'pending'

  this.planStatuses[planId] =
    current === 'confirmed' ? 'pending' : 'confirmed'

  this.plansValidated = this.allPlansConfirmed
  this.sessionSaved = false
}


  openManualAddPlan(): void {
    if (this.generatingPlans || this.finishing || this.regeneratingPlanId) return
    if (!this.isSelectedProjectAccepted) {
      this.toastr.warning('You must accept this project before adding test plans.', 'Project Access')
      return
    }

    const nextNumber = this.testPlans.length + 1
    this.planEditDraft = {
      id: this.buildManualPlanId(),
      title: `Test Plan ${nextNumber}`,
      description: '',
      objective: '',
      scope: '',
      priority: 'Medium',
      requirements: [],
      testCases: [],
      casesCount: 0,
    }
    this.planEditMode = 'add'
    this.setPlanEditModalOpen(true)
  }

  openPlanEditModal(plan: TestPlanDto): void {
    this.planEditDraft = {
      ...plan,
      title: String(plan.title || ''),
      description: String(plan.description || ''),
      objective: String(plan.objective || ''),
      scope: String(plan.scope || ''),
      priority: String(plan.priority || 'Medium'),
    }
    this.planEditMode = 'edit'
    this.setPlanEditModalOpen(true)
  }

  closePlanEditModal(): void {
    this.setPlanEditModalOpen(false)
    this.planEditDraft = null
    this.planEditMode = 'edit'
  }

  private setPlanEditModalOpen(isOpen: boolean): void {
    this.planEditModalOpen = isOpen
    this.document.body.classList.toggle('test-plan-modal-open', isOpen)
  }

  savePlanEditModal(): void {
    if (!this.planEditDraft?.id) return
    const id = this.planEditDraft.id
    if (this.planEditMode === 'add') {
      const newPlan: TestPlanDto = {
        ...this.planEditDraft,
        title: String(this.planEditDraft.title || `Test Plan ${this.testPlans.length + 1}`).trim(),
        description: String(this.planEditDraft.description || '').trim(),
        objective: String(this.planEditDraft.objective || '').trim(),
        scope: String(this.planEditDraft.scope || '').trim(),
        priority: String(this.planEditDraft.priority || 'Medium'),
        requirements: this.planEditDraft.requirements || [],
        testCases: this.planEditDraft.testCases || [],
        casesCount: this.planEditDraft.casesCount || 0,
      }
      this.testPlans = [...this.testPlans, newPlan]
      this.testCasesByPlan[newPlan.id] = this.testCasesByPlan[newPlan.id] || []
      this.planStatuses[newPlan.id] = 'pending'
      this.currentPlanIndex = this.testPlans.length - 1
      this.plansValidated = false
      this.sessionSaved = false
      this.closePlanEditModal()
      this.toastr.success('Test plan added successfully.', 'Test Plan')
      return
    }

    const idx = this.testPlans.findIndex((p) => p.id === id)
    if (idx < 0) return
    this.testPlans = this.testPlans.map((p) =>
      p.id === id
        ? {
            ...p,
            title: String(this.planEditDraft?.title || p.title || ''),
            description: String(this.planEditDraft?.description || p.description || ''),
            objective: String(this.planEditDraft?.objective || p.objective || ''),
            scope: String(this.planEditDraft?.scope || p.scope || ''),
            priority: String(this.planEditDraft?.priority || p.priority || 'Medium'),
          }
        : p
    )
    this.sessionSaved = false
    this.closePlanEditModal()
  }

  onEditPlanField(field: keyof TestPlanDto, value: string): void {
    if (!this.planEditDraft) return
    this.planEditDraft = {
      ...this.planEditDraft,
      [field]: value,
    }
  }

  private buildManualPlanId(): string {
    const usedIds = new Set(this.testPlans.map((plan) => String(plan.id || '').trim()))
    let index = this.testPlans.length + 1
    let id = `TP-${String(index).padStart(3, '0')}`
    while (usedIds.has(id)) {
      index += 1
      id = `TP-${String(index).padStart(3, '0')}`
    }
    return id
  }

  isPlanEditing(planId: string): boolean {
    return Boolean(this.editingPlanIds[String(planId || '').trim()])
  }

  async onAbandonPlan(plan: TestPlanDto): Promise<void> {
    const ref = this.modalService.open(ConfirmModalComponent, {
      centered: true,
      windowClass: 'confirm-modal-window',
      backdropClass: 'confirm-modal-backdrop',
    })

    ref.componentInstance.title = 'Abandon Test Plan'
    ref.componentInstance.message = `Are you sure you want to abandon this test plan?`
    ref.componentInstance.details = `${plan.title || plan.id} will be removed from the current list.`
    ref.componentInstance.confirmText = 'Abandon'
    ref.componentInstance.cancelText = 'Cancel'
    ref.componentInstance.confirmButtonClass = 'btn-brand'
    ref.componentInstance.icon = 'iconamoon:attention-circle-duotone'

    ref.closed.subscribe((result) => {
      if (!result) return
      this.testPlans = this.testPlans.filter((p) => p.id !== plan.id)
      delete this.testCasesByPlan[plan.id]
      delete this.planStatuses[plan.id]
      delete this.editingPlanIds[plan.id]
      this.plansValidated = this.allPlansConfirmed
      this.sessionSaved = false
      if (this.currentPlanIndex >= this.testPlans.length) {
        this.currentPlanIndex = Math.max(0, this.testPlans.length - 1)
      }
    })
  }

get canValidateAndGenerateNextTestCase(): boolean {
  return this.allPlansConfirmed && !this.finishing;
}

// ── 2. Corriger le label (Invalidated → Validate) ─────────────────
getValidateButtonLabel(planId: string): string {
  return this.planStatuses[planId] === 'confirmed'
    ? 'Validated'   // ← affiche l'état, pas une action
    : 'Invalidate';
}

// ── 3. getValidateButtonClass (déjà correct, confirmer) ────────────
getValidateButtonClass(planId: string): string {
  return this.planStatuses[planId] === 'confirmed'
    ? 'testlab-validate-btn--green'
    : 'testlab-validate-btn--orange';
}



  // Remplacer onSaveSession() â€” retourne false si erreur et affiche toastr
  async onSaveSession(): Promise<boolean> {
    if (!this.testPlans.length || !this.currentTestSuiteId) return false
    const hasCasesForAllPlans = this.testPlans.every(
      (p) => (this.testCasesByPlan[p.id] || []).length > 0
    )
    const suiteStatus = hasCasesForAllPlans ? 'completed' : 'incomplete'
    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(this.currentTestSuiteId, {
          sessionKind: 'validation',
          suiteStatus,
          testPlans: this.testPlans,
          planStatuses: this.planStatuses,
        })
      )
      this.sessionSaved = true
      this.toastr.success('Test plan saved successfully.', 'Save')
      return true
    } catch (err: unknown) {
      this.toastr.error(getErrorMessage(err, 'Unable to save test plan'), 'Save')
      return false
    }
  }

  /*async onValidateAndGoToCases() {
    if (!this.testPlans.length) {
      this.toastr.warning('Generate at least one test plan first.', 'Validation')
      return
    }
    if (!this.plansValidated) {
      this.onValidatePlans()
    }
    if (this.currentTestSuiteId && !this.sessionSaved) {
      const saved = await this.onSaveSession()
      if (!saved) {
        this.toastr.warning('Session not saved. Redirecting to test cases anyway.', 'Save')
      }
    }

    this.finishing = true
    try {
      await this.router.navigate(['/test-cases'], {
        queryParams: this.currentTestSuiteId ? { suiteId: this.currentTestSuiteId } : undefined,
        state: { plans: this.testPlans },
      })
    } finally {
      this.finishing = false
    }
  }*/
specText = ''

  async toggleRoleReview(): Promise<void> {
    this.roleReviewOpen = !this.roleReviewOpen
    if (this.roleReviewOpen) await this.loadRoleReviews()
  }

  onRoleReviewSelection(itemId: string, event: Event): void {
    const value = String((event.target as HTMLSelectElement | null)?.value || '')
    this.roleReviewSelections[itemId] = this.roleLabels.includes(value as RoleLabel)
      ? value as RoleLabel
      : ''
  }

  async resolveRoleReview(item: RoleReviewItem): Promise<void> {
    const role = this.roleReviewSelections[item.itemId]
    if (!role || !this.currentTestSuiteId) return

    this.roleReviewBusyItemId = item.itemId
    try {
      const response = await firstValueFrom(this.testLabService.resolveRoleReview(this.currentTestSuiteId, item.itemId, role))
      this.roleReviewItems = this.roleReviewItems.filter((candidate) => candidate.itemId !== item.itemId)
      delete this.roleReviewSelections[item.itemId]
      this.pendingRoleReviewCount = Number(response?.pendingCount || 0)
      this.toastr.success('Role saved for this specification item.', 'Specification review')
    } catch (error: unknown) {
      this.handleRoleReviewError(error)
    } finally {
      this.roleReviewBusyItemId = ''
    }
  }

  async dismissRoleReview(item: RoleReviewItem): Promise<void> {
    if (!this.currentTestSuiteId) return
    const confirmed = this.document.defaultView?.confirm(
      'Dismiss this item from the review queue? It will remain available for audit.'
    ) ?? true
    if (!confirmed) return

    this.roleReviewBusyItemId = item.itemId
    try {
      await firstValueFrom(this.testLabService.dismissRoleReview(this.currentTestSuiteId, item.itemId))
      this.roleReviewItems = this.roleReviewItems.filter((candidate) => candidate.itemId !== item.itemId)
      delete this.roleReviewSelections[item.itemId]
      this.pendingRoleReviewCount = Math.max(0, this.pendingRoleReviewCount - 1)
      this.toastr.success('Item dismissed from the review queue.', 'Specification review')
    } catch (error: unknown) {
      this.handleRoleReviewError(error)
    } finally {
      this.roleReviewBusyItemId = ''
    }
  }

  focusSpecificationUpload(): void {
    this.document.getElementById('specDocument')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async openRoleReviewFromExplorer(): Promise<void> {
    this.roleReviewOpen = true
    await this.loadRoleReviews()
    this.document.getElementById('roleReviewPanel')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private async loadRoleReviews(): Promise<void> {
    if (!this.currentTestSuiteId) return
    this.roleReviewLoading = true
    this.roleReviewError = ''
    this.roleReviewLegacySuite = false
    try {
      const response = await firstValueFrom(this.testLabService.getRoleReviews(this.currentTestSuiteId))
      this.roleReviewItems = Array.isArray(response?.items) ? response.items : []
      this.pendingRoleReviewCount = Number(response?.pendingCount || 0)
      this.roleReviewSelections = Object.fromEntries(
        this.roleReviewItems.map((item) => [item.itemId, ''])
      ) as Record<string, RoleLabel | ''>
    } catch (error: unknown) {
      this.handleRoleReviewError(error)
    } finally {
      this.roleReviewLoading = false
    }
  }

  private handleRoleReviewError(error: unknown): void {
    if (getErrorStatus(error) === 409 && this.errorCode(error) === 'SPEC_NOT_INGESTED') {
      this.roleReviewLegacySuite = true
      this.roleReviewItems = []
      this.pendingRoleReviewCount = 0
      return
    }
    this.roleReviewError = getErrorMessage(error, 'Unable to load the specification review queue.')
    this.toastr.error(this.roleReviewError, 'Specification review')
  }

  private errorCode(error: unknown): string {
    const value = error as { code?: unknown; error?: { code?: unknown } }
    return String(value?.error?.code || value?.code || '').trim()
  }

  private resetRoleReviewState(): void {
    this.roleReviewOpen = false
    this.roleReviewLoading = false
    this.roleReviewBusyItemId = ''
    this.roleReviewItems = []
    this.roleReviewSelections = {}
    this.pendingRoleReviewCount = 0
    this.roleReviewLegacySuite = false
    this.roleReviewError = ''
  }

  // Remplacer onValidateAndGoToCases()
async onValidateAndGoToCases() {
  if (!this.testPlans.length) {
    this.toastr.warning('Generate at least one test plan first.', 'Validation')
    return
  }

  if (!this.allPlansConfirmed) {
    this.toastr.warning('Please validate all test plans to continue.', 'Validation')
    return
  }

  try {

    const fd = new FormData()

    fd.append(
      'projectId',
      this.testPlanForm.value.projectId
    )

    fd.append(
      'name',
      this.nameTest || 'Test Suite'
    )

    fd.append(
      'testPlans',
      JSON.stringify(this.testPlans)
    )

    fd.append(
      'planStatuses',
      JSON.stringify(this.planStatuses)
    )

    fd.append(
      'specText',
      this.specText || ''
    )

    fd.append(
      'urlCible',
      String(this.testPlanForm.value.applicationUrl || '').trim()
    )


    // CREATE ou UPDATE
    if (this.currentTestSuiteId) {

      fd.append(
        'testSuiteId',
        this.currentTestSuiteId
      )

    }


    // fichier optionnel
    if (this.selectedFile) {

      fd.append(
        'file',
        this.selectedFile
      )

      fd.append(
        'fileName',
        this.selectedFile.name
      )
    }


    const response = await firstValueFrom(
      this.testLabService.createSuiteWithPlansForm(fd)
    )

this.currentTestSuiteId = (response as CreateSuiteResponse)?.testSuiteId || this.currentTestSuiteId


    // navigation
    this.finishing = true

    await this.router.navigate(
      ['/test-cases'],
      {
        queryParams: {
          suiteId: this.currentTestSuiteId
        },
        state: {
          plans: this.testPlans
        }
      }
    )


  } catch (err) {

    console.error(
      'SAVE PLANS ERROR:',
      err
    )

    this.toastr.error(
      'Error saving test plans',
      'Error'
    )

  } finally {

    this.finishing = false

  }
}

//ajoute une focntion 

get canGenerateTestPlan(): boolean {
  const state = {
    valid: this.testPlanForm.valid,
    file: !!this.selectedFile,
    projectAccepted: this.isSelectedProjectAccepted,
    generating: this.generatingPlans
  }

  console.log('BTN STATE →', state)

  return (
    state.valid &&
    state.file &&
    state.projectAccepted &&
    !state.generating
  )
}


  // Remplacer onCancelPlans()
  onCancelPlans() {
    // Annule tout sans sauvegarder
    this.errorMessage = ''
    this.generatingPlans = false
    this.generatingCases = false
    this.finishing = false
    this.testPlanForm.patchValue({ name: '' })
    this.uploadedFileName = ''
    this.selectedFile = null
    this.currentTestSuiteId = ''
    this.resetRoleReviewState()
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false
    // Aucune sauvegarde, aucune navigation
  }

  // ðŸ”¹ RÃ©gÃ©nÃ©rer tous les plans depuis le dÃ©but
  // Remplacer onRegeneratePlans()
  onRegeneratePlans() {
    if (!this.isSelectedProjectAccepted) {
      this.toastr.warning('You must accept this project before regenerating test plans.', 'Project Access')
      return
    }
    // RÃ©gÃ©nÃ¨re sans sauvegarder l'Ã©tat actuel
    this.sessionSaved = false
    this.plansValidated = false
    void this.generatePlans(true)
  }

  async onRegeneratePlan(plan: TestPlanDto, index: number) {
  if (!plan?.id || !this.currentTestSuiteId) return
  if (!this.isSelectedProjectAccepted) {
    this.toastr.warning('You must accept this project before editing/regenerating test plans.', 'Project Access')
    return
  }
  this.errorMessage = ''
  this.regeneratingPlanId = plan.id

  try {
    const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    let userId = String(user?.id ?? user?._id ?? '').trim()
    const token = String(user?.token || this.authService.session || '').trim()
    if (!userId && token) userId = this.resolveUserIdFromToken(token)
    if (!userId) {
      this.toastr.error('Session expired. Reconnect and retry.', 'Session')
      return
    }

    const formData = new FormData()
    const requestId = this.newGenerationRequestId('plans')
    this.activePlanGenerationRequestId = requestId
    if (this.selectedFile) formData.append('file', this.selectedFile)
    formData.append('styleConfig', this.styleConfig.trim())
    const applicationUrl = String(this.testPlanForm.getRawValue().applicationUrl || '').trim()
    formData.append('applicationUrl', applicationUrl)
    formData.append('urlCible', applicationUrl)
    formData.append('description', this.styleConfig.trim())
    formData.append('userId', userId)
    formData.append('testSuiteId', this.currentTestSuiteId)
    formData.append(
      'nom',
      `Test Suite - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
    )
    if (this.nameTest.trim()) formData.append('nametest', this.nameTest.trim())
    formData.append('planId', plan.id)
    formData.append('regenerate', 'true')
    formData.append('generationRequestId', requestId)

    const result = await firstValueFrom(
      this.testLabService.generatePlanPreview(formData)
    )

    // ✅ On ne réassigne PAS this.testPlans entièrement
    const nextPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

    if (!nextPlans.length) {
      this.toastr.warning('No regenerated plan returned by backend.', 'Regenerate')
      return
    }

    const bySameId    = nextPlans.find((p) => p.id === plan.id)
    const bySameIndex = nextPlans[index] || null
    const updated     = bySameId || bySameIndex

    if (!updated) {
      this.toastr.warning('Unable to match regenerated plan.', 'Regenerate')
      return
    }

    // ✅ Remplace uniquement le plan à cet index → aucun doublon possible
    this.testPlans = this.testPlans.map((p, i) => (i === index ? updated : p))

    this.planStatuses[updated.id] = 'pending'
    this.sessionSaved = false
    this.plansValidated = false

  } catch (err: unknown) {
    const status = getErrorStatus(err)
    if (status === 502) {
      this.errorMessage = 'Regenerate failed (502 Bad Gateway). Please verify FastAPI/Ollama and retry.'
    } else {
      this.errorMessage = getErrorMessage(err, 'Unable to regenerate this plan')
    }
  } finally {
    this.regeneratingPlanId = null
    this.activePlanGenerationRequestId = ''
  }
}

  /**
   * RÃ©gÃ©nÃ¨re les test cases du plan courant sans avancer.
   */
  async onRegenerateCurrentCases() {
    await this.generateCasesForCurrentPlan(true)
  }

  /**
   * Revenir au plan prÃ©cÃ©dent (pour revoir / modifier).
   */
  onGoToPreviousPlan() {
    if (this.currentPlanIndex > 0) {
      this.currentPlanIndex--
      // Le plan revient en mode "reviewing" pour permettre re-confirmation
      const plan = this.currentPlan
      if (plan) this.planStatuses[plan.id] = 'reviewing'
    }
  }

  /**
   * Supprimer un test case du plan courant.
   */
  onDeleteTestCase(planId: string, testCaseId: string) {
    const list = this.testCasesByPlan[planId] || []
    this.testCasesByPlan[planId] = list.filter((tc) => tc.id !== testCaseId)
  }

  /**
   * Copier les test cases du plan courant dans le presse-papier.
   */
  async onCopyCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return
    const cases = this.testCasesByPlan[plan.id] || []
    const text = this.formatPlanText(plan, cases)
    await navigator.clipboard.writeText(text)
  }

  /**
   * Telecharger les test cases du plan courant.
   */
  onDownloadCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return
    const cases = this.testCasesByPlan[plan.id] || []
    const text = this.formatPlanText(plan, cases)
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${plan.id}-test-cases.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  

  private formatPlanText(plan: TestPlanDto, cases: TestCaseDto[]): string {
    const blocks: string[] = [
      `Test Plan: ${plan.title || plan.id}`,
      plan.description ? `Description: ${plan.description}` : '',
      '',
      ...cases.map((tc) => {
        const steps = (tc.steps || []).map((s) => `- ${s}`).join('\n')
        return `${tc.id} — ${tc.title}\n${steps}\nExpected: ${tc.expected_result}`
      }),
    ]

    return blocks.filter(Boolean).join('\n\n')
  }

  /// Generer les test cases du plan courant
  private async generateCasesForCurrentPlan(regenerate = false) {
    const plan = this.currentPlan
    if (!plan) return

    const currentCaseToken = ++this.casesGenerationToken
    const requestId = this.newGenerationRequestId('cases')
    this.activeCaseGenerationRequestId = requestId
    this.errorMessage = ''
    this.generatingCases = true
    this.planStatuses[plan.id] = 'generating'

    try {
      const resp = await firstValueFrom(
        this.testLabService.generateTestCases({
          testSuiteId: this.currentTestSuiteId,
          planId: plan.id,
          planTitle: plan.title,
          planDescription: plan.description,
          regenerate,
          generationRequestId: requestId,
        })
      )
      if (currentCaseToken !== this.casesGenerationToken) return
      this.testCasesByPlan[plan.id] = resp?.testCases || []
      this.planStatuses[plan.id] = 'reviewing'
    } catch (err: unknown) {
      if (currentCaseToken !== this.casesGenerationToken) return
      this.errorMessage = getErrorMessage(err, 'Erreur génération test cases')
      this.planStatuses[plan.id] = 'pending'
    } finally {
      if (currentCaseToken === this.casesGenerationToken) {
        this.generatingCases = false
        this.activeCaseGenerationRequestId = ''
      }
      


    }
  }

  private async finishAndNavigate() {
    this.finishing = true
    try {
      await this.router.navigate(['/test-cases'], {
        queryParams: { suiteId: this.currentTestSuiteId },
        state: { plans: this.testPlans },
      })
      /*this.toastr.info(
        'Generation des test cases en cours en arriere-plan. Vous pouvez naviguer librement.',
        'AI'
      )*/
    } finally {
      this.finishing = false
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const userLike =
        (decoded?.['user'] as Record<string, unknown>) || decoded || {}
      return String(
        userLike['userId'] || userLike['id'] || userLike['_id'] || userLike['sub'] || ''
      ).trim()
    } catch {
      return ''
    }
  }

  private async generateStoredPlans(regenerate = false): Promise<void> {
    if (!this.currentTestSuiteId) return
    this.generatingPlans = true
    this.errorMessage = ''
    this.testPlans = []
    this.planStatuses = {}
    try {
      const raw = this.testPlanForm.getRawValue()
      const response = await firstValueFrom(this.testLabService.generateStoredPlan(this.currentTestSuiteId, {
        styleConfig: this.styleConfig.trim(),
        urlCible: String(raw.applicationUrl || '').trim(),
        nametest: this.nameTest.trim(),
        regenerate,
      }))
      this.testPlans = Array.isArray(response?.testPlans) ? response.testPlans : []
      this.pendingRoleReviewCount = Number(response?.pendingReviewCount || this.pendingRoleReviewCount)
      for (const plan of this.testPlans) this.planStatuses[plan.id] = 'pending'
      if (!this.testPlans.length) {
        this.toastr.warning('No test plans were generated.', 'Test Plan')
      }
      this.scrollToPlansResult()
    } catch (error: unknown) {
      this.errorMessage = getErrorMessage(error, 'Unable to generate test plans.')
      this.toastr.error(this.errorMessage, 'Test Plan')
    } finally {
      this.generatingPlans = false
    }
  }

  private async generatePlans(regenerate = false) {
  const currentPlanToken = ++this.plansGenerationToken
  const requestId = this.newGenerationRequestId('plans')
  this.errorMessage = ''

  try {
    const rawForm = this.testPlanForm.getRawValue()

    if (!this.isProjectAccepted(String(rawForm.projectId || '').trim())) {
      this.errorMessage = 'You must accept this project before generating test plans.'
      this.toastr.warning(this.errorMessage, 'Project Access')
      return
    }

    this.testPlanForm.markAllAsTouched()
    if (this.testPlanForm.invalid) {
      this.errorMessage = 'Veuillez remplir tous les champs obligatoires.'
      this.toastr.warning(this.errorMessage, 'Validation')
      return
    }

    if (!this.selectedFile) {
      this.errorMessage = 'Veuillez uploader un fichier (.docx / .md / .txt)'
      this.toastr.warning(this.errorMessage, 'Test Plan')
      return
    }

    const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
    let userId = String(user?.id ?? user?._id ?? '').trim()
    const token = String(user?.token || this.authService.session || '').trim()

    if (!userId && token) {
      userId = this.resolveUserIdFromToken(token)
    }

    if (!userId) {
      this.errorMessage = 'Session expirée. Reconnectez-vous.'
      this.toastr.error(this.errorMessage, 'Session')
      return
    }

    this.activePlanGenerationRequestId = requestId
    this.generatingPlans = true
    this.syncProjectIdControlDisabled()
    this.scrollToPlansResult()

    // ✅ reset local
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false

    const formData = new FormData()
    formData.append('file', this.selectedFile)
    formData.append('styleConfig', this.styleConfig.trim())

    const applicationUrl = String(rawForm.applicationUrl || '').trim()
    formData.append('applicationUrl', applicationUrl)
    formData.append('urlCible', applicationUrl)
    formData.append('description', this.styleConfig.trim())
    formData.append('userId', userId)

    formData.append(
      'nom',
      `Test Suite - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
    )

    if (this.nameTest.trim()) {
      formData.append('nametest', this.nameTest.trim())
    }

    // ✅ IMPORTANT: PAS de testSuiteId
    formData.append('projectId', String(rawForm.projectId || '').trim())
    formData.append('regenerate', regenerate ? 'true' : 'false')
    formData.append('generationRequestId', requestId)

    const result = await firstValueFrom(
      this.testLabService.generatePlanPreview(formData)
    )

    if (currentPlanToken !== this.plansGenerationToken) return

    this.currentTestSuiteId = String(result?.testSuiteId || '').trim()
    this.resetRoleReviewState()
    this.pendingRoleReviewCount = Number(result?.pendingReviewCount || 0)

    // ✅ affichage seulement
    this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

    this.testPlans.forEach((p) => {
      this.planStatuses[p.id] = 'pending'
    })

    if (!this.testPlans.length) {
      this.errorMessage = 'Aucun test plan généré.'
      this.toastr.warning(this.errorMessage, 'Test Plan')
    }

    this.scrollToPlansResult()

  } catch (err: unknown) {
    if (currentPlanToken !== this.plansGenerationToken) return

    const status = getErrorStatus(err)

    if (status === 0) {
      this.errorMessage = 'Backend Node.js non accessible'
    } else if (status === 502) {
      this.errorMessage = 'FastAPI non accessible'
    } else if (status === 504) {
      this.errorMessage = 'Timeout AI'
    } else {
      this.errorMessage = getErrorMessage(err, 'Erreur inconnue')
    }

    this.toastr.error(this.errorMessage, 'Generation')

  } finally {
    if (currentPlanToken === this.plansGenerationToken) {
      this.generatingPlans = false
      this.activePlanGenerationRequestId = ''
      this.syncProjectIdControlDisabled()
    }
    

  }

}

  private isGenerationInProgress(): boolean {
    return (
      this.generatingPlans ||
      this.generatingCases ||
      !!this.regeneratingPlanId ||
      !!this.activePlanGenerationRequestId ||
      !!this.activeCaseGenerationRequestId
    )
  }

  private openGenerationGuardModal(): Promise<boolean> {
    this.generationGuardModalOpen = true
    return new Promise<boolean>((resolve) => {
      this.generationGuardResolve = resolve
    })
  }

  private closeGenerationGuardModal(allowed: boolean): void {
    this.generationGuardModalOpen = false
    this.generationGuardResolve?.(allowed)
    this.generationGuardResolve = null
  }

  private async stopGenerationFlow(): Promise<void> {
    const wasGeneratingPlans = this.generatingPlans
    const wasGeneratingCases = this.generatingCases
    const activePlanId = this.currentPlan?.id || ''
    const planRequestId = this.activePlanGenerationRequestId || undefined
    const caseRequestId = this.activeCaseGenerationRequestId || undefined

    // Invalidate running async requests on UI side.
    this.plansGenerationToken++
    this.casesGenerationToken++
    this.generatingPlans = false
    this.generatingCases = false
    this.activePlanGenerationRequestId = ''
    this.activeCaseGenerationRequestId = ''
    if (activePlanId && this.planStatuses[activePlanId] === 'generating') {
      this.planStatuses[activePlanId] = 'pending'
    }
    this.syncProjectIdControlDisabled()

    // Best effort: if backend endpoint exists, request cancellation.
    try {
      await firstValueFrom(
        this.testLabService.cancelGeneration({
          testSuiteId: this.currentTestSuiteId || undefined,
          planId: activePlanId || undefined,
          scope: wasGeneratingPlans && wasGeneratingCases
            ? 'all'
            : wasGeneratingPlans
              ? 'plans'
              : 'cases',
          requestId: wasGeneratingPlans
            ? planRequestId
            : caseRequestId,
        })
      )
      this.toastr.info('Generation stopped.', 'Generation')
    } catch {
      this.toastr.info('Generation stopped on UI. Backend cancellation endpoint unavailable.', 'Generation')
    }
  }

  private newGenerationRequestId(scope: 'plans' | 'cases'): string {
    const rand = Math.random().toString(36).slice(2, 10)
    return `${scope}-${Date.now()}-${rand}`
  }

  private async loadExistingSpecDocumentIfAvailable(suite: TestSuiteDto): Promise<void> {
    const suiteId = String(suite?._id || '').trim()
    if (!suiteId) return

    try {
      const blob = await firstValueFrom(this.testLabService.getSpecDocument(suiteId))
      const fileName = String(suite?.specFileName || 'existing-spec.docx').trim() || 'existing-spec.docx'
      const mime = blob.type || 'application/octet-stream'
      this.selectedFile = new File([blob], fileName, { type: mime })
      this.uploadedFileName = fileName
      this.testPlanForm.patchValue({ specDocument: fileName })
    } catch {
      const specText = String(suite?.specText || '').trim()
      const fileName = String(suite?.specFileName || 'existing-spec.html').trim() || 'existing-spec.html'
      this.uploadedFileName = String(suite?.specFileName || '').trim() || fileName

      if (specText) {
        const mime = fileName.endsWith('.md')
          ? 'text/markdown'
          : fileName.endsWith('.txt')
            ? 'text/plain'
            : 'text/html'
        const content = specText.startsWith('<') ? specText : `<pre>${specText.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch] as string))}</pre>`
        this.selectedFile = new File([content], fileName, { type: mime })
        this.testPlanForm.patchValue({ specDocument: this.uploadedFileName })
        return
      }

      this.selectedFile = null
      if (this.uploadedFileName) {
        this.testPlanForm.patchValue({ specDocument: this.uploadedFileName })
      }
    }
  }

  private syncProjectIdControlDisabled(): void {
    const ctrl = this.testPlanForm.get('projectId')
    if (!ctrl) return

    // Avoid using [disabled] with reactive directives in templates (Angular warns about it).
    const shouldDisable = this.loadingProjects || this.generatingPlans
    if (shouldDisable && ctrl.enabled) ctrl.disable({ emitEvent: false })
    if (!shouldDisable && ctrl.disabled) ctrl.enable({ emitEvent: false })
  }



  private scrollToPlansResult(retries = 6): void {
    const el = this.plansResultRef?.nativeElement
    if (!el) {
      if (retries <= 0) return
      this.zone.runOutsideAngular(() => {
        setTimeout(() => this.scrollToPlansResult(retries - 1), 50)
      })
      return
    }

    this.zone.runOutsideAngular(() => {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 0)
    })
  }

  scrollToTop(): void {
    try {
      const el = typeof document !== 'undefined' ? document.getElementById('top') : null
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch {
      // ignore
    }
  }
private resetFullState(): void {
  const projectId = this.testPlanForm.value.projectId  // ✅ garder

  this.currentTestSuiteId = ''
  this.activeResultTab = 'plans'
  this.resetRoleReviewState()
  this.errorMessage = ''
  this.generatingPlans = false
  this.regeneratingPlanId = null
  this.generatingCases = false
  this.finishing = false

  this.testPlans = []
  this.testCasesByPlan = {}
  this.currentPlanIndex = -1
  this.planStatuses = {}

  this.plansValidated = false
  this.sessionSaved = false
  this.editingPlanIds = {}

  this.selectedFile = null
  this.uploadedFileName = ''

  this.specText = ''
  this.styleConfig = ''

  // ✅ garder projectId !
  this.testPlanForm.patchValue({
    projectId,          // ✅ IMPORTANT
    name: '',
    specDocument: '',
    applicationUrl: '',
  })
}


onProjectClick(): void {
  const projectId = String(this.testPlanForm.value.projectId || '').trim()

  if (!projectId) return

  // ✅ seulement reset (PAS modal ici)
  this.resetFullState()

  // ✅ IMPORTANT
  this.suppressExistingProjectModal = false

  
 //✅ IMPORTANT FIX 🔥
  this.lastProjectId = ''   // ✅ FORCER nouveau changement

  // ✅ FORCER RESELECTION
  this.testPlanForm.patchValue({ projectId: '' })

  setTimeout(() => {
    this.testPlanForm.patchValue({ projectId })
  })
}

onApplicationUrlInput(event: Event): void {
  const input = event.target as HTMLInputElement
  let value = input.value || ''

  // ✅ supprimer http/https si ajouté
  value = value.replace(/^https?:\/\//, '')

  this.testPlanForm.patchValue({
    applicationUrl: value
  }, { emitEvent: false })
}

async onConfirmCurrentPlan(): Promise<void> {
  const plan = this.currentPlan
  if (!plan) return

  this.planStatuses[plan.id] = 'confirmed'
  this.sessionSaved = false
  this.plansValidated = this.allPlansConfirmed

  if (this.isLastPlan) {
    await this.finishAndNavigate()
    return
  }

  this.currentPlanIndex++
  const nextPlan = this.currentPlan
  if (nextPlan && !(this.testCasesByPlan[nextPlan.id]?.length)) {
    await this.generateCasesForCurrentPlan(false)
  }
}
getApplicationUrlErrorMessage(): string {
  const control = this.testPlanForm.get('applicationUrl')
  if (!control || !control.errors) return ''

  if (control.errors['pattern']) {
    return 'Enter a valid URL, e.g. your-app.com/path (without http:// or https://).'
  }

  return 'Invalid application URL.'
}

}
