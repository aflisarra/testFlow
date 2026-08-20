import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { ResetPassComponent } from './reset-pass.component'

describe('ResetPassComponent', () => {
  let component: ResetPassComponent
  let fixture: ComponentFixture<ResetPassComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPassComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(ResetPassComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
