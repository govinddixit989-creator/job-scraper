import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

export async function POST(req: NextRequest) {
  const groqKey = req.headers.get("x-groq-key")
  if (!groqKey) return NextResponse.json({ error: "Missing Groq key" }, { status: 401 })

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: "No text" }, { status: 400 })

  const client = new Groq({ apiKey: groqKey })

  const completion = await client.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [{
      role: "user",
      content: `You are a resume parser. Extract ALL information from this resume and return ONLY valid JSON — no markdown, no explanation, no code fences.

Return this exact JSON structure:
{
  "full_name": "string or null",
  "roles": ["array of job titles this person should search for, e.g. React Developer, Frontend Engineer, Full Stack Developer"],
  "skills": ["all technical skills, frameworks, languages, tools, databases, cloud platforms"],
  "experience_years": number (total years of professional experience, 0 if fresher),
  "seniority": "fresher|junior|mid|senior|lead" (fresher=0yr, junior=1-2yr, mid=3-5yr, senior=6-9yr, lead=10yr+),
  "current_title": "their most recent job title or null",
  "companies": ["list of companies they worked at"],
  "education": "highest degree in one line or null",
  "salary_expectation": null,
  "work_type_preference": ["remote","fulltime","contract"] (infer from resume context — if they list remote jobs prefer remote, etc),
  "summary": "2 sentence professional summary of this person"
}

Rules:
- roles should be 3-6 searchable job titles that match their background
- skills must include ALL technologies mentioned anywhere in the resume
- be generous — include tools, libraries, CI/CD, methodologies
- experience_years: count from first job to now; 0 for students/freshers
- seniority MUST match experience_years

Resume:
${text.slice(0, 8000)}`,
    }],
    temperature: 0.1,
    max_tokens: 1500,
  })

  try {
    const raw = completion.choices[0]?.message?.content ?? "{}"
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: "Parse failed", raw: completion.choices[0]?.message?.content }, { status: 500 })
  }
}
