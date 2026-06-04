"use client"

import { useState, useRef } from "react"
import { UserPreferences, WorkType, Seniority, ApiKeys } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Upload, CheckCircle2, Loader2, X, Plus,
  FileText, Pencil, ArrowRight, Sparkles,
} from "lucide-react"

interface Props {
  onComplete: (prefs: UserPreferences) => void
  apiKeys: ApiKeys
}

// ─── PDF extractor (server-side, no worker needed) ───────────────────────────
async function extractText(file: File): Promise<string> {
  const formData = new FormData()
  formData.append("file", file)
  const res = await fetch("/api/extract-text", { method: "POST", body: formData })
  if (!res.ok) throw new Error(await res.text())
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.text as string
}

const SENIORITY_OPTIONS: { value: Seniority; label: string; years: string }[] = [
  { value: "fresher", label: "Fresher",       years: "0 years" },
  { value: "junior",  label: "Junior",         years: "1–2 years" },
  { value: "mid",     label: "Mid-level",      years: "3–5 years" },
  { value: "senior",  label: "Senior",         years: "6–9 years" },
  { value: "lead",    label: "Lead / Staff",   years: "10+ years" },
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
  const [rawText, setRawText] = useState("")
  const [fileName, setFileName] = useState("")
  const [summary, setSummary] = useState("")

  // Editable parsed fields
  const [roles, setRoles] = useState<string[]>([])
  const [skills, setSkills] = useState<string[]>([])
  const [workTypes, setWorkTypes] = useState<WorkType[]>(["remote"])
  const [seniority, setSeniority] = useState<Seniority>("mid")
  const [experienceYears, setExperienceYears] = useState(0)
  const [salary, setSalary] = useState("")

  // Inline add inputs
  const [roleInput, setRoleInput] = useState("")
  const [skillInput, setSkillInput] = useState("")

  const fileRef = useRef<HTMLInputElement>(null)

  // ── File processing ──────────────────────────────────────────────────────────
  const processFile = async (file: File) => {
    setParseError("")
    setFileName(file.name)
    setStep("parsing")

    try {
      const text = await extractText(file)
      setRawText(text)

      const res = await fetch("/api/parse-resume", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-groq-key": apiKeys.groq },
        body: JSON.stringify({ text }),
      })

      if (!res.ok) throw new Error(await res.text())
      const parsed = await res.json()

      // Populate all fields from AI response
      setRoles(parsed.roles ?? [])
      setSkills([
        ...new Set([...(parsed.skills ?? [])]),
      ])
      setSeniority(parsed.seniority ?? "mid")
      setExperienceYears(parsed.experience_years ?? 0)
      setSummary(parsed.summary ?? "")
      setSalary(parsed.salary_expectation ?? "")

      const wt: WorkType[] = parsed.work_type_preference?.length
        ? parsed.work_type_preference
        : ["remote"]
      setWorkTypes(wt)

      setStep("review")
    } catch (e) {
      setParseError(`Could not parse resume: ${String(e).slice(0, 120)}`)
      setStep("upload")
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  // ── Chip helpers ─────────────────────────────────────────────────────────────
  const addRole = (v: string) => {
    const t = v.trim()
    if (t && !roles.includes(t)) setRoles((p) => [...p, t])
    setRoleInput("")
  }
  const addSkill = (v: string) => {
    const t = v.trim()
    if (t && !skills.includes(t)) setSkills((p) => [...p, t])
    setSkillInput("")
  }
  const toggleWorkType = (wt: WorkType) => {
    if (wt === "any") { setWorkTypes(["any"]); return }
    setWorkTypes((prev) => {
      const without = prev.filter((x) => x !== "any")
      return without.includes(wt) ? without.filter((x) => x !== wt) : [...without, wt]
    })
  }

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = () => {
    onComplete({
      roles,
      skills,
      workTypes: workTypes.length ? workTypes : ["any"],
      experienceYears,
      seniority,
      salaryExpectation: salary || undefined,
      resumeText: rawText || undefined,
      resumeName: fileName || undefined,
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Upload
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto">
              <FileText size={22} className="text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">Upload your resume</h1>
            <p className="text-muted-foreground text-sm leading-relaxed">
              We'll parse it with AI and auto-fill your profile — roles, skills, experience, everything.
              No manual typing.
            </p>
          </div>

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
            <Upload size={32} className="text-muted-foreground" />
            <div className="text-center">
              <p className="font-medium">Drop your resume here</p>
              <p className="text-sm text-muted-foreground mt-1">PDF, DOCX, or TXT · Stored only in your browser</p>
            </div>
          </div>

          {parseError && (
            <p className="text-sm text-destructive text-center">{parseError}</p>
          )}

          <p className="text-xs text-center text-muted-foreground">
            Powered by Groq Llama 3 · Your resume never leaves your browser except to Groq's API
          </p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Parsing
  // ─────────────────────────────────────────────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-muted flex items-center justify-center">
              <Sparkles size={24} className="text-primary" />
            </div>
            <Loader2 size={64} className="animate-spin text-primary absolute inset-0 opacity-20" />
          </div>
          <div>
            <p className="font-semibold text-lg">Reading your resume…</p>
            <p className="text-muted-foreground text-sm mt-1">
              Groq AI is extracting your skills, experience, and roles
            </p>
            <p className="text-xs text-muted-foreground mt-1">{fileName}</p>
          </div>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Step: Review
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-green-500" />
            <h1 className="text-xl font-bold">Resume parsed — review your profile</h1>
          </div>
          {summary && <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>}
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <FileText size={12} /> {fileName}
            <button
              onClick={() => setStep("upload")}
              className="underline hover:no-underline ml-1"
            >
              Replace
            </button>
          </p>
        </div>

        {/* Experience */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Experience</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Years of experience</label>
              <Input
                type="number"
                min={0}
                max={40}
                value={experienceYears}
                onChange={(e) => setExperienceYears(Number(e.target.value))}
                className="h-9 w-28"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Level</label>
              <div className="flex flex-wrap gap-2">
                {SENIORITY_OPTIONS.map(({ value, label, years }) => (
                  <button
                    key={value}
                    onClick={() => setSeniority(value)}
                    className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                      seniority === value
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border hover:border-muted-foreground/40"
                    }`}
                    title={years}
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
            Target roles <span className="text-xs font-normal normal-case">(what to search for)</span>
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
            Skills & technologies <span className="text-xs font-normal normal-case">({skills.length} detected)</span>
          </h2>
          <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
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

        {/* Salary expectation */}
        <section className="space-y-3">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Salary expectation <span className="text-xs font-normal normal-case">(optional — used to filter jobs)</span>
          </h2>
          <Input
            placeholder="e.g. $4000/mo or ₹20 LPA"
            value={salary}
            onChange={(e) => setSalary(e.target.value)}
            className="h-9 max-w-xs"
          />
        </section>

        {/* Submit */}
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
