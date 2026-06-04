import { NextRequest, NextResponse } from "next/server"
import { inflateSync } from "zlib"

function decodePdfStr(s: string): string {
  return s
    .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
    .replace(/\\n/g, " ").replace(/\\r/g, " ").replace(/\\t/g, " ")
    .replace(/\\\\/g, "\\").replace(/\\([()\s])/g, "$1")
}

function extractFromStreams(streams: string[]): string {
  const lines: string[] = []
  for (const stream of streams) {
    const btRe = /BT([\s\S]*?)ET/g
    let block: RegExpExecArray | null
    while ((block = btRe.exec(stream)) !== null) {
      const body = block[1]
      // TJ arrays: [(text)kern(text)...]TJ
      const tjArrRe = /\[([^\]]*)\]\s*TJ/g
      let m: RegExpExecArray | null
      while ((m = tjArrRe.exec(body)) !== null) {
        const parts: string[] = []
        const partRe = /\(([^)]*)\)/g
        let p: RegExpExecArray | null
        while ((p = partRe.exec(m[1])) !== null) parts.push(decodePdfStr(p[1]))
        const t = parts.join("").trim()
        if (t) lines.push(t)
      }
      // Simple Tj: (text)Tj
      const tjRe = /\(([^)]*)\)\s*Tj/g
      while ((m = tjRe.exec(body)) !== null) {
        const t = decodePdfStr(m[1]).trim()
        if (t) lines.push(t)
      }
    }
  }
  return lines.join(" ").replace(/\s+/g, " ").trim()
}

function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString("binary")

  // Pass 1: try raw (uncompressed) streams
  const rawText = extractFromStreams([raw])
  if (rawText.length >= 100) return rawText

  // Pass 2: decompress FlateDecode streams
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g
  const decompressed: string[] = []
  let m: RegExpExecArray | null
  while ((m = streamRe.exec(raw)) !== null) {
    try {
      decompressed.push(inflateSync(Buffer.from(m[1], "binary")).toString("binary"))
    } catch { /* not a deflate stream, skip */ }
  }
  if (decompressed.length > 0) {
    const text = extractFromStreams(decompressed)
    if (text.length >= 50) return text
  }

  return ""
}

function extractJpegsFromPdf(buffer: Buffer): string[] {
  const images: string[] = []
  let i = 0
  while (i < buffer.length - 1) {
    if (buffer[i] === 0xff && buffer[i + 1] === 0xd8) {
      let j = i + 2
      while (j < buffer.length - 1) {
        if (buffer[j] === 0xff && buffer[j + 1] === 0xd9) {
          const jpeg = buffer.slice(i, j + 2)
          if (jpeg.length > 5000 && jpeg.length < 4_000_000) {
            images.push("data:image/jpeg;base64," + jpeg.toString("base64"))
          }
          i = j + 2
          break
        }
        j++
      }
      if (j >= buffer.length - 1) break
    } else {
      i++
    }
  }
  return images
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const name = file.name.toLowerCase()

    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      const text = extractPdfText(buffer)
      if (text.length >= 50) return NextResponse.json({ type: "text", text })

      const images = extractJpegsFromPdf(buffer)
      if (images.length > 0) return NextResponse.json({ type: "images", images: images.slice(0, 4) })

      return NextResponse.json(
        { error: "Could not extract content from this PDF. Try the Paste text option." },
        { status: 422 }
      )
    }

    return NextResponse.json({ type: "text", text: buffer.toString("utf-8") })
  } catch (e) {
    console.error("[extract-text]", e)
    return NextResponse.json({ error: `Failed: ${String(e)}` }, { status: 500 })
  }
}
