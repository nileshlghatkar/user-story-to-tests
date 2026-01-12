export interface GenerateRequest {
  storyTitle: string
  acceptanceCriteria: string
  description?: string
  additionalInfo?: string
  categories?: string[]
}

export interface TestCase {
  id: string
  title: string
  steps: string[]
  testData?: string
  expectedResult: string
  category: string
}

export interface GenerateResponse {
  cases: TestCase[]
  model?: string
  promptTokens: number
  completionTokens: number
}

// Types for mock data generation (Mockaroo-like)
export interface MockDataRequest {
  rows: number
  schemaDescription: string // natural language description of the fields
  format?: 'json' | 'csv'
  seed?: number
}

export interface MockDataResponse {
  // When the backend returns actual sample data
  data?: string
  // If the backend returns a generated prompt instead (for debugging or to show what will be sent to a data generator)
  prompt?: string
  format?: 'json' | 'csv'
}
