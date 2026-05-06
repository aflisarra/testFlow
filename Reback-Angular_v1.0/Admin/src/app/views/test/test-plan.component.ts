import { AdminManagementService } from '@/app/core/services/admin-management.service'
import type { AppProject } from '@/app/interfaces/admin-management.interface'
import { AuthenticationService } from '@/app/core/services/auth.service'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
} from '@/app/core/services/testlab.service'
import { ProjectsRefreshService } from '@/app/core/services/projects-refresh.service'
import { ProjectsStateService } from '@/app/core/services/projects-state.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import type { PlanStatus } from '@/app/views/test/models/status.types'
import { getErrorMessage, getErrorStatus } from '@/app/views/test/utils/error.utils'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, DestroyRef, ElementRef, inject, NgZone, ViewChild } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { ActivatedRoute, Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { ToastrService } from 'ngx-toastr'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'

// Statuts possibles pour chaque plan dans le flux sÃ©quentiel
@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './test-plan.component.html',
  styleUrl: './test-plan.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteConfigurationComponent {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)
  private adminManagementService = inject(AdminManagementService)
  private projectsRefresh = inject(ProjectsRefreshService)
  private projectsState = inject(ProjectsStateService)
  private router = inject(Router)
  private activatedRoute = inject(ActivatedRoute)
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
    specDocument: [''],
    projectId: ['', Validators.required],
  })

  // Banner for existing test plan
  showExistingBanner = false
  existingTestPlan: { suiteId: string; name: string; specFileName: string } | null = null

  styleConfig = ''
  uploadedFileName = ''
  selectedFile: File | null = null

  generatingPlans = false
  regeneratingPlanId: string | null = null
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}

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
      const projectName = String(params['projectName'] || '').trim()

      if (!projectId) return

      this.testPlanForm.patchValue({ projectId })
      this.lastProjectId = projectId

      // Default name if empty, then show existing banner (user decides to use it or not)
      if (projectName && !String(this.testPlanForm.get('name')?.value || '').trim()) {
        this.testPlanForm.patchValue({ name: `${projectName} Test Suite` })
      }

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

      // If project changed, reset file + suite context to avoid mixing projects
      if (this.lastProjectId && normalizedProjectId !== this.lastProjectId) {
        this.resetProjectContext()
      }
      this.lastProjectId = normalizedProjectId

      // Default name if empty
      const title = this.selectedProjectTitle
      if (title && !String(this.testPlanForm.get('name')?.value || '').trim()) {
        this.testPlanForm.patchValue({ name: `${title} Test Suite` })
      }

      await this.loadExistingTestPlanBanner(normalizedProjectId)
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
    this.testPlanForm.patchValue({ specDocument: '' })
    // Keep "name" as-is; caller may set a new default name for the new project
  }

  private async loadExistingTestPlanBanner(projectId: string): Promise<void> {
    if (!projectId) {
      this.showExistingBanner = false
      this.existingTestPlan = null
      return
    }

    try {
      const suite = await firstValueFrom(this.testLabService.getTestPlanByProject(projectId))
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
    } catch (error) {
      console.error('Error checking for existing test plan:', error)
      this.showExistingBanner = false
      this.existingTestPlan = null
      this.currentTestSuiteId = ''
    }
  }

  useExistingData(): void {
    if (this.existingTestPlan) {
      this.currentTestSuiteId = this.existingTestPlan.suiteId
      this.testPlanForm.patchValue({
        name: this.existingTestPlan.name,
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
    const title = this.selectedProjectTitle
    this.testPlanForm.patchValue({
      name: title ? `${title} Test Suite` : '',
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
  }

  // ðŸ”¹ Bouton "Generate Plan"
  onGeneratePlan() {
    const hasProject = Boolean(String(this.testPlanForm.getRawValue().projectId || '').trim())
    const hasFile = Boolean(this.selectedFile)
    void this.generatePlans()
    if (hasProject && hasFile) this.scrollToPlansResult()
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
    const current = this.planStatuses[planId]
    if (current !== 'pending' && current !== 'confirmed') return

    this.planStatuses[planId] = current === 'confirmed' ? 'pending' : 'confirmed'
    this.plansValidated = this.allPlansConfirmed
    this.sessionSaved = false
  }

  // Remplacer onSaveSession() â€” retourne false si erreur et affiche toastr
  async onSaveSession(): Promise<boolean> {
    if (!this.testPlans.length || !this.currentTestSuiteId) return false
    const suiteStatus = this.allPlansConfirmed ? 'validated' : 'invalid'
    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(this.currentTestSuiteId, {
          sessionKind: 'validation',
          suiteStatus,
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
    // RÃ©gÃ©nÃ¨re sans sauvegarder l'Ã©tat actuel
    this.sessionSaved = false
    this.plansValidated = false
    void this.generatePlans(true)
  }

  async onRegeneratePlan(plan: TestPlanDto, index: number) {
    if (!plan?.id || !this.currentTestSuiteId) return
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
      if (this.selectedFile) formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
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
      this.planStatuses[updated.id] = 'pending'
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

    this.planStatuses[plan.id] = 'confirmed'

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
        })
      )
      this.testCasesByPlan[plan.id] = resp?.testCases || []
      this.planStatuses[plan.id] = 'reviewing'
    } catch (err: unknown) {
      this.errorMessage = getErrorMessage(err, 'Erreur génération test cases')
      this.planStatuses[plan.id] = 'pending'
    } finally {
      this.generatingCases = false
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
    this.errorMessage = ''
    this.generatingPlans = true
    this.syncProjectIdControlDisabled()
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false

    try {
      const rawForm = this.testPlanForm.getRawValue()
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

      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
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

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))

      this.currentTestSuiteId = String(result?.testSuiteId || '')
      if (String(result?.projectId || '').trim()) {
        this.testPlanForm.patchValue({ projectId: String(result?.projectId || '') })
      }
      this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

      // Initialiser tous les plans A "pending"
      this.testPlans.forEach((p) => (this.planStatuses[p.id] = 'pending'))

      if (!this.testPlans.length) {
        this.errorMessage = 'Aucun test plan gÃ©nÃ©rÃ©.'
        this.toastr.warning(this.errorMessage, 'Test Plan')
      } else {
        //TODO: afficher un message "Plans generated, generating test cases..." et ne pas scroll si on vient de cliquer sur "Regenerate" d'un plan (car dans ce cas on reste sur le mÃªme plan et on veut voir les changements)
      }
    } catch (err: unknown) {
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
      this.generatingPlans = false
      this.syncProjectIdControlDisabled()
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
