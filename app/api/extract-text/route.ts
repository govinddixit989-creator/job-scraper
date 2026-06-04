import { NextRequest, NextResponse } from "next/server"
import { extractText } from "unpdf"

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const buffer = await file.arrayBuffer()

  if (file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf") {
    try {
      const { text } = await extractText(new Uint8Array(buffer))
      return NextResponse.json({ text })
    } catch (e) {
      return NextResponse.json({ error: `PDF parse failed: ${String(e)}` }, { status: 500 })
    }
  }

  // DOCX / TXT — return as plain text
  return NextResponse.json({ text: Buffer.from(buffer).toString("utf-8") })
}
