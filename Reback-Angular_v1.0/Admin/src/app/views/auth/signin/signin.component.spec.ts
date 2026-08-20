import { ComponentFixture, TestBed } from '@angular/core/testing'
import { appTestProviders } from '@/testing/app-test-providers'

import { SigninComponent } from './signin.component'

describe('SigninComponent', () => {
  let component: SigninComponent
  let fixture: ComponentFixture<SigninComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SigninComponent],
      providers: appTestProviders(),
    }).compileComponents()

    fixture = TestBed.createComponent(SigninComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
