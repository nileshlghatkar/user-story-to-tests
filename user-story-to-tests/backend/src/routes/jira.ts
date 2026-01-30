import express from 'express'

export const jiraRouter = express.Router()

// Jira route was removed during rollback - this router intentionally returns 404 for safety.
import fetch from 'node-fetch'

// GET /api/jira/story/:id
// Proxies a read-only GET to the Jira REST API and returns a small mapped payload
jiraRouter.get('/story/:id', async (req: express.Request, res: express.Response) => {
  try {
    const issueId = req.params.id
    if (!issueId) {
      res.status(400).json({ error: 'Missing issue id' })
      return
    }

    const base = process.env.JIRA_BASE_URL
    const user = process.env.JIRA_USER_EMAIL
    const token = process.env.JIRA_API_TOKEN

    if (!base || !user || !token) {
      res.status(500).json({ error: 'Jira credentials not configured on server' })
      return
    }

    // Build Jira API URL for issue
    const url = `${base.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(issueId)}?expand=renderedFields`

    const auth = Buffer.from(`${user}:${token}`).toString('base64')

    const jiraResp = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json'
      }
    })

    if (!jiraResp.ok) {
      const body = await jiraResp.text().catch(() => '')
      console.error('Jira API returned non-ok:', { url, status: jiraResp.status, body })
      // If issue not found or permission error, attempt a fallback search for recent issues
      // Also attempt fallback for transient server errors (5xx) or known "Site temporarily unavailable" responses
      const isTransient = jiraResp.status >= 500 || /temporarily unavailable/i.test(body)
      if (jiraResp.status === 404 || jiraResp.status === 403 || isTransient) {
        // If transient, do a single short retry before falling back
        if (isTransient) {
          try {
            const retryResp = await fetch(url, {
              method: 'GET',
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json'
              }
            })
            if (retryResp.ok) {
              const retryBody = await retryResp.text().catch(() => '')
              const issueObj = retryBody ? JSON.parse(retryBody) : {}
              // proceed to map and return
              const fields = issueObj && issueObj.fields ? issueObj.fields : {}
              const storyTitle = fields.summary || ''
              let description = ''
              if (issueObj.renderedFields && issueObj.renderedFields.description) {
                description = issueObj.renderedFields.description as string
              } else if (typeof fields.description === 'string') {
                description = fields.description
              }
              let acceptanceCriteria = ''
              for (const k of Object.keys(fields)) {
                if (/acceptance/i.test(k) || /criteria/i.test(k)) {
                  const v = fields[k]
                  if (typeof v === 'string') {
                    acceptanceCriteria = v
                    break
                  }
                }
              }
              const successPayload: any = { storyTitle, description, acceptanceCriteria, additionalInfo: '' }
              res.json(successPayload)
              return
            }
          } catch (e) {
            // ignore and fall through to fallback search
          }
        }
        try {
          // Attempt to extract project key from issueId (format PROJ-123)
          const projectMatch = issueId.match(/^([A-Z][A-Z0-9]+)-/)
          const projectKey = projectMatch ? projectMatch[1] : undefined

          if (projectKey) {
            const jql = `project=${projectKey} ORDER BY created DESC`
            const baseNoSlash = base.replace(/\/$/, '')
            const searchUrls = [
              `${baseNoSlash}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=10`,
              `${baseNoSlash}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=10`
            ]

            // Try the modern search/jql endpoint first (older /search?jql may return 410)
            let searchResp = await fetch(searchUrls[0], {
              method: 'GET',
              headers: {
                Authorization: `Basic ${auth}`,
                Accept: 'application/json'
              }
            })

            let triedUrl = searchUrls[0]
            // If Jira reports 410 (endpoint removed), try the older endpoint as a fallback
            if (searchResp.status === 410) {
              triedUrl = searchUrls[1]
              searchResp = await fetch(searchUrls[1], {
                method: 'GET',
                headers: {
                  Authorization: `Basic ${auth}`,
                  Accept: 'application/json'
                }
              })
            }

            const searchBody = await searchResp.text().catch(() => '')
            console.error('Jira search response:', { triedUrl, status: searchResp.status, body: searchBody })
            if (searchResp.ok) {
              const searchJson: any = JSON.parse(searchBody || '{}')
              const fallbackIssues = (searchJson.issues || []).map((it: any) => ({ key: it.key, summary: it.fields?.summary }))
              console.error('Returning fallbackIssues count=', fallbackIssues.length)
              res.status(404).json({ error: 'Issue not found or inaccessible', details: body, fallbackIssues })
              return
            }
          }
        } catch (e) {
          // ignore and fall through to return original error
        }
      }

      res.status(jiraResp.status).json({ error: 'Failed to fetch Jira issue', rawJiraResponse: body, details: body })
      return
    }

    // Read raw issue body so we can optionally return it for debugging
    const rawIssueBody = await jiraResp.text().catch(() => '')
    let issue: any = {}
    try {
      issue = rawIssueBody ? JSON.parse(rawIssueBody) : {}
    } catch (e) {
      issue = rawIssueBody
    }

  // Map fields heuristically. Jira Cloud JSON shape: fields.summary, fields.description, maybe custom fields for acceptance criteria
  const fields = issue && issue.fields ? issue.fields : {}
    const storyTitle = fields.summary || ''

    // description can be either a string or Jira's Content model. Try to extract renderedFields if available
    let description = ''
    if (issue.renderedFields && issue.renderedFields.description) {
      description = issue.renderedFields.description as string
    } else if (typeof fields.description === 'string') {
      description = fields.description
    } else if (fields.description && fields.description.content) {
      // naive convert from Atlassian storage to plain text
      try {
        description = JSON.stringify(fields.description)
      } catch (e) {
        description = ''
      }
    }

    // Heuristic: acceptance criteria may exist in a custom field named 'Acceptance' or 'Acceptance Criteria'
    let acceptanceCriteria = ''

    // Try to find a custom field named 'Acceptance' or 'Acceptance Criteria'
    for (const k of Object.keys(fields)) {
      if (/acceptance/i.test(k) || /criteria/i.test(k)) {
        const v = fields[k]
        if (typeof v === 'string') {
          acceptanceCriteria = v
          break
        }
      }
    }

    const additionalInfo = ''

  // If client requests debug info, include the raw Jira response
  const debug = String(req.query.debug || '') === 'true'
  const successPayload: any = { storyTitle, description, acceptanceCriteria, additionalInfo }
  if (debug) successPayload.rawJiraResponse = rawIssueBody
  res.json(successPayload)
  } catch (err) {
    console.error('Error in Jira proxy:', err)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/jira/auth-check
// Calls Jira /myself to verify credentials; returns only status info (no secrets)
jiraRouter.get('/auth-check', async (req: express.Request, res: express.Response) => {
  try {
    const base = process.env.JIRA_BASE_URL
    const user = process.env.JIRA_USER_EMAIL
    const token = process.env.JIRA_API_TOKEN

    if (!base || !user || !token) {
      res.status(500).json({ ok: false, status: 500, message: 'Jira credentials not configured on server' })
      return
    }

    const url = `${base.replace(/\/$/, '')}/rest/api/3/myself`
    const auth = Buffer.from(`${user}:${token}`).toString('base64')
      // Try once, and retry once on transient errors (5xx or known 'temporarily unavailable')
      let resp: any
      try {
        resp = await fetch(url, { method: 'GET', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } })
      } catch (e) {
        resp = { ok: false, status: 0, text: async () => String((e as any).message || '') }
      }

      // If transient server error or body indicates temporary outage, retry once
      if (!resp.ok) {
        const bodyText = await (resp.text ? resp.text().catch(() => '') : Promise.resolve(''))
        const isTransient = resp.status >= 500 || /temporarily unavailable/i.test(bodyText)
        if (isTransient) {
          try {
            const retry = await fetch(url, { method: 'GET', headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } })
            resp = retry
          } catch (e) {
            // keep original resp
          }
        }
      }

    // If fetch returned an object with ok property (Response), handle it
    if (resp && typeof resp.ok === 'boolean') {
      const status = resp.status
      if (resp.ok) {
        res.json({ ok: true, status, message: 'Authenticated' })
        return
      }
      const body = await resp.text().catch(() => '')
      const isTransient = status >= 500 || /temporarily unavailable/i.test(body)
      if (isTransient) {
        // Sanitized transient error response
        res.status(503).json({ ok: false, status: 503, message: 'Jira site temporarily unavailable' })
        return
      }
      // Non-transient failure (invalid credentials or 404/403)
      res.status(200).json({ ok: false, status, message: 'Jira /myself returned non-OK', details: body })
      return
    }

    // Fallback error
    res.status(500).json({ ok: false, status: 0, message: 'Failed to call Jira /myself' })
  } catch (err) {
    console.error('Error in Jira auth-check:', err)
    res.status(500).json({ ok: false, status: 0, message: 'Internal server error' })
  }
})

export default jiraRouter
