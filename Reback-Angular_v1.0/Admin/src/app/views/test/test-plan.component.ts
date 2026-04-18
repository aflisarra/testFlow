import { AuthenticationService } from '@/app/core/services/auth.service'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
} from '@/app/core/services/testlab.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { ToastrService } from 'ngx-toastr'

// Possible statuses for each plan in the sequential flow
export type PlanStatus = 'pending' | 'generating' | 'reviewing' | 'confirmed'

@Component({
  selector: 'app-test-suite-configuration',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-plan.component.html',
  styleUrl: './test-plan.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestSuiteConfigurationComponent {
  private store = inject(Store)
  private testLabService = inject(TestLabService)
  private authService = inject(AuthenticationService)
  private router = inject(Router)
  private toastr = inject(ToastrService)

  styleConfig = ''
  nameTest = ''
  uploadedFileName = ''
  selectedFile: File | null = null

  generatingPlans = false
  errorMessage = ''

  currentTestSuiteId = ''
  testPlans: TestPlanDto[] = []
  testCasesByPlan: Record<string, TestCaseDto[]> = {}

  // Sequential flow
  /** Index of plan currently displayed/processed (0-based). -1 = not started yet */
  currentPlanIndex = -1

  /** Status of each plan: pending → generating → reviewing → confirmed */
  planStatuses: Record<string, PlanStatus> = {}

  /** True while generating test cases for current plan */
  generatingCases = false

  /** True during final navigation to /test-cases */
  finishing = false
  plansValidated = false
  sessionSaved = false

  // ──────────────────────────────────────────────────────────────────────────

  // ─── Getters utilitaires ──────────────────────────────────────────────────

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

  /** Number of confirmed plans */
  get confirmedCount(): number {
    return this.testPlans.filter((p) => this.planStatuses[p.id] === 'confirmed').length
  }

  // ──────────────────────────────────────────────────────────────────────────

  // 🔹 Style config
  onStyleConfigChange(value: string) {
    this.styleConfig = value
  }

  onNameTestChange(value: string) {
    this.nameTest = value
  }

  // File selection
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement | null
    const file = input?.files?.[0] || null
    this.selectedFile = file
    this.uploadedFileName = file?.name || ''
  }

  // Generate Plan button
  onGeneratePlan() {
    void this.generatePlans()
  }

  onValidatePlans() {
    if (!this.testPlans.length) return
    this.testPlans.forEach((p) => {
      this.planStatuses[p.id] = 'confirmed'
    })
    this.plansValidated = true
    this.toastr.success('Test plans validated successfully.', 'Validation')
  }

  // Save session - returns false if error and shows toastr
  async onSaveSession(): Promise<boolean> {
    if (!this.testPlans.length || !this.currentTestSuiteId) return false
    const suiteStatus = this.allPlansConfirmed ? 'complete' : 'incomplete'
    try {
      await firstValueFrom(
        this.testLabService.saveSuiteSession(this.currentTestSuiteId, {
          suiteStatus,
          planStatuses: this.planStatuses,
        })
      )
      this.sessionSaved = true
      this.toastr.success('Test plan saved successfully.', 'Save')
      return true
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to save test plan', 'Save')
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

  // Replace onValidateAndGoToCases()
  async onValidateAndGoToCases() {
    if (!this.testPlans.length) {
      this.toastr.warning('Generate at least one test plan first.', 'Validation')
      return
    }

    // Validate all plans
    this.onValidatePlans()

    // Save required
    if (this.currentTestSuiteId) {
      const saved = await this.onSaveSession()
      if (!saved) return  // block navigation if save fails
    }

    // Navigate to /test-cases
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
  // Cancel / reset
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
  // Replace onCancelPlans()
  onCancelPlans() {
    // Cancel everything without saving
    this.errorMessage = ''
    this.generatingPlans = false
    this.generatingCases = false
    this.finishing = false
    this.nameTest = ''
    this.uploadedFileName = ''
    this.selectedFile = null
    this.currentTestSuiteId = ''
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false
    // No save, no navigation
  }

  // Regenerate all plans from the beginning
  // Replace onRegeneratePlans()
  onRegeneratePlans() {
    // Regenerate without saving current state
    this.sessionSaved = false
    this.plansValidated = false
    void this.generatePlans(true)
  }

  async onRegeneratePlan(plan: TestPlanDto, index: number) {
    if (!plan?.id || !this.currentTestSuiteId) return
    if (!this.selectedFile) {
      this.toastr.warning('Upload the specification document first.', 'Regenerate')
      return
    }

    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.toastr.error('Session expired. Reconnect and retry.', 'Session')
        return
      }

      const formData = new FormData()
      formData.append('file', this.selectedFile)
      formData.append('styleConfig', this.styleConfig.trim())
      formData.append('description', this.styleConfig.trim())
      formData.append('userId', userId)
      formData.append('testSuiteId', this.currentTestSuiteId)
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
      this.toastr.success(`Plan ${plan.id} regenerated successfully.`, 'Regenerate')
    } catch (err: any) {
      this.toastr.error(err?.error?.message || 'Unable to regenerate this plan', 'Regenerate')
    }
  }

  // Sequential flow

  /**
   * Start flow: generate test cases for the first plan.
   * Called from "Confirm" on the plans list.
   */
  async onStartSequentialFlow() {
    await this.onValidateAndGoToCases()
  }

  /**
   * User confirms test cases for current plan.
   * Mark plan "confirmed" then move to next.
   */
  async onConfirmCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return

    this.planStatuses[plan.id] = 'confirmed'

    if (this.isLastPlan) {
      // All plans confirmed, navigate
      await this.finishAndNavigate()
    } else {
      // Move to next plan and generate test cases
      this.currentPlanIndex++
      await this.generateCasesForCurrentPlan()
    }
  }

  /**
   * Regenerate test cases for current plan without advancing.
   */
  async onRegenerateCurrentCases() {
    await this.generateCasesForCurrentPlan(true)
  }

  /**
   * Go back to previous plan (to review/modify).
   */
  onGoToPreviousPlan() {
    if (this.currentPlanIndex > 0) {
      this.currentPlanIndex--
      // Plan returns to "reviewing" mode to allow re-confirmation
      const plan = this.currentPlan
      if (plan) this.planStatuses[plan.id] = 'reviewing'
    }
  }

  /**
   * Delete a test case from current plan.
   */
  onDeleteTestCase(planId: string, testCaseId: string) {
    const list = this.testCasesByPlan[planId] || []
    this.testCasesByPlan[planId] = list.filter((tc) => tc.id !== testCaseId)
  }

  /**
   * Copy test cases of current plan to clipboard.
   */
  async onCopyCurrentPlan() {
    const plan = this.currentPlan
    if (!plan) return
    const cases = this.testCasesByPlan[plan.id] || []
    const text = this.formatPlanText(plan, cases)
    await navigator.clipboard.writeText(text)
  }

  /**
   * Download test cases of current plan.
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

  // Private

  private formatPlanText(plan: TestPlanDto, cases: TestCaseDto[]): string {
    return [
      `Test Plan: ${plan.title || plan.id}`,
      plan.description ? `Description: ${plan.description}` : '',
      '',
      ...cases.map(
        (tc) =>
          `${tc.id} — ${tc.title}\n${tc.steps.map((s) => `- ${s}`).join('\n')}\nExpected: ${tc.expected_result}`
      ),
    ]
      .filter(Boolean)
      .join('\n\n')
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
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Error generating test cases'
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
    this.testPlans = []
    this.testCasesByPlan = {}
    this.currentPlanIndex = -1
    this.planStatuses = {}
    this.plansValidated = false
    this.sessionSaved = false

    try {
      this.toastr.info('Generating test plans. You can continue browsing.', 'AI')
      if (!this.selectedFile) {
        this.errorMessage = 'Please upload a file (.docx / .md / .txt)'
        this.toastr.warning(this.errorMessage, 'Test Plan')
        return
      }

      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) {
        this.errorMessage = 'Session expired. Please sign in again.'
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
      formData.append('regenerate', regenerate ? 'true' : 'false')

      const result = await firstValueFrom(this.testLabService.generatePlanFromDocx(formData))

      this.currentTestSuiteId = String(result?.testSuiteId || '')
      this.testPlans = Array.isArray(result?.testPlans) ? result.testPlans : []

      // Initialize all plans to "pending"
      this.testPlans.forEach((p) => (this.planStatuses[p.id] = 'pending'))

      if (!this.testPlans.length) {
        this.errorMessage = 'No test plans were generated.'
        this.toastr.warning(this.errorMessage, 'Test Plan')
      } else {
        this.toastr.success('Test plans generated successfully.', 'AI')
      }
    } catch (err: unknown) {
      const status = (err as any)?.status
      if (status === 0) {
        this.errorMessage =
          'Backend Node.js not accessible - check server is running on port 3000'
      } else if (status === 502) {
        this.errorMessage =
          'FastAPI not accessible - check uvicorn is running on port 8000'
      } else if (status === 504) {
        this.errorMessage = 'Ollama timeout - try with a smaller file'
      } else {
        this.errorMessage =
          (err as any)?.error?.message || (err as any)?.message || 'Unknown error'
      }
      this.toastr.error(this.errorMessage, 'Generation')
    } finally {
      this.generatingPlans = false
    }
  }

}
