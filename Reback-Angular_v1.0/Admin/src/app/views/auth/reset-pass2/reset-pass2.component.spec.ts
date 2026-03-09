import { ComponentFixture, TestBed } from '@angular/core/testing'

import { ResetPass2Component } from './reset-pass2.component'

describe('ResetPass2Component', () => {
  let component: ResetPass2Component
  let fixture: ComponentFixture<ResetPass2Component>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResetPass2Component],
    }).compileComponents()

    fixture = TestBed.createComponent(ResetPass2Component)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
