"use client"

import { useState, useRef } from "react"
import { UserPreferences, WorkType, Seniority, ApiKeys } from "@/lib/types"
import { Input } from "@/components/ui/input"
import {
  Upload, CheckCircle2, Loader2, X, Plus,
  FileText, ArrowRight, Sparkles, ClipboardPaste,
} from "lucide-react"

interface Props {
  onComplete: (prefs: UserPreferences) => void
  apiKeys: ApiKeys
}

// ─── Render PDF pages as base64 images (browser-side, canvas is available) ───
async function renderPdfAsImages(file: File, maxPages = 4): Promise<string[]> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  const images: string[] = []
  const pages = Math.min(pdf.numPages, maxPages)

  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // 2× for readable OCR
    const canvas = document.createElement("canvas")
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext("2d")!
    await page.render({ canvasContext: ctx, canvas, viewport }).promise
    images.push(canvas.toDataURL("image/jpeg", 0.85))
  }
  return images
}

const SENIORITY_OPTIONS: { value: Seniority; label: string; years: string }[] = [
  { value: "fresher", label: "Fresher",     years: "0 years" },
  { value: "junior",  label: "Junior",      years: "1–2 years" },
  { value: "mid",     label: "Mid-level",   years: "3–5 years" },
  { value: "senior",  label: "Senior",      years: "6–9 years" },
  { value: "lead",    label: "Lead / Staff", years: "10+ years" },
]

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "remote",   label: "Remote" },
  { value: "fulltime", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "any",      label: "Any" },
]

type Step = "upload" | "parsing" | "review"

export default function Onboarding({ onComplete, apiKeys }: Props) {
  const [step, setStep] = useState<Step>("upload")
  const [parseError, setParseError] = useState("")
  const [parseStatus, setParseStatus] = useState("")  // progress messages
  const [rawText, setRawText] = useState("")
  const [fileName, setFileName] = useState("")
  const [summary, setSummary] = useState("")
  const [pasteMode, setPasteMode] = useState(false)
  const [pastedText, setPastedText] = useState("")

  // Editable parsed fields
  const [roles, setRoles] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [workTypes, setWorkTypes] = useState<WorkType[]>(["remote"])
  const [seniority, setSeniority] = useState<Seniority>("mid")
  const [experienceYears, setExperienceYears] = useState(0)
  const [salary, setSalary] = useState("")

  const [roleInput, setRoleInput] = useState("")
  const [skillInput, setSkillInput] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Groq parsing ─────────────────────────────────────────────────────────────
  const parseWithGroq = async (text: string) => {
    setParseStatus("Sending to Groq AI…")
    const res = await fetch("/api/parse-resume", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-groq-key": apiKeys.groq },
      body: JSON.stringify({ text }),
    })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Groq error ${res.status}: ${body.slice(0, 200)}`)
    }
    const parsed = await res.json()
    if (parsed.error) throw new Error(`Groq parse: ${parsed.error}`)
    return parsed
  }

  const applyParsed = (parsed: Record<string, unknown>) => {
    setRoles((parsed.roles as string[]) ?? [])
    setSkills([...new Set((parsed.skills as string[]) ?? [])])
    setSeniority((parsed.seniority as Seniority) ?? "mid")
    setExperienceYears((parsed.experience_years as number) ?? 0)
    setSummary((parsed.summary as string) ?? "")
    setSalary((parsed.salary_expectation as string) ?? "")
    const wt: WorkType[] = (parsed.work_type_preference as WorkType[])?.length
      ? (parsed.work_type_preference as WorkType[])
      : ["remote"]
    setWorkTypes(wt)
  }

  // ── File upload flow ──────────────────────────────────────────────────────────
  const processFile = async (file: File) => {
    setParseError("")
    setParseStatus("")
    setFileName(file.name)
    setStep("parsing")

    // ── Step 1: extract text ────────────────────────────────────────────────
    let text = ""
    try {
      setParseStatus("Extracting text from resume…")
      const formData = new FormData()
      formData.append("file", file)
      const extractRes = await fetch("/api/extract-text", { method: "POST", body: formData })

      // Read response once
      const extractData = await extractRes.json().catch(() => ({}))
      const isScanned = extractRes.status === 422 || !extractData.text?.trim()

      if (isScanned) {
        // Scanned / image-only PDF — run OCR via Groq vision automatically
        setParseStatus("Scanned PDF detected — running OCR with AI vision…")
        try {
          const images = await renderPdfAsImages(file)
          if (!images.length) throw new Error("No pages rendered from PDF")

          const ocrRes = await fetch("/api/ocr-resume", {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-groq-key": apiKeys.groq },
            body: JSON.stringify({ images }),
          })
          const ocrData = await ocrRes.json().catch(() => ({}))
          if (!ocrRes.ok || ocrData.error) throw new Error(ocrData.error ?? `OCR API ${ocrRes.status}`)
          applyParsed(ocrData)
          setStep("review")
          return
        } catch (ocrErr) {
          console.error("OCR failed:", ocrErr)
          const msg = ocrErr instanceof Error ? ocrErr.message : String(ocrErr)
          setPasteMode(true)
          setParseError(`OCR failed (${msg.slice(0, 120)}). Please paste your resume text below.`)
          setStep("upload")
          return
        }
      }

      if (!extractRes.ok) {
        setPasteMode(true)
        setParseError(`Could not read file (${extractRes.status}). Please paste your resume text instead.`)
        setStep("upload")
        return
      }

      text = extractData.text ?? ""
    } catch (e) {
      console.error("extraction error:", e)
      setPasteMode(true)
      setParseError("Could not read file. Please paste your resume text instead.")
      setStep("upload")
      return
    }

    setRawText(text)

    // ── Step 2: Groq parse ──────────────────────────────────────────────────
    try {
      const parsed = await parseWithGroq(text)
      applyParsed(parsed)
      setStep("review")
    } catch (e) {
      console.error("groq parse error:", e)
      const msg = e instanceof Error ? e.message : String(e)
      setParseError(`AI parsing failed: ${msg.slice(0, 200)}`)
      setStep("upload")
    }
  }

  // ── Paste flow ────────────────────────────────────────────────────────────────
  const processPastedText = async () => {
    if (!pastedText.trim()) return
    setParseError("")
    setParseStatus("")
    setFileName("pasted text")
    setRawText(pastedText)
    setStep("parsing")

    try {
      const parsed = await parseWithGroq(pastedText)
      applyParsed(parsed)
      setStep("review")
    } catch (e) {
      console.error("processPastedText error:", e)
      const msg = e instanceof Error ? e.message : String(e)
      setParseError(`Parse failed: ${msg.slice(0, 200)}`)
      setStep("upload")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // ── Chip helpers ──────────────────────────────────────────────────────────────
  const addRole  = (v: string) => { const t = v.trim(); if (t && !roles.includes(t))  setRoles((p)  => [...p, t]); setRoleInput("") }
  const addSkill = (v: string) => { const t = v.trim(); if (t && !skills.includes(t)) setSkills((p) => [...p, t]); setSkillInput("") }
  const toggleWorkType = (wt: WorkType) => {
    if (wt === "any") { setWorkTypes(["any"]); return }
    setWorkTypes((prev) => {
      const w = prev.filter((x) => x !== "any")
      return w.includes(wt) ? w.filter((x) => x !== wt) : [...w, wt]
    })
  }

  const handleSubmit = () => {
    onComplete({
      roles, skills,
      workTypes: workTypes.length ? workTypes : ["any"],
      experienceYears, seniority,
      salaryExpectation: salary || undefined,
      resumeText: rawText || undefined,
      resumeName: fileName || undefined,
    })
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP: Parsing
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-5 text-center">
          <div className="relative w-16 h-16">
            <div className="w-16 h-16 rounded-full border-4 border-muted flex items-center justify-center">
              <Sparkles size={24} className="text-primary" />
            </div>
            <Loader2 size={64} className="animate-spin text-primary/20 absolute inset-0" />
          </div>
          <div>
            <p className="font-semibold text-lg">Analysing your resume…</p>
            <p className="text-muted-foreground text-sm mt-1">{parseStatus || "Groq AI is reading your profile"}</p>
            {fileName && <p className="text-xs text-muted-foreground mt-0.5">{fileName}</p>}
          </div>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP: Upload
  // ────────────────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">

          {/* Header */}
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto">
              <FileText size={22} className="text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Add your resume</h1>
            <p className="text-sm text-muted-foreground">
              AI parses it and fills your profile automatically.
            </p>
          </div>

          {/* Error */}
          {parseError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
              {parseError}
            </div>
          )}

          {/* Tabs: Upload vs Paste */}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setPasteMode(false)}
              className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                !pasteMode ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <Upload size={14} /> Upload PDF
            </button>
            <button
              onClick={() => setPasteMode(true)}
              className={`flex-1 py-2 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                pasteMode ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              }`}
            >
              <ClipboardPaste size={14} /> Paste text
            </button>
          </div>

          {!pasteMode ? (
            /* Upload dropzone */
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border hover:border-primary/50 rounded-xl p-14 flex flex-col items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
              />
              <Upload size={30} className="text-muted-foreground" />
              <div className="text-center">
                <p className="font-medium">Drop your resume here</p>
                <p className="text-sm text-muted-foreground mt-0.5">PDF, DOCX, or TXT</p>
              </div>
            </div>
          ) : (
            /* Paste textarea */
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Open your resume PDF, select all (Ctrl+A), copy, and paste below.
              </p>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste your full resume text here…"
                rows={10}
                className="w-full border rounded-lg p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background"
              />
              <button
                onClick={processPastedText}
                disabled={!pastedText.trim()}
                className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                <Sparkles size={15} /> Analyse with AI
              </button>
            </div>
          )}

          <p className="text-xs text-center text-muted-foreground">
            Stored only in your browser · processed by Groq API
          </p>
        </div>
      </div>
    )
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP: Review
  // ────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            <h1 className="text-xl font-bold">Resume parsed — review your profile</h1>
          </div>
          {summary && <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-1">
            <FileText size={11} /> {fileName}
            <button onClick={() => setStep("upload")} className="underline hover:no-underline ml-1">
              Replace
            </button>
          </p>
        </div>

        {/* Experience */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Experience</h2>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Years of experience</label>
              <Input
                type="number" min={0} max={40}
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="h-9 w-24"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Level</label>
              <div className="flex flex-wrap gap-2">
                {SENIORITY_OPTIONS.map(({ value, label, years }) => (
                  <button
                    key={value}
                    onClick={() => setSeniority(value)}
                    title={years}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      seniority === value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Target Roles */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Target roles <span className="text-xs font-normal normal-case text-muted-foreground">(what to search for)</span>
          </h2>
          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span key={r} className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {r}
                <button onClick={() => setRoles((p) => p.filter((x) => x !== r))} className="hover:text-destructive ml-0.5">
                  <X size={12} />
                </button>
              </span>
            ))}
            <div className="flex items-center gap-1">
              <Input
                placeholder="Add role…"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && roleInput.trim() && addRole(roleInput)}
                className="h-8 w-36 text-sm"
              />
              <button
                onClick={() => addRole(roleInput)}
                disabled={!roleInput.trim()}
                className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </section>

        {/* Skills */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Skills & technologies
            <span className="text-xs font-normal normal-case text-muted-foreground ml-1">({skills.length} detected)</span>
          </h2>
          <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
            {skills.map((s) => (
              <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs font-mono">
                {s}
                <button onClick={() => setSkills((p) => p.filter((x) => x !== s))} className="hover:text-destructive">
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Input
              placeholder="Add skill…"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && skillInput.trim()) addSkill(skillInput)
                if (e.key === "," && skillInput.trim()) { e.preventDefault(); addSkill(skillInput) }
              }}
              className="h-8 w-36 text-sm font-mono"
            />
            <button
              onClick={() => addSkill(skillInput)}
              disabled={!skillInput.trim()}
              className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
        </section>

        {/* Work type */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Work preference</h2>
          <div className="flex flex-wrap gap-2">
            {WORK_TYPES.map(({ value, label }) => {
              const active = workTypes.includes(value)
              return (
                <button
                  key={value}
                  onClick={() => toggleWorkType(value)}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                    active ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/40"
                  }`}
                >
                  {active && <CheckCircle2 size={13} className="text-primary" />}
                  {label}
                </button>
              )
            })}
          </div>
        </section>

        {/* Salary */}
        <section className="space-y-2">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Salary expectation <span className="text-xs font-normal normal-case">(optional)</span>
          </h2>
          <Input
            placeholder="e.g. $4000/mo or ₹20 LPA"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="h-9 max-w-xs"
          />
        </section>

        <div className="pt-2">
          <button
            onClick={handleSubmit}
            disabled={roles.length === 0 || skills.length === 0}
            className="flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            Find my jobs <ArrowRight size={16} />
          </button>
          {(roles.length === 0 || skills.length === 0) && (
            <p className="text-xs text-muted-foreground mt-2">Add at least one role and one skill to continue</p>
          )}
        </div>
      </div>
    </div>
  )
}
