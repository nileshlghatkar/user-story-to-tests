import { useState } from 'react'
import { generateTests, fetchJiraStory, fetchMockData, previewMockPrompt } from './api'
import { GenerateRequest, GenerateResponse, TestCase, MockDataRequest } from './types'

function App() {
  const [formData, setFormData] = useState<GenerateRequest>({
    storyTitle: '',
    acceptanceCriteria: '',
    description: '',
    additionalInfo: ''
  })
  const CATEGORY_OPTIONS = [
    { key: 'Positive', label: 'Positive', className: 'category-positive' },
    { key: 'Negative', label: 'Negative', className: 'category-negative' },
    { key: 'Edge', label: 'Edge', className: 'category-edge' },
    { key: 'Authorization', label: 'Authorization', className: 'category-authorization' },
    { key: 'Non-Functional', label: 'Non-Functional', className: 'category-non-functional' }
  ]

  // Empty set means "all categories" (default behavior)
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set())
  
  const [results, setResults] = useState<GenerateResponse | null>(null)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedTestCases, setExpandedTestCases] = useState<Set<string>>(new Set())
  const [storyId, setStoryId] = useState<string>('')
  const [isFetchingStory, setIsFetchingStory] = useState<boolean>(false)
  const [fallbackIssues, setFallbackIssues] = useState<Array<{ key: string; summary?: string }>>([])
  const showMockPanel = false
  const [mockRows, setMockRows] = useState<number>(10)
  const [mockFormat, setMockFormat] = useState<'json' | 'csv'>('json')
  const [mockSchemaDesc, setMockSchemaDesc] = useState<string>('id:int,name:string,email:string')
  const [mockSeed, setMockSeed] = useState<number | undefined>(undefined)
  const [mockResult, setMockResult] = useState<string | null>(null)
  const [isGeneratingMock, setIsGeneratingMock] = useState(false)
  

  const toggleTestCaseExpansion = (testCaseId: string) => {
    const newExpanded = new Set(expandedTestCases)
    if (newExpanded.has(testCaseId)) {
      newExpanded.delete(testCaseId)
    } else {
      newExpanded.add(testCaseId)
    }
    setExpandedTestCases(newExpanded)
  }

  const handleInputChange = (field: keyof GenerateRequest, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleFetchStory = async () => {
    if (!storyId.trim()) return
    setIsFetchingStory(true)
    setError(null)
    try {
      const data = await fetchJiraStory(storyId.trim())
      if (data.fallbackIssues) {
        setFallbackIssues(data.fallbackIssues)
      } else if (data.fields) {
        // Clean HTML from description and acceptanceCriteria preserving structure
        const stripHtml = (html?: string) => {
          if (!html) return ''
          try {
            // Convert common block-level tags to newlines so list items and paragraphs stay separated
            const withNewlines = html
              .replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/tr|\/h[1-6]|\/td|\/th)[^>]*>/gi, '\n')
              .replace(/<li[^>]*>/gi, '\n- ')
            const div = document.createElement('div')
            div.innerHTML = withNewlines
            const text = div.textContent || div.innerText || ''
            // Normalize line endings and collapse multiple blank lines to a single blank line
            const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n')
            // Trim trailing/leading whitespace on each line but preserve line breaks
            const lines = normalized.split('\n').map(l => l.replace(/\s+/g, ' ').trim())
            return lines.join('\n').trim()
          } catch {
            // Fallback to a simple regex-based strip if DOM not available; preserve some structure
            return (html || '')
              .replace(/<li[^>]*>/gi, '\n- ')
              .replace(/<(br|\/p|\/div|\/li|\/ul|\/ol|\/tr|\/h[1-6]|\/td|\/th)[^>]*>/gi, '\n')
              .replace(/<[^>]+>/g, '')
              .replace(/\s+/g, ' ')
              .trim()
          }
        }

        const cleanedDescription = stripHtml(data.fields.description as string)
        const cleanedAcceptance = stripHtml(data.fields.acceptanceCriteria as string)

        setFormData(prev => ({ ...prev, ...data.fields, description: cleanedDescription, acceptanceCriteria: cleanedAcceptance }))
        setFallbackIssues([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch story')
    } finally {
      setIsFetchingStory(false)
    }
  }

  const handleGenerateMock = async () => {
    setIsGeneratingMock(true)
    setMockResult(null)
    try {
      const req: MockDataRequest = {
        rows: mockRows,
        format: mockFormat,
        schemaDescription: mockSchemaDesc,
        seed: mockSeed
      }
      const res = await fetchMockData(req)
      setMockResult(res.data ?? null)
    } catch (err) {
      setMockResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setIsGeneratingMock(false)
    }
  }

  const handlePreviewPrompt = async () => {
    setMockResult(null)
    try {
      const req: MockDataRequest = { rows: mockRows, format: mockFormat, schemaDescription: mockSchemaDesc, seed: mockSeed }
      const res = await previewMockPrompt(req)
      setMockResult(res.prompt ?? null)
    } catch (err) {
      setMockResult(`Error: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const downloadData = () => {
    if (!mockResult) return
    const blob = new Blob([mockResult], { type: mockFormat === 'json' ? 'application/json' : 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mock_data.${mockFormat}`
    a.click()
    URL.revokeObjectURL(url)
  }

  

  const handleSelectFallback = (key: string) => {
    setStoryId(key)
    // auto fetch the selected issue
    setTimeout(() => handleFetchStory(), 50)
  }

  

  const toggleCategory = (key: string) => {
    const next = new Set(selectedCategories)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedCategories(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData.storyTitle.trim() || !formData.acceptanceCriteria.trim()) {
      setError('Story Title and Acceptance Criteria are required')
      return
    }

    setIsLoading(true)
    setError(null)
    
      try {
        const req = { ...formData } as any
        if (selectedCategories.size > 0) req.categories = Array.from(selectedCategories)
        const response = await generateTests(req)
        setResults(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate tests')
    } finally {
      setIsLoading(false)
    }
  }

  

  return (
    <div>
      <style>{`
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
          background-color: #f5f5f5;
          color: #333;
          line-height: 1.6;
        }
        
        .container {
          max-width: 95%;
          width: 100%;
          margin: 0 auto;
          padding: 20px;
          min-height: 100vh;
        }
        
        @media (min-width: 768px) {
          .container {
            max-width: 90%;
            padding: 30px;
          }
        }
        
        @media (min-width: 1024px) {
          .container {
            max-width: 85%;
            padding: 40px;
          }
        }
        
        @media (min-width: 1440px) {
          .container {
            max-width: 1800px;
            padding: 50px;
          }
        }
        
        .header {
          text-align: center;
          margin-bottom: 40px;
        }
        
        .title {
          font-size: 2.5rem;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        .subtitle {
          color: #666;
          font-size: 1.1rem;
        }
        
        .form-container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        
        .form-group {
          margin-bottom: 20px;
        }
        
        .form-label {
          display: block;
          font-weight: 600;
          margin-bottom: 8px;
          color: #2c3e50;
        }
        
        .form-input, .form-textarea {
          width: 100%;
          padding: 12px;
          border: 2px solid #e1e8ed;
          border-radius: 6px;
          font-size: 14px;
          transition: border-color 0.2s;
        }
        
        .form-input:focus, .form-textarea:focus {
          outline: none;
          border-color: #3498db;
        }
        
        .form-textarea {
          resize: vertical;
          min-height: 100px;
        }
        
        .submit-btn {
          background: #3498db;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .submit-btn:hover:not(:disabled) {
          background: #2980b9;
        }
        
        .submit-btn:disabled {
          background: #bdc3c7;
          cursor: not-allowed;
        }
        
        .error-banner {
          background: #e74c3c;
          color: white;
          padding: 15px;
          border-radius: 6px;
          margin-bottom: 20px;
        }
        
        .loading {
          text-align: center;
          padding: 40px;
          color: #666;
          font-size: 18px;
        }
        
        .results-container {
          background: white;
          border-radius: 8px;
          padding: 30px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        
        .results-header {
          margin-bottom: 20px;
          padding-bottom: 15px;
          border-bottom: 2px solid #e1e8ed;
        }
        
        .results-title {
          font-size: 1.8rem;
          color: #2c3e50;
          margin-bottom: 10px;
        }
        
        .results-meta {
          color: #666;
          font-size: 14px;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        
        .results-table th,
        .results-table td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e1e8ed;
        }
        
        .results-table th {
          background: #f8f9fa;
          font-weight: 600;
          color: #2c3e50;
        }
        
        .results-table tr:hover {
          background: #f8f9fa;
        }
        
        .category-positive { color: #27ae60; font-weight: 600; }
        .category-negative { color: #e74c3c; font-weight: 600; }
        .category-edge { color: #f39c12; font-weight: 600; }
        .category-authorization { color: #9b59b6; font-weight: 600; }
        .category-non-functional { color: #34495e; font-weight: 600; }
        
        .test-case-id {
          cursor: pointer;
          color: #3498db;
          font-weight: 600;
          padding: 8px 12px;
          border-radius: 4px;
          transition: background-color 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 8px;
        }
        
        .test-case-id:hover {
          background: #f8f9fa;
        }
        
        .test-case-id.expanded {
          background: #e3f2fd;
          color: #1976d2;
        }
        
        .expand-icon {
          font-size: 10px;
          transition: transform 0.2s;
        }
        
        .expand-icon.expanded {
          transform: rotate(90deg);
        }
        
        .expanded-details {
          margin-top: 15px;
          background: #fafbfc;
          border: 1px solid #e1e8ed;
          border-radius: 8px;
          padding: 20px;
        }
        
        .step-item {
          background: white;
          border: 1px solid #e1e8ed;
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 12px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.05);
        }
        
        .step-header {
          display: grid;
          grid-template-columns: 80px 1fr 1fr 1fr;
          gap: 15px;
          align-items: start;
        }
        
        .step-id {
          font-weight: 600;
          color: #2c3e50;
          background: #f8f9fa;
          padding: 4px 8px;
          border-radius: 4px;
          text-align: center;
          font-size: 12px;
        }
        
        .step-description {
          color: #2c3e50;
          line-height: 1.5;
        }
        
        .step-test-data {
          color: #666;
          font-style: italic;
          font-size: 14px;
        }
        
        .step-expected {
          color: #27ae60;
          font-weight: 500;
          font-size: 14px;
        }
        
        .step-labels {
          display: grid;
          grid-template-columns: 80px 1fr 1fr 1fr;
          gap: 15px;
          margin-bottom: 10px;
          font-weight: 600;
          color: #666;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        /* Pill checkbox group */
        .checkbox-group {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border-radius: 999px;
          border: 1px solid rgba(0,0,0,0.06);
          background: #fff;
          cursor: pointer;
          transition: transform 0.12s ease, box-shadow 0.12s ease, background-color 0.12s ease;
          user-select: none;
        }

        .pill input { display: none; }

        .pill .pill-label { font-weight: 600; font-size: 13px; }

        .pill:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(0,0,0,0.06); }

        .pill-selected { box-shadow: none; color: #fff; }

        .category-positive.pill-selected { background: rgba(39,174,96,0.95); border-color: rgba(39,174,96,0.95); }
        .category-negative.pill-selected { background: rgba(231,76,60,0.95); border-color: rgba(231,76,60,0.95); }
        .category-edge.pill-selected { background: rgba(243,156,18,0.95); border-color: rgba(243,156,18,0.95); }
        .category-authorization.pill-selected { background: rgba(155,89,182,0.95); border-color: rgba(155,89,182,0.95); }
        .category-non-functional.pill-selected { background: rgba(52,73,94,0.95); border-color: rgba(52,73,94,0.95); }

  .category-positive { color: inherit; }
  .category-negative { color: inherit; }
  .category-edge { color: inherit; }
  .category-authorization { color: inherit; }
  .category-non-functional { color: inherit; }
      `}</style>
      
      <div className="container">
        <div className="header">
          <h1 className="title">User Story to Tests</h1>
          <p className="subtitle">Generate comprehensive test cases from your user stories</p>
        </div>
        
  <form onSubmit={handleSubmit} className="form-container">
          <div className="form-group">
            <label className="form-label">Story ID (Jira)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="form-input"
                value={storyId}
                onChange={(e) => setStoryId(e.target.value)}
                placeholder="e.g., GOOG-123"
              />
              <button type="button" className="submit-btn" onClick={handleFetchStory} disabled={isFetchingStory}>
                {isFetchingStory ? 'Fetching...' : 'Fetch'}
              </button>
              {/* Generate Test Data toggle moved next to main Generate button */}
              
            </div>
            {fallbackIssues.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ marginBottom: 8, color: '#666' }}>Select a recent issue:</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {fallbackIssues.map(it => (
                    <button key={it.key} type="button" className="pill" onClick={() => handleSelectFallback(it.key)}>
                      <span>{it.key}</span>
                      <small style={{ marginLeft: 8, color: '#666' }}>{it.summary}</small>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="form-group">
            <label htmlFor="storyTitle" className="form-label">
              Story Title *
            </label>
            <input
              type="text"
              id="storyTitle"
              className="form-input"
              value={formData.storyTitle}
              onChange={(e) => handleInputChange('storyTitle', e.target.value)}
              placeholder="Enter the user story title..."
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="description" className="form-label">
              Description
            </label>
            <textarea
              id="description"
              className="form-textarea"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              placeholder="Additional description (optional)..."
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="acceptanceCriteria" className="form-label">
              Acceptance Criteria *
            </label>
            <textarea
              id="acceptanceCriteria"
              className="form-textarea"
              value={formData.acceptanceCriteria}
              onChange={(e) => handleInputChange('acceptanceCriteria', e.target.value)}
              placeholder="Enter the acceptance criteria..."
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="additionalInfo" className="form-label">
              Additional Info
            </label>
            <textarea
              id="additionalInfo"
              className="form-textarea"
              value={formData.additionalInfo}
              onChange={(e) => handleInputChange('additionalInfo', e.target.value)}
              placeholder="Any additional information (optional)..."
            />
          </div>

          <div className="form-group">
            <label className="form-label">Test Categories</label>
            <div className="checkbox-group" role="group" aria-label="Test categories">
              {CATEGORY_OPTIONS.map(opt => (
                <label key={opt.key} className={`pill ${opt.className} ${selectedCategories.has(opt.key) ? 'pill-selected' : ''}`}>
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(opt.key)}
                    onChange={() => toggleCategory(opt.key)}
                    aria-checked={selectedCategories.has(opt.key)}
                  />
                  <span className="pill-label">{opt.label}</span>
                </label>
              ))}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="submit"
              className="submit-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Generating...' : 'Generate'}
            </button>
            
          </div>
        </form>

        

        {error && (
          <div className="error-banner">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="loading">
            Generating test cases...
          </div>
        )}

        {results && (
          <div className="results-container">
            <div className="results-header">
              <h2 className="results-title">Generated Test Cases</h2>
              <div className="results-meta">
                {results.cases.length} test case(s) generated
                {results.model && ` • Model: ${results.model}`}
                {results.promptTokens > 0 && ` • Tokens: ${results.promptTokens + results.completionTokens}`}
              </div>
            </div>
            
            <div className="table-container">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Test Case ID</th>
                    <th>Title</th>
                    <th>Category</th>
                    <th>Expected Result</th>
                  </tr>
                </thead>
                <tbody>
                  {results.cases.map((testCase: TestCase) => (
                    <>
                      <tr key={testCase.id}>
                        <td>
                          <div 
                            className={`test-case-id ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}
                            onClick={() => toggleTestCaseExpansion(testCase.id)}
                          >
                            <span className={`expand-icon ${expandedTestCases.has(testCase.id) ? 'expanded' : ''}`}>
                              ▶
                            </span>
                            {testCase.id}
                          </div>
                        </td>
                        <td>{testCase.title}</td>
                        <td>
                          <span className={`category-${testCase.category.toLowerCase()}`}>
                            {testCase.category}
                          </span>
                        </td>
                        <td>{testCase.expectedResult}</td>
                      </tr>
                      {expandedTestCases.has(testCase.id) && (
                        <tr key={`${testCase.id}-details`}>
                          <td colSpan={4}>
                            <div className="expanded-details">
                              <h4 style={{marginBottom: '15px', color: '#2c3e50'}}>Test Steps for {testCase.id}</h4>
                              <div className="step-labels">
                                <div>Step ID</div>
                                <div>Step Description</div>
                                <div>Test Data</div>
                                <div>Expected Result</div>
                              </div>
                              {testCase.steps.map((step, index) => (
                                <div key={index} className="step-item">
                                  <div className="step-header">
                                    <div className="step-id">S{String(index + 1).padStart(2, '0')}</div>
                                    <div className="step-description">{step}</div>
                                    <div className="step-test-data">{testCase.testData || 'N/A'}</div>
                                    <div className="step-expected">
                                      {index === testCase.steps.length - 1 ? testCase.expectedResult : 'Step completed successfully'}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {showMockPanel && (
        <aside style={{ position: 'fixed', right: 20, top: 80, width: 360, background: '#fff', border: '1px solid #ddd', padding: 12, zIndex: 999 }}>
          <h3>Generate Test Data</h3>
          <div style={{ marginBottom: 8 }}>
            <label>Rows: </label>
            <input type="number" value={mockRows} onChange={e => setMockRows(Number(e.target.value))} style={{ width: 80 }} />
            <label style={{ marginLeft: 8 }}>Format: </label>
            <select value={mockFormat} onChange={e => setMockFormat(e.target.value as 'json' | 'csv')}>
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Schema description:</label>
            <textarea rows={3} value={mockSchemaDesc} onChange={e => setMockSchemaDesc(e.target.value)} style={{ width: '100%' }} />
          </div>
          <div style={{ marginBottom: 8 }}>
            <label>Seed (optional): </label>
            <input value={mockSeed ?? ''} onChange={e => setMockSeed(e.target.value ? Number(e.target.value) : undefined)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleGenerateMock} disabled={isGeneratingMock}>{isGeneratingMock ? 'Generating...' : 'Generate'}</button>
            <button onClick={handlePreviewPrompt}>Preview Prompt</button>
            <button onClick={downloadData} disabled={!mockResult}>Download</button>
          </div>
          <div style={{ marginTop: 12, maxHeight: 300, overflow: 'auto', whiteSpace: 'pre-wrap', background: '#f9f9f9', padding: 8 }}>
            {mockResult ?? <em>No output yet</em>}
          </div>
        </aside>
      )}
    </div>
  )
}

export default App