import { copyFileSync, mkdirSync } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src  = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs")
const dest = join(root, "public", "pdf.worker.min.mjs")

mkdirSync(join(root, "public"), { recursive: true })
copyFileSync(src, dest)
console.log("✓ pdfjs worker copied to public/pdf.worker.min.mjs")
