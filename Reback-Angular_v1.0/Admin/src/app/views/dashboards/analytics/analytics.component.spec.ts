import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { AnalyticsComponent } from './analytics.component'

describe('AnalyticsComponent', () => {
  let component: AnalyticsComponent
  let fixture: ComponentFixture<AnalyticsComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(AnalyticsComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
