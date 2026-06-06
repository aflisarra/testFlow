import { AdminManagementService } from '@/app/core/services/admin-management.service'
import type { AppProject } from '@/app/interfaces/admin-management.interface'
import { AuthenticationService } from '@/app/core/services/auth.service'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'
import { ConfirmModalComponent } from '@/app/views/admin/shared/confirm-modal.component'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { CanDeactivateComponent } from '@/app/interfaces/route-guards.interface'
import type { PlanStatus } from '@/app/views/test/models/status.types'
import { getErrorMessage, getErrorStatus } from '@/app/views/test/utils/error.utils'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, ElementRef, HostListener, inject, NgZone, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { NgbModal, NgbModalModule } from '@ng-bootstrap/ng-bootstrap'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'

// Statuts possibles pour chaque plan dans le flux sÃ©quentiel
@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule],
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

  @ViewChild('plansResult') private plansResultRef?: ElementRef<HTMLElement>

  projects: AppProject[] = []
  loadingProjects = false
  private lastProjectId = ''

  // Reactive Form
  testPlanForm: FormGroup = this.fb.group({
    name: ['', Validators.required],
    specDocument: ['', Validators.required],
    projectId: ['', Validators.required],
    applicationUrl: ['', [Validators.required, TestSuiteConfigurationComponent.applicationUrlValidator]],
  })

  private static applicationUrlValidator(control: AbstractControl): ValidationErrors | null {
    const value = String(control.value || '').trim()
    if (!value) return null
    if (/^https?:\/\//i.test(value)) return { protocolIncluded: true }
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?::\d{2,5})?(?:\/[^\s]*)?$/i.test(value)) {
      return { invalidUrl: true }
    }
    return null
  }

  getApplicationUrlErrorMessage(): string {
    const control = this.testPlanForm.get('applicationUrl')
    if (!control?.touched || !control.errors) return ''
    if (control.errors['required']) return 'Application URL is required.'
    if (control.errors['protocolIncluded']) return 'https:// already exists. Enter only the domain and path.'
    if (control.errors['invalidUrl']) return 'Enter a valid application URL, for example your-app.com/path.'
    return 'Application URL is invalid.'
  }

  private getNormalizedApplicationUrl(value: unknown): string {
    const raw = String(value || '').trim().replace(/^\/+/, '')
    return raw ? `https://${raw}` : ''
  }

  // Banner for existing test plan
  showExistingBanner = false
  existingTestPlan: { suiteId: string; name: string; specFileName: string } | null = null
  private suppressExistingProjectModal = false

  styleConfig = ''
  uploadedFileName = ''
  selectedFile: File | null = null
  private initialGenerationState: {
    projectId: string
    name: string
    applicationUrl: string
    styleConfig: string
    specDocument: string
    selectedFileName: string
  } | null = null

  generatingPlans = false
  regeneratingPlanId: string | null = null
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}
  editingPlanIds: Record<string, boolean> = {}

  // â”€â”€â”€ Flux sÃ©quentiel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /** Index du plan actuellement affichÃ©/traitÃ© (0-based). -1 = pas encore dÃ©marrÃ© */
  currentPlanIndex = -1

  /** Statut de chaque plan : pending â†’ generating â†’ reviewing â†’ confirmed */
  planStatuses: Record<string, PlanStatus> = {}

  /** True pendant la gÃ©nÃ©ration des test cases du plan courant */
  generatingCases = false

  /** True pendant la navigation finale vers /test-cases */
  finishing = false
  plansValidated = false
  sessionSaved = false
  generationGuardModalOpen = false
  generationStopping = false
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

  get canGenerateTestPlan(): boolean {
    if (this.generatingPlans || !this.isSelectedProjectAccepted) return false
    if (this.testPlanForm.invalid) return false

    if (!this.initialGenerationState) {
      return !!this.selectedFile
    }

    return this.hasGenerationInputsChanged()
  }

  onNameTestChange(value: string): void {
    this.testPlanForm.patchValue({ name: String(value || '') })
  }

  onNameTestInput(event: Event): void {
    const target = event.target as HTMLInputElement | null
    this.onNameTestChange(target?.value ?? '')
  }

  constructor() {
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
    const projectId = this.testPlanForm.value.projectId
    if (!projectId) {
      this.lastProjectId = ''
      this.showExistingBanner = false
      this.existingTestPlan = null
      this.currentTestSuiteId = ''
      return
    }

    try {
      const normalizedProjectId = String(projectId || '').trim()
      if (!this.isProjectAccepted(normalizedProjectId)) {
        this.showExistingBanner = false
        this.existingTestPlan = null
        this.currentTestSuiteId = ''
        this.toastr.warning('You must accept this project before accessing its tests.', 'Project Access')
        return
      }

      // If project changed, reset file + suite context to avoid mixing projects
      if (this.lastProjectId && normalizedProjectId !== this.lastProjectId) {
        this.resetProjectContext()
      }
      this.lastProjectId = normalizedProjectId

      await this.loadExistingTestPlanBanner(normalizedProjectId, true)
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
    this.clearInitialGenerationState()
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
    ref.componentInstance.icon = 'iconamoon:document-check-duotone'

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
    this.testPlanForm.patchValue({
      name: '',
      specDocument: '',
      projectId,
    })
    this.clearInitialGenerationState()
  }

  private async loadExistingSuiteForEditing(suite: TestSuiteDto): Promise<void> {
    const suiteId = String(suite?._id || '').trim()
    if (!suiteId) return

    this.suppressExistingProjectModal = true
    this.currentTestSuiteId = suiteId
    this.currentPlanIndex = -1
    this.errorMessage = ''
    this.generatingPlans = false
    this.regeneratingPlanId = null
    this.editingPlanIds = {}
    this.testPlanForm.patchValue({
      name: this.getSuiteDisplayName(suite),
      specDocument: suite.specFileName || 'Existing specification',
      applicationUrl: this.getNormalizedApplicationUrl(suite.urlCible || ''),
    })
    this.uploadedFileName = suite.specFileName || ''
    this.selectedFile = null
    this.styleConfig = String(suite.description || '').trim()

    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(suiteId))
      this.testPlans = Array.isArray(resp?.testPlans) ? resp.testPlans : []
      this.testCasesByPlan = {}
      this.planStatuses = {}
      for (const plan of this.testPlans) {
        if (Array.isArray(plan.testCases)) this.testCasesByPlan[plan.id] = plan.testCases
        this.planStatuses[String(plan.id || '').trim()] = 'pending'
      }
      for (const row of resp?.testCasesByPlan || []) {
        const planId = String(row?.planId || '').trim()
        if (planId) this.testCasesByPlan[planId] = Array.isArray(row.testCases) ? row.testCases : []
      }
      const storedStatuses = Array.isArray(resp?.validationPlanStatuses)
        ? resp.validationPlanStatuses
        : (Array.isArray(resp?.planStatuses) ? resp.planStatuses : [])
      for (const row of storedStatuses) {
        const planId = String(row?.planId || '').trim()
        const status = String(row?.status || '').trim().toLowerCase()
        if (planId) {
          this.planStatuses[planId] =
            status === 'completed' || status === 'confirmed' ? 'confirmed' : 'pending'
        }
      }
      this.plansValidated = this.allPlansConfirmed
      this.sessionSaved = true
      this.showExistingBanner = false
      await this.loadExistingSpecDocumentIfAvailable(suite)
      this.captureInitialGenerationState()
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
    this.captureInitialGenerationState()
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
    this.clearInitialGenerationState()
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
      this.testPlans.every((p) => this.planStatuses[String(p.id || '').trim()] === 'confirmed')
    )
  }

  get canValidateAndGenerateNextTestCase(): boolean {
    return this.areAllPlansConfirmed()
  }

  private areAllPlansConfirmed(): boolean {
    return (
      this.testPlans.length > 0 &&
      this.testPlans.every((p) => this.planStatuses[String(p.id || '').trim()] === 'confirmed')
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
    void this.generatePlans()
  }

  private captureInitialGenerationState(): void {
    const raw = this.testPlanForm.getRawValue()
    this.initialGenerationState = {
      projectId: String(raw.projectId || '').trim(),
      name: String(raw.name || '').trim(),
      applicationUrl: this.getNormalizedApplicationUrl(raw.applicationUrl),
      styleConfig: String(this.styleConfig || '').trim(),
      specDocument: String(raw.specDocument || '').trim(),
      selectedFileName: String(this.selectedFile?.name || this.uploadedFileName || '').trim(),
    }
  }

  private clearInitialGenerationState(): void {
    this.initialGenerationState = null
  }

  private hasGenerationInputsChanged(): boolean {
    const raw = this.testPlanForm.getRawValue()
    const current = {
      projectId: String(raw.projectId || '').trim(),
      name: String(raw.name || '').trim(),
      applicationUrl: this.getNormalizedApplicationUrl(raw.applicationUrl),
      styleConfig: String(this.styleConfig || '').trim(),
      specDocument: String(raw.specDocument || '').trim(),
      selectedFileName: String(this.selectedFile?.name || this.uploadedFileName || '').trim(),
    }

    return (
      current.projectId !== this.initialGenerationState?.projectId ||
      current.name !== this.initialGenerationState?.name ||
      current.applicationUrl !== this.initialGenerationState?.applicationUrl ||
      current.styleConfig !== this.initialGenerationState?.styleConfig ||
      current.specDocument !== this.initialGenerationState?.specDocument ||
      current.selectedFileName !== this.initialGenerationState?.selectedFileName
    )
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
      await this.stopGenerationFlow()
      this.pendingBrowserReload = false
      this.allowGenerationNavigation = true
      this.closeGenerationGuardModal(true)
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
      this.planStatuses[String(p.id || '').trim()] = 'confirmed'
    })
    this.plansValidated = this.allPlansConfirmed
    this.sessionSaved = false
    this.toastr.success('Test plans validated successfully.', 'Validation')
  }

  onTogglePlanValidation(planId: string) {
    const id = String(planId || '').trim()
    if (!id) return
    const current = this.planStatuses[id]
    this.planStatuses[id] = current === 'confirmed' ? 'pending' : 'confirmed'
    this.plansValidated = this.allPlansConfirmed
    this.sessionSaved = false
  }

  onToggleManualPlanEdit(planId: string): void {
    const id = String(planId || '').trim()
    if (!id) return
    this.editingPlanIds[id] = !this.editingPlanIds[id]
  }

  isPlanEditing(planId: string): boolean {
    return Boolean(this.editingPlanIds[String(planId || '').trim()])
  }

  onPlanTitleInput(plan: TestPlanDto, event: Event): void {
    plan.title = (event.target as HTMLInputElement | null)?.value ?? ''
    this.sessionSaved = false
  }

  onPlanDescriptionInput(plan: TestPlanDto, event: Event): void {
    plan.description = (event.target as HTMLTextAreaElement | null)?.value ?? ''
    this.sessionSaved = false
  }

  getValidateButtonClass(planId: string): string {
    const current = this.planStatuses[String(planId || '').trim()]
    if (current === 'confirmed') return 'testlab-validate-btn--green'
    return 'testlab-validate-btn--orange'
  }

  getValidateButtonLabel(planId: string): string {
    const current = this.planStatuses[String(planId || '').trim()]
    if (current === 'confirmed') return 'Valid'
    return 'Invalid'
  }

  // Remplacer onSaveSession() â€” retourne false si erreur et affiche toastr
  async onSaveSession(): Promise<boolean> {
    if (!this.testPlans.length || !this.currentTestSuiteId) return false
    const hasCasesForAllPlans = this.testPlans.every(
      (p) => (this.testCasesByPlan[p.id] || []).length > 0
    )
    const suiteStatus = hasCasesForAllPlans ? 'completed' : 'incomplete'
    const testCasesByPlan = this.testPlans
      .filter((plan) => Object.prototype.hasOwnProperty.call(this.testCasesByPlan, plan.id))
      .map((plan) => ({
        planId: plan.id,
        planTitle: plan.title,
        testCases: this.testCasesByPlan[plan.id] || [],
      }))
    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(this.currentTestSuiteId, {
          sessionKind: 'validation',
          suiteStatus,
          testPlans: this.testPlans,
          planStatuses: this.planStatuses,
          testCasesByPlan,
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

  // Remplacer onValidateAndGoToCases()
  async onValidateAndGoToCases() {
    if (!this.testPlans.length) {
      this.toastr.warning('Generate at least one test plan first.', 'Validation')
      return
    }

    if (!this.areAllPlansConfirmed()) {
      this.toastr.warning('Please validate all test plans to continue.', 'Validation')
      return
    }

    // Sauvegarder obligatoirement
    if (this.currentTestSuiteId) {
      const saved = await this.onSaveSession()
      if (!saved) {
        this.toastr.warning('Unable to save session. Redirecting to test cases anyway.', 'Save')
      }
    }

    // Naviguer vers /test-cases
    this.finishing = true
    try {
      await this.router.navigate(['/test-cases'], {
        queryParams: this.currentTestSuiteId ? { suiteId: this.currentTestSuiteId } : undefined,
        state: { plans: this.testPlans },
      })
    } finally {
      this.finishing = false
    }
  }
  // ðŸ”¹ Annuler / reset complet
  /*onCancelPlans() {
    this.errorMessage = ''
    this.generatingPlans = false
    this.generatingCases = false
    this.finishing = false
    this.nameTest = ''

    this.currentTestSuiteId = ''
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false
  }*/
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
      const applicationUrl = this.getNormalizedApplicationUrl(this.testPlanForm.getRawValue().applicationUrl)
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

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
      const nextPlans = Array.isArray(result?.testPlans) ? result.testPlans : []
      if (!nextPlans.length) {
        this.toastr.warning('No regenerated plan returned by backend.', 'Regenerate')
        return
      }

      const bySameId = nextPlans.find((p) => p.id === plan.id)
      const bySameIndex = nextPlans[index] || null
      const updated = bySameId || bySameIndex
      if (!updated) {
        this.toastr.warning('Unable to match regenerated plan.', 'Regenerate')
        return
      }

      this.testPlans[index] = updated
      this.planStatuses[String(updated.id || '').trim()] = 'pending'
      this.sessionSaved = false
      this.plansValidated = false
    } catch (err: unknown) {
      const status = getErrorStatus(err)
      if (status === 502) {
        this.errorMessage =
          'Regenerate failed (502 Bad Gateway). Please verify FastAPI/Ollama and retry.'
      } else {
        this.errorMessage = getErrorMessage(err, 'Unable to regenerate this plan')
      }
    } finally {
      this.regeneratingPlanId = null
      this.activePlanGenerationRequestId = ''
    }
  }

  // â”€â”€â”€ Flux sÃ©quentiel â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  /**
   * DÃ©marre le flux : gÃ©nÃ¨re les test cases du premier plan.
   * AppelÃ© depuis "Confirm" sur la liste des plans.
   */
  async onStartSequentialFlow() {
    await this.onValidateAndGoToCases()
  }

  /**
   * L'utilisateur confirme les test cases du plan courant.
   * â†’ marque le plan "confirmed" puis passe au suivant.
   */
  async onConfirmCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return

    this.planStatuses[String(plan.id || '').trim()] = 'confirmed'

    if (this.isLastPlan) {
      // Tous les plans sont confirmÃ©s â†’ naviguer
      await this.finishAndNavigate()
    } else {
      // Passer au plan suivant et gÃ©nÃ©rer ses test cases
      this.currentPlanIndex++
      await this.generateCasesForCurrentPlan()
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
      if (plan) this.planStatuses[String(plan.id || '').trim()] = 'reviewing'
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
   * TÃ©lÃ©charger les test cases du plan courant.
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

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // â”€â”€â”€ PrivÃ© â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  private async generateCasesForCurrentPlan(regenerate = false) {
    const plan = this.currentPlan
    if (!plan) return

    const currentCaseToken = ++this.casesGenerationToken
    const requestId = this.newGenerationRequestId('cases')
    this.activeCaseGenerationRequestId = requestId
    this.errorMessage = ''
    this.generatingCases = true
    this.planStatuses[String(plan.id || '').trim()] = 'generating'

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
      this.planStatuses[String(plan.id || '').trim()] = 'reviewing'
    } catch (err: unknown) {
      if (currentCaseToken !== this.casesGenerationToken) return
      this.errorMessage = getErrorMessage(err, 'Erreur génération test cases')
      this.planStatuses[String(plan.id || '').trim()] = 'pending'
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

      if (!String(rawForm.projectId || '').trim()) {
        this.errorMessage = 'Veuillez choisir un projet.'
        this.toastr.warning(this.errorMessage, 'Projet')
        return
      }

      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String(user?.id ?? user?._id ?? '').trim()
      const token = String(user?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.errorMessage = 'Session expirÃ©e. Reconnectez-vous.'
        this.toastr.error(this.errorMessage, 'Session')
        return
      }

      this.activePlanGenerationRequestId = requestId
      this.generatingPlans = true
      this.syncProjectIdControlDisabled()
      this.testPlans = []
      this.testCasesByPlan = {}
      this.currentPlanIndex = -1
      this.planStatuses = {}
      this.plansValidated = false
      this.sessionSaved = false

      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
      const applicationUrl = this.getNormalizedApplicationUrl(rawForm.applicationUrl)
      formData.append('applicationUrl', applicationUrl)
      formData.append('urlCible', applicationUrl)
      formData.append('description', this.styleConfig.trim())
      formData.append('userId', userId)
      formData.append(
        'nom',
        `Test Suite - ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
      )
      if (this.nameTest.trim()) formData.append('nametest', this.nameTest.trim())
      if (this.currentTestSuiteId) formData.append('testSuiteId', this.currentTestSuiteId)
      formData.append('projectId', String(rawForm.projectId || '').trim())
      formData.append('regenerate', regenerate ? 'true' : 'false')
      formData.append('generationRequestId', requestId)

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))
      if (currentPlanToken !== this.plansGenerationToken) return

      this.currentTestSuiteId = String(result?.testSuiteId || '')
      if (String(result?.projectId || '').trim()) {
        this.testPlanForm.patchValue({ projectId: String(result?.projectId || '') })
      }
      this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

      // Initialiser tous les plans en "pending" pour afficher l'état invalide par défaut.
      this.testPlans.forEach((p) => (this.planStatuses[String(p.id || '').trim()] = 'pending'))

      if (!this.testPlans.length) {
        this.errorMessage = 'Aucun test plan gÃ©nÃ©rÃ©.'
        this.toastr.warning(this.errorMessage, 'Test Plan')
      } else {
        //TODO: afficher un message "Plans generated, generating test cases..." et ne pas scroll si on vient de cliquer sur "Regenerate" d'un plan (car dans ce cas on reste sur le mÃªme plan et on veut voir les changements)
      }
    } catch (err: unknown) {
      if (currentPlanToken !== this.plansGenerationToken) return
      const status = getErrorStatus(err)
      if (status === 0) {
        this.errorMessage =
          'Backend Node.js non accessible â€” vÃ©rifier que le serveur tourne sur port 3000'
      } else if (status === 502) {
        this.errorMessage =
          'FastAPI non accessible â€” vÃ©rifier que uvicorn tourne sur port 8000'
      } else if (status === 504) {
        this.errorMessage = 'Ollama timeout â€” essayer avec un fichier plus petit'
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
      // Keep existing behavior when backend has only metadata but no physical file.
      this.selectedFile = null
      this.uploadedFileName = String(suite?.specFileName || '').trim()
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



}
