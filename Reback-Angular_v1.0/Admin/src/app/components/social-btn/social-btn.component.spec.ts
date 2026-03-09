import { ComponentFixture, TestBed } from '@angular/core/testing'

import { SocialBtnComponent } from './social-btn.component'

describe('SocialBtnComponent', () => {
  let component: SocialBtnComponent
  let fixture: ComponentFixture<SocialBtnComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SocialBtnComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(SocialBtnComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
