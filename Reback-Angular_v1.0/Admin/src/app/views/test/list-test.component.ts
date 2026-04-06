import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { ActivatedRoute, Router } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { Store } from '@ngrx/store'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import {
  TestLabService,
  type TestCaseDto,
  type TestPlanDto,
  type TestSuiteDto,
} from '@/app/core/services/testlab.service'

@Component({
  selector: 'app-test-cases-validation',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './list-test.component.html',
  styleUrl: './list-test.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestCasesValidationComponent {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private testLabService = inject(TestLabService)
  private router = inject(Router)
  private route = inject(ActivatedRoute)

  loading = false
  errorMessage = ''
  view: 'list' | 'detail' = 'list'

  // Liste
  suites: TestSuiteDto[] = []
  searchQuery = ''
  expandedSuiteId: string | null = null

  // Détail
  testSuiteId = ''
  testPlans: TestPlanDto[] = []
  selectedPlanId: string | null = null
  generatingCasesPlanId: string | null = null
  testCasesByPlan: Record<string, TestCaseDto[]> = {}

  get filteredSuites(): TestSuiteDto[] {
    const q = this.searchQuery.toLowerCase().trim()
    if (!q) return this.suites
    return this.suites.filter(s =>
      (s.creatorName || '').toLowerCase().includes(q) ||
      (s.nom || '').toLowerCase().includes(q) ||
      (s.nametest || '').toLowerCase().includes(q) ||
      (s.description || '').toLowerCase().includes(q)
    )
  }

  get selectedPlan(): TestPlanDto | null {
    return this.testPlans.find(p => p.id === this.selectedPlanId) || null
  }

  get selectedTestCases(): TestCaseDto[] {
    return this.testCasesByPlan[this.selectedPlanId || ''] || []
  }

  async ngOnInit() {
    const routeSuiteId = String(this.route.snapshot.paramMap.get('id') || '').trim()
    if (routeSuiteId) {
      await this.openSuiteById(routeSuiteId)
      return
    }
    await this.loadSuites()
  }

  async loadSuites() {
    this.loading = true
    this.errorMessage = ''
    try {
      const user = await firstValueFrom(this.store.select(getUser).pipe(take(1)))
      let userId = String((user as any)?.id || (user as any)?._id || '').trim()
      const token = String((user as any)?.token || this.authService.session || '').trim()
      if (!userId && token) userId = this.resolveUserIdFromToken(token)
      if (!userId) { this.errorMessage = 'Session expirée.'; return }

      this.suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to load test suites'
    } finally {
      this.loading = false
    }
  }

  // Toggle expand/collapse d'une row
  onToggleSuite(suite: TestSuiteDto) {
    this.expandedSuiteId = this.expandedSuiteId === suite._id ? null : suite._id
  }

  // Ouvrir la vue détail
  async onOpenSuite(suite: TestSuiteDto) {
    const id = String(suite._id || '').trim()
    if (!id) return
    await this.router.navigate(['/test-cases'], {
      queryParams: { suiteId: id },
    })
  }

  onBackToList() {
    this.view = 'list'
    this.testSuiteId = ''
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}
    this.errorMessage = ''
  }

  async onSelectPlan(plan: TestPlanDto) {
    this.selectedPlanId = plan.id
    if (this.testCasesByPlan[plan.id]?.length) return
    await this.generateTestCases(plan, false)
  }

  async onRegenerate(plan: TestPlanDto) {
    await this.generateTestCases(plan, true)
  }

  onDeleteTestCase(planId: string, testCaseId: string) {
    this.testCasesByPlan[planId] = (this.testCasesByPlan[planId] || [])
      .filter(tc => tc.id !== testCaseId)
  }

  // Upload spec Word
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
      await this.loadSuites() // rafraîchit la liste
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Upload failed'
    }
  }

  // Helpers affichage
  getSuiteInitials(suite: TestSuiteDto): string {
    const name = suite.creatorName || suite.nom || suite._id || '?'
    return name.slice(0, 2).toUpperCase()
  }

  getTotalCases(suite: TestSuiteDto): number {
    if (typeof suite.totalTestCases === 'number') return suite.totalTestCases
    return (suite as any).testCasesByPlan?.reduce(
      (acc: number, p: any) => acc + (p.testCases?.length || 0), 0
    ) || 0
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
      this.testCasesByPlan[plan.id] = resp?.testCases || []
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to generate test cases'
    } finally {
      this.generatingCasesPlanId = null
    }
  }

  private resolveUserIdFromToken(token: string): string {
    try {
      const decoded = jwt_decode<Record<string, unknown>>(token)
      const u = (decoded?.['user'] as Record<string, unknown>) || decoded || {}
      return String(u['userId'] || u['id'] || u['_id'] || u['sub'] || '').trim()
    } catch { return '' }
  }

  private async openSuiteById(testSuiteId: string) {
    this.testSuiteId = String(testSuiteId).trim()
    if (!this.testSuiteId) return

    this.view = 'detail'
    this.testPlans = []
    this.selectedPlanId = null
    this.testCasesByPlan = {}
    this.loading = true
    this.errorMessage = ''

    try {
      const resp = await firstValueFrom(this.testLabService.getTestPlans(this.testSuiteId))
      this.testPlans = resp?.testPlans || []
      if (!this.testPlans.length) { this.errorMessage = 'No test plans found.'; return }
      this.selectedPlanId = this.testPlans[0].id
      await this.generateTestCases(this.testPlans[0], false)
    } catch (err: unknown) {
      this.errorMessage = (err as any)?.error?.message || 'Unable to load plans'
    } finally {
      this.loading = false
    }
  }

}
