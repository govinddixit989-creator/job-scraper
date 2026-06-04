import { NextRequest, NextResponse } from "next/server"

/**
 * Pure-JS PDF text extraction — no pdfjs, no canvas, no native deps.
 * Reads BT…ET text blocks directly from the raw PDF byte stream.
 * Good enough for text-based (non-scanned) resumes.
 */
function extractPdfText(buffer: ArrayBuffer): string {
  // Decode bytes as latin-1 so every byte maps 1:1
  const raw = Buffer.from(buffer).toString("binary")

  const chunks: string[] = []

  // Match every BT … ET text block
  const blockRe = /BT([\s\S]*?)ET/g
  let block: RegExpExecArray | null

  while ((block = blockRe.exec(raw)) !== null) {
    const body = block[1]

    // Tj  — single string: (text)Tj  or  (text) Tj
    const tjRe = /\(([^)]*)\)\s*Tj/g
    let m: RegExpExecArray | null
    while ((m = tjRe.exec(body)) !== null) {
      chunks.push(decodePdfString(m[1]))
    }

    // TJ  — array of strings: [(text) -200 (more) ...] TJ
    const tjArrayRe = /\[([^\]]*)\]\s*TJ/g
    while ((m = tjArrayRe.exec(body)) !== null) {
      const inner = m[1]
      const strRe = /\(([^)]*)\)/g
      let s: RegExpExecArray | null
      while ((s = strRe.exec(inner)) !== null) {
        chunks.push(decodePdfString(s[1]))
      }
    }
  }

  return chunks.join(" ").replace(/\s+/g, " ").trim()
}

function decodePdfString(s: string): string {
  // Unescape PDF octal sequences (\nnn) and simple backslash escapes
  return s
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\\/g, "\\")
    .replace(/\\([()\s])/g, "$1")
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = await file.arrayBuffer()
    const name = file.name.toLowerCase()

    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const text = extractPdfText(buffer)
      if (!text || text.length < 50) {
        return NextResponse.json(
          { error: "PDF appears to be scanned/image-only. Please paste your resume text instead." },
          { status: 422 }
        )
      }
      return NextResponse.json({ text })
    }

    // DOCX / TXT
    const text = Buffer.from(buffer).toString("utf-8")
    return NextResponse.json({ text })
  } catch (e) {
    console.error("[extract-text]", e)
    return NextResponse.json({ error: `Extraction failed: ${String(e)}` }, { status: 500 })
  }
}
