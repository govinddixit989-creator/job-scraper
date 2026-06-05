import { NextRequest, NextResponse } from "next/server"
import { resolve } from "path"
import { pathToFileURL } from "url"

// ─── pdfjs text extraction (handles ALL standard PDF fonts/encodings) ─────────
async function extractWithPdfjs(buffer: Buffer): Promise<string> {
  const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs")

  // Build the worker path from process.cwd() to bypass Turbopack module resolution
  const workerPath = resolve(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).toString()

  const pdf = await getDocument({ data: new Uint8Array(buffer), verbosity: 0 }).promise
  let text = ""
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ") + "\n"
  }
  return text.replace(/\s+/g, " ").trim()
}

// ─── JPEG extractor for scanned PDFs ─────────────────────────────────────────
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

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const name = file.name.toLowerCase()

    if (name.endsWith(".pdf") || file.type === "application/pdf") {
      // 1. Try pdfjs — handles all standard encodings (Word, Google Docs, LaTeX, etc.)
      try {
        const text = await extractWithPdfjs(buffer)
        if (text.length >= 80) {
          return NextResponse.json({ type: "text", text })
        }
      } catch (e) {
        console.error("[extract-text] pdfjs failed:", e)
      }

      // 2. Scanned PDF — try embedded JPEG images for OCR
      const images = extractJpegsFromPdf(buffer)
      if (images.length > 0) {
        return NextResponse.json({ type: "images", images: images.slice(0, 4) })
      }

      // 3. Give up — ask user to paste
      return NextResponse.json(
        { error: "Could not extract text from this PDF. Please use the Paste option." },
        { status: 422 }
      )
    }

    // DOCX / TXT
    return NextResponse.json({ type: "text", text: buffer.toString("utf-8") })
  } catch (e) {
    console.error("[extract-text]", e)
    return NextResponse.json({ error: `Failed: ${String(e)}` }, { status: 500 })
  }
}
