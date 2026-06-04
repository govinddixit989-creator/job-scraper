import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

export async function POST(req: NextRequest) {
  const groqKey = req.headers.get("x-groq-key")
  if (!groqKey) return NextResponse.json({ error: "Missing Groq key" }, { status: 401 })

  const { images } = await req.json() // base64 data URLs, one per page
  if (!images?.length) return NextResponse.json({ error: "No images provided" }, { status: 400 })

  const client = new Groq({ apiKey: groqKey })

  // Build content array: one image per page (max 4 pages)
  const imageContent = (images as string[]).slice(0, 4).map((url: string) => ({
    type: "image_url" as const,
    image_url: { url },
  }))

  const completion = await client.chat.completions.create({
    model: "meta-llama/llama-4-maverick-17b-128e-instruct",
    messages: [{
      role: "user",
      content: [
        ...imageContent,
        {
          type: "text",
          text: `These are pages from a resume. Extract ALL information and return ONLY valid JSON — no markdown, no explanation.

Return this exact structure:
{
  "full_name": "string or null",
  "roles": ["3-6 job titles this person should search for"],
  "skills": ["every technical skill, framework, language, tool, database, platform mentioned"],
  "experience_years": number,
  "seniority": "fresher|junior|mid|senior|lead",
  "current_title": "most recent job title or null",
  "companies": ["companies they worked at"],
  "education": "highest degree in one line or null",
  "salary_expectation": null,
  "work_type_preference": ["remote","fulltime","contract"],
  "summary": "2 sentence professional summary"
}

Rules:
- Extract EVERY technology visible anywhere on the resume
- experience_years: count from first job to now, 0 for freshers/students
- seniority must match experience_years (fresher=0, junior=1-2, mid=3-5, senior=6-9, lead=10+)
- roles should be searchable job titles matching their background`
        }
      ],
    }],
    temperature: 0.1,
    max_tokens: 1500,
  })

  try {
    const raw = completion.choices[0]?.message?.content ?? "{}"
    const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim()
    return NextResponse.json(JSON.parse(clean))
  } catch {
    return NextResponse.json(
      { error: "Could not parse OCR response", raw: completion.choices[0]?.message?.content },
      { status: 500 }
    )
  }
}
