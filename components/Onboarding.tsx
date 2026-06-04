"use client"

import { useState, useRef } from "react"
import { UserPreferences, WorkType, ApiKeys } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  FileText,
  X,
  Plus,
  Upload,
  CheckCircle2,
  Briefcase,
  Cpu,
  ArrowRight,
  Loader2,
} from "lucide-react"

interface Props {
  onComplete: (prefs: UserPreferences) => void
  apiKeys: ApiKeys
}

const WORK_TYPE_OPTIONS: { value: WorkType; label: string; desc: string }[] = [
  { value: "remote", label: "Remote", desc: "Work from anywhere" },
  { value: "fulltime", label: "Full-time", desc: "Permanent role" },
  { value: "contract", label: "Contract", desc: "Fixed term / freelance" },
  { value: "any", label: "Any", desc: "Show everything" },
]

const SUGGESTED_ROLES = [
  "Frontend Developer", "Backend Developer", "Full Stack Developer",
  "React Developer", "Node.js Developer", "Python Developer",
  "DevOps Engineer", "Data Engineer", "Mobile Developer",
]

const SUGGESTED_SKILLS = [
  "React", "TypeScript", "Node.js", "Python", "Next.js",
  "PostgreSQL", "Docker", "AWS", "GraphQL", "Go",
]

async function extractPdfText(file: File): Promise<string> {
  // Dynamically import pdfjs to avoid SSR issues
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ""
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((item) => ("str" in item ? item.str : "")).join(" ") + "\n"
  }
  return text
}

function extractSkillsFromText(text: string, knownSkills: string[]): string[] {
  const lower = text.toLowerCase()
  const found = knownSkills.filter((s) => lower.includes(s.toLowerCase()))
  // Also pull capitalised words that look like tech (2-20 chars, no spaces)
  const techPattern = /\b[A-Z][a-zA-Z.+#]{1,19}\b/g
  const extras = [...new Set(text.match(techPattern) ?? [])]
    .filter((w) => w.length > 2 && !["The", "And", "For", "With", "From", "This", "That"].includes(w))
    .slice(0, 20)
  return [...new Set([...found, ...extras])]
}

const ALL_KNOWN_SKILLS = [
  "React", "TypeScript", "JavaScript", "Node.js", "Python", "Go", "Rust",
  "Java", "Kotlin", "Swift", "Next.js", "Vue", "Angular", "Svelte",
  "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch",
  "Docker", "Kubernetes", "AWS", "GCP", "Azure", "Terraform",
  "GraphQL", "REST", "gRPC", "Kafka", "RabbitMQ",
  "Django", "FastAPI", "Flask", "Express", "NestJS",
  "React Native", "Flutter", "Android", "iOS",
]

export default function Onboarding({ onComplete, apiKeys }: Props) {
  const [step, setStep] = useState(0)
  const [roles, setRoles] = useState<string[]>([])
  const [roleInput, setRoleInput] = useState("")
  const [skills, setSkills] = useState<string[]>([])
  const [skillInput, setSkillInput] = useState("")
  const [workTypes, setWorkTypes] = useState<WorkType[]>(["remote"])
  const [resumeText, setResumeText] = useState("")
  const [resumeName, setResumeFileName] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  // ── Step 0: Roles ──────────────────────────────────────────────────────────
  const addRole = (r: string) => {
    const trimmed = r.trim()
    if (trimmed && !roles.includes(trimmed)) setRoles((p) => [...p, trimmed])
    setRoleInput("")
  }

  const removeRole = (r: string) => setRoles((p) => p.filter((x) => x !== r))

  // ── Step 1: Work type ──────────────────────────────────────────────────────
  const toggleWorkType = (wt: WorkType) => {
    if (wt === "any") { setWorkTypes(["any"]); return }
    setWorkTypes((prev) => {
      const without = prev.filter((x) => x !== "any")
      return without.includes(wt) ? without.filter((x) => x !== wt) : [...without, wt]
    })
  }

  // ── Step 2: Skills ─────────────────────────────────────────────────────────
  const addSkill = (s: string) => {
    const trimmed = s.trim()
    if (trimmed && !skills.includes(trimmed)) setSkills((p) => [...p, trimmed])
    setSkillInput("")
  }

  const removeSkill = (s: string) => setSkills((p) => p.filter((x) => x !== s))

  // ── Step 3: Resume ─────────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setParseError("")
    setParsing(true)
    setResumeFileName(file.name)
    try {
      // Extract raw text client-side
      let text = ""
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        text = await extractPdfText(file)
      } else {
        text = await file.text()
      }
      setResumeText(text)

      // Use Groq AI to parse resume properly
      const res = await fetch("/api/parse-resume", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-groq-key": apiKeys.groq,
        },
        body: JSON.stringify({ text }),
      })

      if (res.ok) {
        const parsed = await res.json()
        // Merge AI-extracted skills + roles into user's profile
        const aiSkills: string[] = [...(parsed.skills ?? []), ...(parsed.technologies ?? [])]
        const aiRoles: string[] = parsed.roles ?? []
        setSkills((prev) => [...new Set([...prev, ...aiSkills])])
        if (aiRoles.length > 0 && roles.length === 0) {
          setRoles(aiRoles.slice(0, 3))
        }
      } else {
        // Fallback to heuristic extraction
        const detected = extractSkillsFromText(text, ALL_KNOWN_SKILLS)
        setSkills((prev) => [...new Set([...prev, ...detected])])
      }
    } catch {
      setParseError("Could not read file. Try a plain PDF or paste your skills manually.")
    } finally {
      setParsing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Finish ─────────────────────────────────────────────────────────────────
  const finish = () => {
    onComplete({
      roles,
      skills,
      workTypes: workTypes.length ? workTypes : ["any"],
      resumeText: resumeText || undefined,
      resumeName: resumeName || undefined,
    })
  }

  const canNext = [
    roles.length > 0,
    workTypes.length > 0,
    skills.length > 0,
    true, // resume is optional
  ]

  const STEPS = ["Roles", "Work type", "Skills", "Resume"]

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-10">
          {STEPS.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col gap-1">
              <div className={`h-1 rounded-full transition-all duration-300 ${i <= step ? "bg-primary" : "bg-muted"}`} />
              <span className={`text-[10px] ${i === step ? "text-foreground" : "text-muted-foreground"}`}>{s}</span>
            </div>
          ))}
        </div>

        {/* ── Step 0: Roles ── */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Briefcase size={18} className="text-primary" />
                <h2 className="text-2xl font-bold">What roles are you looking for?</h2>
              </div>
              <p className="text-muted-foreground text-sm">Add one or more job titles you want to find.</p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="e.g. React Developer"
                value={roleInput}
                onChange={(e) => setRoleInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && roleInput.trim() && addRole(roleInput)}
                className="flex-1"
                autoFocus
              />
              <button
                onClick={() => addRole(roleInput)}
                disabled={!roleInput.trim()}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Plus size={16} />
              </button>
            </div>

            {roles.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => (
                  <span key={r} className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                    {r}
                    <button onClick={() => removeRole(r)} className="hover:text-destructive"><X size={12} /></button>
                  </span>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2">Suggestions</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_ROLES.filter((r) => !roles.includes(r)).map((r) => (
                  <button
                    key={r}
                    onClick={() => addRole(r)}
                    className="px-3 py-1 border rounded-full text-sm hover:bg-muted transition-colors"
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 1: Work type ── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold mb-1">How do you want to work?</h2>
              <p className="text-muted-foreground text-sm">Select all that apply.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {WORK_TYPE_OPTIONS.map(({ value, label, desc }) => {
                const active = workTypes.includes(value)
                return (
                  <button
                    key={value}
                    onClick={() => toggleWorkType(value)}
                    className={`flex flex-col items-start gap-1 p-4 rounded-xl border-2 transition-all text-left ${
                      active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="font-semibold">{label}</span>
                      {active && <CheckCircle2 size={16} className="text-primary" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Step 2: Skills ── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={18} className="text-primary" />
                <h2 className="text-2xl font-bold">Your tech stack</h2>
              </div>
              <p className="text-muted-foreground text-sm">Jobs are filtered and sorted by these. Add your core skills.</p>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="e.g. React, Python…"
                value={skillInput}
                onChange={(e) => setSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && skillInput.trim()) addSkill(skillInput)
                  if (e.key === "," && skillInput.trim()) { e.preventDefault(); addSkill(skillInput) }
                }}
                autoFocus
              />
              <button
                onClick={() => addSkill(skillInput)}
                disabled={!skillInput.trim()}
                className="px-3 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-40 hover:opacity-90 transition-opacity"
              >
                <Plus size={16} />
              </button>
            </div>

            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => (
                  <span key={s} className="flex items-center gap-1 px-2.5 py-1 bg-primary/10 text-primary rounded-full text-sm font-mono">
                    {s}
                    <button onClick={() => removeSkill(s)} className="hover:text-destructive"><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}

            <div>
              <p className="text-xs text-muted-foreground mb-2">Quick add</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_SKILLS.filter((s) => !skills.includes(s)).map((s) => (
                  <button
                    key={s}
                    onClick={() => addSkill(s)}
                    className="px-2.5 py-1 border rounded-full text-sm font-mono hover:bg-muted transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 3: Resume ── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <FileText size={18} className="text-primary" />
                <h2 className="text-2xl font-bold">Upload your resume</h2>
              </div>
              <p className="text-muted-foreground text-sm">
                Optional — we'll extract your skills to improve job filtering. Stored only in your browser.
              </p>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-colors ${
                resumeName ? "border-primary/40 bg-primary/5" : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
              }`}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
              {parsing ? (
                <>
                  <Loader2 size={28} className="animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Reading resume…</p>
                </>
              ) : resumeName ? (
                <>
                  <CheckCircle2 size={28} className="text-green-500" />
                  <p className="text-sm font-medium">{resumeName}</p>
                  <p className="text-xs text-muted-foreground">Skills extracted and merged into your profile</p>
                </>
              ) : (
                <>
                  <Upload size={28} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Drag & drop or click to upload</p>
                  <p className="text-xs text-muted-foreground">PDF, DOCX, or TXT</p>
                </>
              )}
            </div>

            {parseError && <p className="text-sm text-destructive">{parseError}</p>}

            {skills.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Skills detected from resume</p>
                <div className="flex flex-wrap gap-2">
                  {skills.slice(0, 20).map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-10">
          {step > 0 ? (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              ← Back
            </button>
          ) : <span />}

          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canNext[step]}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Continue <ArrowRight size={15} />
            </button>
          ) : (
            <button
              onClick={finish}
              disabled={parsing}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              Find my jobs <ArrowRight size={15} />
            </button>
          )}
        </div>

        {step === 3 && (
          <button onClick={finish} className="w-full text-center text-xs text-muted-foreground mt-4 hover:text-foreground transition-colors">
            Skip for now
          </button>
        )}
      </div>
    </div>
  )
}
