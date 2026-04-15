import { ComponentFixture, TestBed } from '@angular/core/testing'

import { IconamoonComponent } from './iconamoon.component'

describe('IconamoonComponent', () => {
  let component: IconamoonComponent
  let fixture: ComponentFixture<IconamoonComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IconamoonComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(IconamoonComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
