import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

export async function POST(req: NextRequest) {
  const groqKey = req.headers.get("x-groq-key")
  if (!groqKey) return NextResponse.json({ error: "Missing Groq key" }, { status: 401 })

  const { text } = await req.json()
  if (!text?.trim()) return NextResponse.json({ error: "No text provided" }, { status: 400 })

  try {
    const client = new Groq({ apiKey: groqKey })

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "user",
          content: `Extract structured information from this resume. Return ONLY valid JSON, no markdown, no explanation.

JSON format:
{
  "skills": ["skill1", "skill2"],
  "technologies": ["React", "Python"],
  "experience_years": 4,
  "seniority": "mid",
  "roles": ["Frontend Developer", "React Developer"],
  "summary": "one sentence profile"
}

seniority must be one of: junior, mid, senior, lead

Resume text:
${text.slice(0, 6000)}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 1024,
    })

    const raw = completion.choices[0]?.message?.content ?? "{}"
    const parsed = JSON.parse(raw)
    return NextResponse.json(parsed)
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
