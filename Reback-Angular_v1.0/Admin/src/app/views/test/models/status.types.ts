export type PlanValidationStatus = 'pending' | 'generating' | 'reviewing' | 'confirmed'

export type SuiteSessionStatus = 'completed' | 'incomplete'

// Sequential flow used in `test-plan.component.ts`
export type PlanStatus = 'pending' | 'generating' | 'reviewing' | 'confirmed'

export type TestSuiteStatusKey = 'completed' | 'incomplete' | 'all'

export type TestGenerationStatus = 'Draft' | 'Generating' | 'Incomplete' | 'Ready' | 'Passed' | 'Failed'
