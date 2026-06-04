import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

export async function POST(req: NextRequest) {
  const groqKey = req.headers.get("x-groq-key")
  if (!groqKey) return NextResponse.json({ error: "Missing Groq key" }, { status: 401 })

  const { images } = await req.json()
  if (!images?.length) return NextResponse.json({ error: "No images provided" }, { status: 400 })

  const client = new Groq({ apiKey: groqKey })

  // Send up to 4 pages; each image is a data URL
  const imageContent = (images as string[]).slice(0, 4).map((url: string) => ({
    type: "image_url" as const,
    image_url: { url },
  }))

  try {
    const completion = await client.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",  // confirmed Groq vision model
      messages: [{
        role: "user",
        content: [
          ...imageContent,
          {
            type: "text",
            text: `These images are pages from a resume. Extract ALL information and return ONLY valid JSON with no markdown or code fences.

Return exactly this structure:
{
  "full_name": "string or null",
  "roles": ["3-6 job titles this person should search for"],
  "skills": ["every technical skill, framework, language, tool, database, cloud platform mentioned"],
  "experience_years": number,
  "seniority": "fresher|junior|mid|senior|lead",
  "current_title": "most recent job title or null",
  "companies": ["companies they worked at"],
  "education": "highest degree in one line or null",
  "salary_expectation": null,
  "work_type_preference": ["remote"],
  "summary": "2 sentence professional summary"
}

seniority rules: fresher=0yr, junior=1-2yr, mid=3-5yr, senior=6-9yr, lead=10yr+
Extract EVERY technology visible anywhere on the resume pages.`,
          },
        ],
      }],
      temperature: 0.1,
      max_tokens: 1500,
    })

    const raw = completion.choices[0]?.message?.content ?? "{}"
    const clean = raw.replace(/^```[a-z]*\n?/gm, "").replace(/```$/gm, "").trim()
    return NextResponse.json(JSON.parse(clean))
  } catch (e) {
    console.error("[ocr-resume]", e)
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    )
  }
}
