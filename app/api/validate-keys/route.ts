import { NextRequest, NextResponse } from "next/server"
import Groq from "groq-sdk"

export async function POST(req: NextRequest) {
  const body = await req.json()
  const result: Record<string, boolean> = {}

  if (body.groq) {
    try {
      const client = new Groq({ apiKey: body.groq })
      // Minimal call — just list models
      await client.models.list()
      result.groq = true
    } catch {
      result.groq = false
    }
  }

  if (body.apify) {
    try {
      const res = await fetch("https://api.apify.com/v2/users/me", {
        headers: { Authorization: `Bearer ${body.apify}` },
      })
      result.apify = res.ok
    } catch {
      result.apify = false
    }
  }

  return NextResponse.json(result)
}
