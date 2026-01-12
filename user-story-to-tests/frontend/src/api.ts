import { GenerateRequest, GenerateResponse } from './types'
import { MockDataRequest, MockDataResponse } from './types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8090/api'

export async function generateTests(request: GenerateRequest): Promise<GenerateResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/generate-tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
    }

    const data: GenerateResponse = await response.json()
    return data
  } catch (error) {
    console.error('Error generating tests:', error)
    throw error instanceof Error ? error : new Error('Unknown error occurred')
  }
}

export type JiraStoryResult = {
  fields?: Partial<GenerateRequest>
  fallbackIssues?: Array<{ key: string; summary?: string }>
}

export async function fetchJiraStory(issueId: string): Promise<JiraStoryResult> {
  const resp = await fetch(`${API_BASE_URL}/jira/story/${encodeURIComponent(issueId)}`)
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    // Return fallbackIssues if provided by backend, otherwise throw
    if (data && data.fallbackIssues) {
      return { fallbackIssues: data.fallbackIssues }
    }
    throw new Error(data.error || `HTTP ${resp.status}`)
  }

  return {
    fields: {
      storyTitle: data.storyTitle || '',
      description: data.description || '',
      acceptanceCriteria: data.acceptanceCriteria || '',
      additionalInfo: data.additionalInfo || ''
    }
  }
}

export async function fetchMockData(request: MockDataRequest): Promise<MockDataResponse> {
  try {
    const resp = await fetch(`${API_BASE_URL}/mockdata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    })

    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) {
      throw new Error(data.error || `HTTP ${resp.status}`)
    }

    return data as MockDataResponse
  } catch (err) {
    console.error('Error fetching mock data:', err)
    throw err instanceof Error ? err : new Error('Unknown error occurred')
  }
}

export async function previewMockPrompt(request: MockDataRequest): Promise<MockDataResponse> {
  try {
    const resp = await fetch(`${API_BASE_URL}/mockdata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, previewOnly: true })
    })
    const data = await resp.json().catch(() => ({}))
    if (!resp.ok) throw new Error(data.error || `HTTP ${resp.status}`)
    return data as MockDataResponse
  } catch (err) {
    console.error('Error previewing mock prompt:', err)
    throw err instanceof Error ? err : new Error('Unknown error')
  }
}
