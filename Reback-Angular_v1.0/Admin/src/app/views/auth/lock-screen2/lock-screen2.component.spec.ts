import { ComponentFixture, TestBed } from '@angular/core/testing'

import { LockScreen2Component } from './lock-screen2.component'

describe('LockScreen2Component', () => {
  let component: LockScreen2Component
  let fixture: ComponentFixture<LockScreen2Component>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LockScreen2Component],
    }).compileComponents()

    fixture = TestBed.createComponent(LockScreen2Component)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
