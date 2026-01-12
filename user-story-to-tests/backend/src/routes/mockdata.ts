import express from 'express'
import { z } from 'zod'
import { buildMockDataPrompt } from '../prompt'
import { groqClient } from '../llm/groqClient'

const router = express.Router()

const Schema = z.object({
  rows: z.number().min(1).max(10000).optional().default(10),
  schemaDescription: z.string().min(1),
  format: z.enum(['json', 'csv']).optional().default('json'),
  seed: z.number().optional(),
  previewOnly: z.boolean().optional().default(false)
})

router.post('/', async (req: express.Request, res: express.Response) => {
  try {
    const parsed = Schema.parse(req.body)
    const userPrompt = buildMockDataPrompt({ rows: parsed.rows, schemaDescription: parsed.schemaDescription, format: parsed.format, seed: parsed.seed })

    if (parsed.previewOnly) {
      return res.json({ prompt: userPrompt, format: parsed.format })
    }

    // Local deterministic fallback when no API key present
    if (!process.env.groq_API_KEY) {
      const sample = generateLocalSample(parsed.rows, parsed.schemaDescription)
      if (parsed.format === 'json') return res.json({ data: JSON.stringify(sample, null, 2), format: 'json' })
      const keys = Object.keys(sample[0] || {})
      const csv = [keys.join(',')].concat(sample.map(r => keys.map(k => escapeCsv(String((r as any)[k] ?? ''))).join(','))).join('\n')
      return res.json({ data: csv, format: 'csv' })
    }

    try {
      const raw = await groqClient.generateRaw('', userPrompt)
      // raw is a string; attempt to parse if JSON expected
      if (parsed.format === 'json') {
        try {
          const parsedJson = JSON.parse(raw)
          return res.json({ data: JSON.stringify(parsedJson, null, 2), format: 'json' })
        } catch {
          return res.json({ data: raw, format: 'json' })
        }
      }
      return res.json({ data: raw, format: parsed.format })
    } catch (llmErr) {
      console.error('LLM error (mockdata):', llmErr)
      // Fallback: return local deterministic sample instead of failing
      const sample = generateLocalSample(parsed.rows, parsed.schemaDescription)
      if (parsed.format === 'json') return res.json({ data: JSON.stringify(sample, null, 2), format: 'json' })
      const keys = Object.keys(sample[0] || {})
      const csv = [keys.join(',')].concat(sample.map(r => keys.map(k => escapeCsv(String((r as any)[k] ?? ''))).join(','))).join('\n')
      return res.json({ data: csv, format: 'csv' })
    }
  } catch (err) {
    console.error('Error in mockdata route:', err)
    return res.status(400).json({ error: err instanceof Error ? err.message : String(err) })
  }
})

function escapeCsv(val: string) {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return '"' + val.replace(/"/g, '""') + '"'
  }
  return val
}

function generateLocalSample(rows: number, schemaDescription: string) {
  const lower = schemaDescription.toLowerCase()
  const fields: Array<{ key: string; type: string }> = []

  if (lower.includes('id')) fields.push({ key: 'id', type: 'id' })
  if (lower.includes('name')) fields.push({ key: 'name', type: 'name' })
  if (lower.includes('email')) fields.push({ key: 'email', type: 'email' })
  if (lower.includes('date') || lower.includes('timestamp') || lower.includes('created')) fields.push({ key: 'created_at', type: 'date' })
  if (fields.length === 0) {
    fields.push({ key: 'id', type: 'id' })
    fields.push({ key: 'value', type: 'string' })
  }

  const sample: any[] = []
  for (let i = 0; i < rows; i++) {
    const row: any = {}
    for (const f of fields) {
      if (f.type === 'id') row[f.key] = i + 1
      else if (f.type === 'name') row[f.key] = `Test User ${i + 1}`
      else if (f.type === 'email') row[f.key] = `user${i + 1}@example.com`
      else if (f.type === 'date') row[f.key] = new Date(Date.now() - i * 1000 * 60 * 60 * 24).toISOString()
      else row[f.key] = `${f.key}_${i + 1}`
    }
    sample.push(row)
  }
  return sample
}

export default router
