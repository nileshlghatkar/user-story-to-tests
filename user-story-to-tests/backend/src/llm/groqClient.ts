import fetch from 'node-fetch'
import { GenerateResponse } from '../schemas'

interface GroqResponse {
  content: string
  model?: string
  promptTokens: number
  completionTokens: number
}

export class GroqClient {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = process.env.groq_API_KEY || ''
    this.baseUrl = process.env.groq_API_BASE || 'https://api.groq.com/openai/v1'
    this.model = process.env.groq_MODEL || 'llama3-8b-8192'
    
    if (!this.apiKey) {
      console.warn('groq_API_KEY not found in environment variables')
    } else {
      console.log('Groq API key configured successfully')
      console.log(`Using model: ${this.model}`)
      console.log(`API endpoint: ${this.baseUrl}/chat/completions`)
    }
  }

  async generateTests(systemPrompt: string, userPrompt: string): Promise<GroqResponse> {
    const endpoint = `${this.baseUrl}/chat/completions`
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2
    }

  console.log('🚀 Making Groq API call:')
  console.log(`📍 Endpoint: ${endpoint}`)
  console.log(`🤖 Model: ${this.model}`)
  console.log(this.apiKey ? '🔑 API key: present' : '🔑 API key: not set')
  console.log('📝 Request body: (redacted)')

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      console.log(`📊 Response status: ${response.status} ${response.statusText}`)
      // Do not log full response headers or body (may contain sensitive info)

      if (!response.ok) {
        // Read a small portion of the response for debugging without logging secrets
        let snippet = ''
        try {
          const text = await response.text()
          snippet = text.slice(0, 200)
        } catch {
          snippet = ''
        }
        console.error(`❌ Groq API returned ${response.status} ${response.statusText}`)
        // Throw sanitized error for caller to handle; avoid including raw body
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as any
  console.log('✅ Success response received')

      const content = data.choices?.[0]?.message?.content

      if (!content) {
        throw new Error('No content received from Groq API')
      }

      // Try to parse as JSON to validate
      let parsedContent: GenerateResponse
      try {
        parsedContent = JSON.parse(content)
      } catch (parseError) {
        throw new Error(`Invalid JSON response from Groq API: ${parseError}`)
      }

      return {
        content,
        model: data.model,
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0
      }
    } catch (error) {
      // Log concise error locally and rethrow for caller handling
      console.error('❌ Error calling Groq API:', error instanceof Error ? error.message : String(error))
      throw new Error('Failed to call Groq API')
    }
  }

  // Similar to generateTests but returns the raw content without attempting to parse as a specific schema.
  async generateRaw(systemPrompt: string, userPrompt: string): Promise<string> {
    const endpoint = `${this.baseUrl}/chat/completions`
    const requestBody = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.6,
      max_tokens: 20000
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      if (!response.ok) {
        let snippet = ''
        try { snippet = (await response.text()).slice(0, 200) } catch {}
        console.error(`Groq API returned ${response.status} ${response.statusText}`)
        throw new Error(`Groq API error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json() as any
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('No content from Groq API')
      return content
    } catch (err) {
      console.error('❌ Error calling Groq API (raw):', err instanceof Error ? err.message : String(err))
      throw new Error('Failed to call Groq API')
    }
  }
  

}

// Export a singleton instance for convenience
export const groqClient = new GroqClient()