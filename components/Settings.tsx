"use client"

import { useState } from "react"
import { ApiKeys, UserPreferences, WorkType, Seniority } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Separator } from "@/components/ui/separator"
import {
  Eye, EyeOff, X, Plus, CheckCircle2,
  Key, User, ArrowLeft, Save,
} from "lucide-react"

interface Props {
  apiKeys: ApiKeys
  preferences: UserPreferences
  onSaveKeys: (keys: ApiKeys) => void
  onSavePrefs: (prefs: UserPreferences) => void
  onBack: () => void
}

const SENIORITY_OPTIONS: { value: Seniority; label: string; years: string }[] = [
  { value: "fresher", label: "Fresher",     years: "0 yr" },
  { value: "junior",  label: "Junior",      years: "1–2 yr" },
  { value: "mid",     label: "Mid",         years: "3–5 yr" },
  { value: "senior",  label: "Senior",      years: "6–9 yr" },
  { value: "lead",    label: "Lead",        years: "10+ yr" },
]

const WORK_TYPES: { value: WorkType; label: string }[] = [
  { value: "remote",   label: "Remote" },
  { value: "fulltime", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "any",      label: "Any" },
]

export default function Settings({ apiKeys, preferences, onSaveKeys, onSavePrefs, onBack }: Props) {
  const [tab, setTab] = useState<"keys" | "profile">("keys")

  // ── Keys state ──────────────────────────────────────────────────────────────
  const [groq,  setGroq]  = useState(apiKeys.groq)
  const [apify, setApify] = useState(apiKeys.apify)
  const [showGroq,  setShowGroq]  = useState(false)
  const [showApify, setShowApify] = useState(false)
  const [keysSaved, setKeysSaved] = useState(false)

  const canSaveKeys = groq.trim().startsWith("gsk_") && apify.trim().startsWith("apify_api_")

  const handleSaveKeys = () => {
    onSaveKeys({ groq: groq.trim(), apify: apify.trim() })
    setKeysSaved(true)
    setTimeout(() => setKeysSaved(false), 2000)
  }

  // ── Profile state ───────────────────────────────────────────────────────────
  const [roles,          setRoles]          = useState<string[]>(preferences.roles)
  const [skills,         setSkills]         = useState<string[]>(preferences.skills)
  const [workTypes,      setWorkTypes]      = useState<WorkType[]>(preferences.workTypes)
  const [seniority,      setSeniority]      = useState<Seniority>(preferences.seniority ?? "mid")
  const [experienceYears, setExperienceYears] = useState(preferences.experienceYears ?? 0)
  const [salary,         setSalary]         = useState(preferences.salaryExpectation ?? "")
  const [roleInput,  setRoleInput]  = useState("")
  const [skillInput, setSkillInput] = useState("")
  const [prefsSaved, setPrefsSaved] = useState(false)

  const addRole  = (v: string) => { const t = v.trim(); if (t && !roles.includes(t))  setRoles(p  => [...p, t]); setRoleInput("") }
  const addSkill = (v: string) => { const t = v.trim(); if (t && !skills.includes(t)) setSkills(p => [...p, t]); setSkillInput("") }

  const toggleWorkType = (wt: WorkType) => {
    if (wt === "any") { setWorkTypes(["any"]); return }
    setWorkTypes(prev => {
      const w = prev.filter(x => x !== "any")
      return w.includes(wt) ? w.filter(x => x !== wt) : [...w, wt]
    })
  }

  const handleSavePrefs = () => {
    onSavePrefs({
      ...preferences,
      roles, skills,
      workTypes: workTypes.length ? workTypes : ["any"],
      seniority, experienceYears,
      salaryExpectation: salary || undefined,
    })
    setPrefsSaved(true)
    setTimeout(() => setPrefsSaved(false), 2000)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={15} /> Back to jobs
          </button>
        </div>

        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage your API keys and job search profile</p>
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
          <TabsList className="h-9">
            <TabsTrigger value="keys"    className="gap-1.5"><Key  size={13} /> API Keys</TabsTrigger>
            <TabsTrigger value="profile" className="gap-1.5"><User size={13} /> Profile</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* ── KEYS TAB ─────────────────────────────────────────────────────── */}
        {tab === "keys" && (
          <div className="space-y-6">
            <div className="border rounded-xl p-6 space-y-5">

              {/* Groq */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Groq API Key</label>
                  <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    console.groq.com ↗
                  </a>
                </div>
                <div className="relative flex items-center">
                  <Input
                    type={showGroq ? "text" : "password"}
                    value={groq}
                    onChange={e => setGroq(e.target.value)}
                    className="pr-10 font-mono text-sm"
                    placeholder="gsk_..."
                  />
                  <button onClick={() => setShowGroq(v => !v)} tabIndex={-1}
                    className="absolute right-2 text-muted-foreground hover:text-foreground">
                    {showGroq ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {groq && !groq.startsWith("gsk_") && (
                  <p className="text-xs text-destructive">Should start with gsk_</p>
                )}
              </div>

              <Separator />

              {/* Apify */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Apify API Key</label>
                  <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                    console.apify.com ↗
                  </a>
                </div>
                <div className="relative flex items-center">
                  <Input
                    type={showApify ? "text" : "password"}
                    value={apify}
                    onChange={e => setApify(e.target.value)}
                    className="pr-10 font-mono text-sm"
                    placeholder="apify_api_..."
                  />
                  <button onClick={() => setShowApify(v => !v)} tabIndex={-1}
                    className="absolute right-2 text-muted-foreground hover:text-foreground">
                    {showApify ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {apify && !apify.startsWith("apify_api_") && (
                  <p className="text-xs text-destructive">Should start with apify_api_</p>
                )}
              </div>
            </div>

            <button
              onClick={handleSaveKeys}
              disabled={!canSaveKeys}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {keysSaved ? <CheckCircle2 size={15} /> : <Save size={15} />}
              {keysSaved ? "Saved!" : "Save keys"}
            </button>
          </div>
        )}

        {/* ── PROFILE TAB ──────────────────────────────────────────────────── */}
        {tab === "profile" && (
          <div className="space-y-7">

            {/* Experience */}
            <section className="space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Experience</h2>
              <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Years</label>
                  <Input
                    type="number" min={0} max={40}
                    value={experienceYears}
                    onChange={e => setExperienceYears(Number(e.target.value))}
                    className="h-9 w-24"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Level</label>
                  <div className="flex flex-wrap gap-2">
                    {SENIORITY_OPTIONS.map(({ value, label, years }) => (
                      <button key={value} onClick={() => setSeniority(value)} title={years}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                          seniority === value
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border hover:border-muted-foreground/40"
                        }`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <Separator />

            {/* Roles */}
            <section className="space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Target roles</h2>
              <div className="flex flex-wrap gap-2">
                {roles.map(r => (
                  <span key={r} className="flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                    {r}
                    <button onClick={() => setRoles(p => p.filter(x => x !== r))} className="hover:text-destructive ml-0.5">
                      <X size={12} />
                    </button>
                  </span>
                ))}
                <div className="flex items-center gap-1">
                  <Input
                    placeholder="Add role…"
                    value={roleInput}
                    onChange={e => setRoleInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && roleInput.trim() && addRole(roleInput)}
                    className="h-8 w-36 text-sm"
                  />
                  <button onClick={() => addRole(roleInput)} disabled={!roleInput.trim()}
                    className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40">
                    <Plus size={14} />
                  </button>
                </div>
              </div>
            </section>

            <Separator />

            {/* Skills */}
            <section className="space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Skills <span className="text-xs font-normal normal-case text-muted-foreground">({skills.length})</span>
              </h2>
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {skills.map(s => (
                  <span key={s} className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded-md text-xs font-mono">
                    {s}
                    <button onClick={() => setSkills(p => p.filter(x => x !== s))} className="hover:text-destructive">
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Add skill…"
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && skillInput.trim()) addSkill(skillInput)
                    if (e.key === "," && skillInput.trim()) { e.preventDefault(); addSkill(skillInput) }
                  }}
                  className="h-8 w-36 text-sm font-mono"
                />
                <button onClick={() => addSkill(skillInput)} disabled={!skillInput.trim()}
                  className="h-8 w-8 flex items-center justify-center rounded-md border hover:bg-muted disabled:opacity-40">
                  <Plus size={14} />
                </button>
              </div>
            </section>

            <Separator />

            {/* Work type */}
            <section className="space-y-3">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Work preference</h2>
              <div className="flex flex-wrap gap-2">
                {WORK_TYPES.map(({ value, label }) => {
                  const active = workTypes.includes(value)
                  return (
                    <button key={value} onClick={() => toggleWorkType(value)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border-2 text-sm transition-all ${
                        active ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/40"
                      }`}>
                      {active && <CheckCircle2 size={13} className="text-primary" />}
                      {label}
                    </button>
                  )
                })}
              </div>
            </section>

            <Separator />

            {/* Salary */}
            <section className="space-y-2">
              <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
                Salary expectation <span className="text-xs font-normal normal-case">(optional)</span>
              </h2>
              <Input
                placeholder="e.g. $4000/mo or ₹20 LPA"
                value={salary}
                onChange={e => setSalary(e.target.value)}
                className="h-9 max-w-xs"
              />
            </section>

            <button
              onClick={handleSavePrefs}
              disabled={roles.length === 0 || skills.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-all"
            >
              {prefsSaved ? <CheckCircle2 size={15} /> : <Save size={15} />}
              {prefsSaved ? "Saved!" : "Save profile"}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
