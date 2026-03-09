import { ComponentFixture, TestBed } from '@angular/core/testing'

import { CalendarHelpComponent } from './calendar-help.component'

describe('CalendarHelpComponent', () => {
  let component: CalendarHelpComponent
  let fixture: ComponentFixture<CalendarHelpComponent>

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarHelpComponent],
    }).compileComponents()

    fixture = TestBed.createComponent(CalendarHelpComponent)
    component = fixture.componentInstance
    fixture.detectChanges()
  })

  it('should create', () => {
    expect(component).toBeTruthy()
  })
})
