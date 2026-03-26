
import { CommonModule } from '@angular/common'
import { Component, CUSTOM_ELEMENTS_SCHEMA, inject } from '@angular/core'
import { Router } from '@angular/router'
import { Store } from '@ngrx/store'
import { firstValueFrom } from 'rxjs'
import { take } from 'rxjs/operators'
import { getUser } from '@/app/store/authentication/authentication.selector'
import { AuthenticationService } from '@/app/core/services/auth.service'
import { jwt_decode } from '@/app/core/utils/jwt-decode'
import { TestLabService, type TestSuiteDto } from '@/app/core/services/testlab.service'

@Component({
  selector: 'app-test-cases-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './test-cases-home.component.html',
  styleUrl: './test-cases-home.component.css',
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class TestCasesHomeComponent {
  private store = inject(Store)
  private authService = inject(AuthenticationService)
  private testLabService = inject(TestLabService)
  private router = inject(Router)

  loading = false
  errorMessage = ''
  suites: TestSuiteDto[] = []

  async ngOnInit() {
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
      if (!userId) {
        this.errorMessage = 'Session expirée. Reconnectez-vous.'
        return
      }

      this.suites = await firstValueFrom(this.testLabService.getTestSuitesByUser(userId))
    } catch (err: unknown) {
      this.errorMessage =
        (err as any)?.error?.message || (err as any)?.message || 'Unable to load test suites'
    } finally {
      this.loading = false
    }
  }

  openSuite(suite: TestSuiteDto) {
    const id = String(suite?._id || '').trim()
    if (!id) return
    void this.router.navigate(['/test-cases', id])
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
}


