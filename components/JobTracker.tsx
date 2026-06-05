"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import { Job, JobStatus, JobSource, UserPreferences, ApiKeys } from "@/lib/types"
import { getStatuses, setStatus, getCachedJobs, setCachedJobs, clearCache } from "@/lib/storage"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import {
  ExternalLink, RefreshCw, Bookmark, CheckCircle2, XCircle,
  Sparkles, Search, SlidersHorizontal, Loader2,
} from "lucide-react"

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<JobStatus, { label: string; icon: React.ReactNode; className: string }> = {
  new:     { label: "New",     icon: <Sparkles size={13} />,    className: "bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20" },
  saved:   { label: "Saved",   icon: <Bookmark size={13} />,    className: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20" },
  applied: { label: "Applied", icon: <CheckCircle2 size={13} />, className: "bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20" },
  skipped: { label: "Skip",    icon: <XCircle size={13} />,     className: "bg-zinc-500/10 text-zinc-500 border-zinc-500/20 hover:bg-zinc-500/20" },
}
const STATUS_CYCLE: JobStatus[] = ["new", "saved", "applied", "skipped"]

const SOURCE_LABELS: Record<JobSource, string> = {
  remoteok:     "RemoteOK",
  weworkremotely: "WWR",
  remotive:     "Remotive",
  arbeitnow:    "Arbeitnow",
  himalayas:    "Himalayas",
  jobicy:       "Jobicy",
  linkedin:     "LinkedIn",
  indeed:       "Indeed",
  naukri:       "Naukri",
  glassdoor:    "Glassdoor",
}

const SCRAPE_PLATFORMS: { id: string; label: string; flag: string }[] = [
  { id: "linkedin",  label: "LinkedIn",  flag: "🌐" },
  { id: "indeed",    label: "Indeed",    flag: "🔍" },
  { id: "naukri",    label: "Naukri",    flag: "🇮🇳" },
  { id: "glassdoor", label: "Glassdoor", flag: "🏢" },
]

// ─── Match scoring (0-100) ────────────────────────────────────────────────────

// Generic words that appear in almost every job title — useless for matching
const GENERIC_JOB_WORDS = new Set([
  "developer", "engineer", "manager", "specialist", "analyst",
  "lead", "senior", "junior", "staff", "principal", "associate",
  "intern", "architect", "consultant", "head", "director", "vp",
  "and", "the", "for", "with",
])

// Extract only the meaningful/domain-specific keywords from role names
function roleKeywords(roles: string[]): string[] {
  const words = new Set<string>()
  for (const r of roles) {
    r.toLowerCase().split(/[\s/,]+/).forEach((w) => {
      if (w.length > 2 && !GENERIC_JOB_WORDS.has(w)) words.add(w)
    })
  }
  return [...words]
}

function computeMatch(job: Job, prefs: UserPreferences): number {
  const titleLower = job.title.toLowerCase()
  const tagText    = job.tags.join(" ").toLowerCase()
  const fullText   = `${titleLower} ${tagText}`

  const userSkills  = prefs.skills.map((s) => s.toLowerCase())
  const userRoleKws = roleKeywords(prefs.roles)

  // ── Skill match — 0-50 pts (primary signal) ────────────────────────────────
  // Check how many of user's skills appear in title + tags
  const skillHits = userSkills.filter((s) => fullText.includes(s)).length
  // If the job has NO tags at all → neutral 8pts (not 20; can't know if relevant)
  const hasTags = job.tags.length > 0
  const skillScore = !hasTags
    ? 8
    : Math.min(50, (skillHits / Math.min(userSkills.length, 8)) * 50)

  // ── Role keyword match — 0-30 pts ──────────────────────────────────────────
  // Match individual words from role names against job title
  const roleHits = userRoleKws.filter((kw) => titleLower.includes(kw)).length
  const roleScore = Math.min(30, (roleHits / Math.max(userRoleKws.length, 1)) * 60)

  // ── Work type — 0-12 pts ───────────────────────────────────────────────────
  const wantAny = prefs.workTypes.includes("any")
  const jt = job.type.toLowerCase()
  let workScore = 0
  if (wantAny) {
    workScore = 12
  } else {
    if (prefs.workTypes.includes("remote")   && jt.includes("remote"))   workScore = 12
    if (prefs.workTypes.includes("contract") && (jt.includes("contract") || jt.includes("freelance"))) workScore = 12
    if (prefs.workTypes.includes("fulltime") && (jt.includes("full") || jt.includes("permanent")))     workScore = 12
  }

  // ── Seniority — 0-8 pts ────────────────────────────────────────────────────
  const sen = prefs.seniority ?? "mid"
  let senScore = 4
  if (sen === "fresher" || sen === "junior") {
    if (titleLower.includes("junior") || titleLower.includes("entry") || titleLower.includes("associate")) senScore = 8
    if (titleLower.includes("senior") || titleLower.includes("lead") || titleLower.includes("principal")) senScore = 0
  } else if (sen === "senior" || sen === "lead") {
    if (titleLower.includes("senior") || titleLower.includes("lead") || titleLower.includes("staff") || titleLower.includes("principal")) senScore = 8
    if (titleLower.includes("junior") || titleLower.includes("entry")) senScore = 0
  }

  const total = Math.round(skillScore + roleScore + workScore + senScore)

  // ── Hard zero: completely irrelevant ───────────────────────────────────────
  // If no skill match AND no role keyword in title → score 0 regardless
  if (skillHits === 0 && roleHits === 0) return 0

  return total
}

function MatchBadge({ score }: { score: number }) {
  if (score === 0) return <span className="text-xs text-muted-foreground">—</span>
  const cls =
    score >= 70 ? "bg-green-500/10 text-green-600 border-green-500/20" :
    score >= 40 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" :
                  "bg-zinc-100 text-zinc-400 border-zinc-200"
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border tabular-nums ${cls}`}>
      {score}%
    </span>
  )
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return "—"
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  preferences: UserPreferences
  apiKeys: ApiKeys
  onEditPrefs: () => void
}

export default function JobTracker({ preferences, apiKeys, onEditPrefs }: Props) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [statuses, setStatuses] = useState<Record<string, JobStatus>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<JobStatus | "all">("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [fetchedAt, setFetchedAt] = useState("")
  const [onlyMatching, setOnlyMatching] = useState(true)
  // Per-platform scrape state: null = idle, "loading" = in progress, "done"/"error" = finished
  const [scrapeState, setScrapeState] = useState<Record<string, "loading" | "done" | "error">>({})
  const [scrapeMsg,   setScrapeMsg]   = useState<Record<string, string>>({})
  const autoScrapedRef = useRef(false)

  const loadJobs = useCallback(async (force = false) => {
    if (!force) {
      const cached = getCachedJobs()
      if (cached) { setJobs(cached); setStatuses(getStatuses()); setLoading(false); return }
    }
    try {
      const res = await fetch("/api/jobs")
      if (!res.ok) throw new Error("Failed to fetch")
      const data = await res.json()
      setCachedJobs(data.jobs)
      setFetchedAt(data.fetchedAt)
      setJobs(data.jobs)
      setStatuses(getStatuses())
    } catch {
      setError("Could not load jobs. Check your connection.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // Auto-scrape all platforms once on first load (if not already cached)
  useEffect(() => {
    loadJobs().then(() => {
      setStatuses(getStatuses())
    })
  }, [loadJobs])

  useEffect(() => {
    if (loading || autoScrapedRef.current) return
    const hasApifyJobs = jobs.some(j =>
      (["linkedin", "indeed", "naukri", "glassdoor"] as JobSource[]).includes(j.source)
    )
    if (!hasApifyJobs) {
      autoScrapedRef.current = true
      // Scrape all 4 platforms in parallel automatically
      SCRAPE_PLATFORMS.forEach(({ id }) => scrapePlatform(id))
    }
  }, [loading, jobs.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = () => {
    setRefreshing(true)
    autoScrapedRef.current = false
    clearCache()
    loadJobs(true)
  }

  const scrapePlatform = async (platform: string) => {
    setScrapeState(s => ({ ...s, [platform]: "loading" }))
    setScrapeMsg(m => ({ ...m, [platform]: "" }))
    try {
      const res = await fetch("/api/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-apify-key": apiKeys.apify },
        body: JSON.stringify({ platform, roles: preferences.roles, skills: preferences.skills }),
      })
      const data = await res.json()
      const newJobs: Job[] = data.jobs ?? []
      const method: string = data.method ?? ""
      if (newJobs.length > 0) {
        setJobs(prev => {
          const ids = new Set(prev.map(j => j.id))
          const merged = [...prev, ...newJobs.filter(j => !ids.has(j.id))]
          setCachedJobs(merged)
          return merged
        })
        setScrapeMsg(m => ({ ...m, [platform]: `+${newJobs.length} via ${method}` }))
        setScrapeState(s => ({ ...s, [platform]: "done" }))
      } else {
        setScrapeMsg(m => ({ ...m, [platform]: data.error ? "failed" : "0 found" }))
        setScrapeState(s => ({ ...s, [platform]: data.error ? "error" : "done" }))
      }
    } catch (e) {
      setScrapeMsg(m => ({ ...m, [platform]: "error" }))
      setScrapeState(s => ({ ...s, [platform]: "error" }))
      console.error(`[scrape] ${platform}:`, e)
    }
  }

  const cycleStatus = (jobId: string) => {
    const current = statuses[jobId] ?? "new"
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length]
    setStatus(jobId, next)
    setStatuses((prev) => ({ ...prev, [jobId]: next }))
  }

  // ── Filter + Score + Sort ──────────────────────────────────────────────────
  const scoredJobs = useMemo(
    () => jobs.map((job) => ({ job, score: computeMatch(job, preferences) })),
    [jobs, preferences]
  )

  const filtered = useMemo(() => {
    const wantAny = preferences.workTypes.includes("any")
    const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000

    return scoredJobs
      .filter(({ job, score }) => {
        const jobStatus = statuses[job.id] ?? "new"
        if (tab !== "all" && jobStatus !== tab) return false
        if (sourceFilter !== "all" && job.source !== sourceFilter) return false
        if (onlyMatching && score < 30) return false

        // 15-day freshness filter — skip if date is known and older than 15 days
        if (job.postedAt) {
          const posted = new Date(job.postedAt).getTime()
          if (!isNaN(posted) && posted < cutoff) return false
        }

        if (!wantAny) {
          const jt = job.type.toLowerCase()
          const ok =
            (preferences.workTypes.includes("remote")   && jt.includes("remote")) ||
            (preferences.workTypes.includes("contract") && (jt.includes("contract") || jt.includes("freelance"))) ||
            (preferences.workTypes.includes("fulltime") && (jt.includes("full") || jt.includes("permanent")))
          if (!ok) return false
        }

        if (search) {
          const q = search.toLowerCase()
          return (
            job.title.toLowerCase().includes(q) ||
            job.company.toLowerCase().includes(q) ||
            job.tags.some((t) => t.toLowerCase().includes(q))
          )
        }
        return true
      })
      .sort((a, b) => b.score - a.score)
  }, [scoredJobs, statuses, tab, sourceFilter, search, onlyMatching, preferences])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: jobs.length, new: 0, saved: 0, applied: 0, skipped: 0 }
    jobs.forEach((job) => { const s = statuses[job.id] ?? "new"; c[s] = (c[s] ?? 0) + 1 })
    return c
  }, [jobs, statuses])

  const highMatchCount = useMemo(
    () => scoredJobs.filter(({ score }) => score >= 70).length,
    [scoredJobs]
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-3">
        <RefreshCw size={18} className="animate-spin" />
        <span>Fetching jobs from 6 sources…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-destructive">{error}</p>
        <button onClick={handleRefresh} className="text-sm underline">Retry</button>
      </div>
    )
  }

  return (
    <div className="space-y-4">

      {/* Preferences bar */}
      <div className="flex items-center gap-2 flex-wrap text-sm">
        <span className="text-muted-foreground text-xs">Profile:</span>
        {preferences.roles.slice(0, 3).map((r) => (
          <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
        ))}
        <Badge variant="outline" className="text-xs capitalize">{preferences.seniority ?? "mid"}</Badge>
        {preferences.experienceYears != null && (
          <span className="text-xs text-muted-foreground">{preferences.experienceYears}yr exp</span>
        )}
        {preferences.workTypes.map((wt) => (
          <Badge key={wt} variant="outline" className="text-xs capitalize">{wt}</Badge>
        ))}
        <span className="text-xs text-muted-foreground">{preferences.skills.length} skills</span>
        <button onClick={onEditPrefs} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">
          <SlidersHorizontal size={12} /> Edit profile
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
        <span><span className="font-semibold text-foreground">{jobs.length}</span> total</span>
        <span><span className="font-semibold text-green-600">{highMatchCount}</span> strong match (≥70%)</span>
        <span><span className="font-semibold text-foreground">{filtered.length}</span> shown</span>
        {onlyMatching && (
          <span className="text-xs">
            <span className="font-semibold text-muted-foreground">
              {scoredJobs.filter(({ score }) => score < 30).length}
            </span> irrelevant hidden
          </span>
        )}
      </div>

      {/* Platform scrape status — auto-triggered, also manually re-triggerable */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Sources:</span>
        {SCRAPE_PLATFORMS.map(({ id, label, flag }) => {
          const state = scrapeState[id]
          const msg   = scrapeMsg[id]
          return (
            <button
              key={id}
              onClick={() => scrapePlatform(id)}
              disabled={state === "loading"}
              title={msg || `Rescrape ${label}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-full transition-colors disabled:opacity-60 ${
                state === "done"    ? "border-green-500/40 text-green-600 bg-green-500/5" :
                state === "error"   ? "border-red-400/40 text-red-500 bg-red-500/5" :
                state === "loading" ? "border-primary/40 text-primary bg-primary/5" :
                "hover:bg-muted"
              }`}
            >
              {state === "loading"
                ? <Loader2 size={11} className="animate-spin" />
                : <span>{flag}</span>
              }
              {label}
              {msg && <span className="opacity-60">{msg}</span>}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search title, company, skill…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v ?? "all")}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="All sources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sources</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyMatching}
            onChange={(e) => setOnlyMatching(e.target.checked)}
            className="rounded"
          />
          <span className="text-muted-foreground">Relevant only</span>
        </label>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>

        {fetchedAt && (
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {new Date(fetchedAt).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList className="h-9">
          {(["all", "new", "saved", "applied", "skipped"] as const).map((t) => (
            <TabsTrigger key={t} value={t} className="gap-1.5 capitalize">
              {t === "all" ? "All" : STATUS_CONFIG[t].label}
              <span className="text-xs tabular-nums opacity-60">{counts[t] ?? 0}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-8 text-center">#</TableHead>
              <TableHead className="w-14 text-center">Match</TableHead>
              <TableHead className="w-[240px]">Role</TableHead>
              <TableHead className="w-[140px]">Company</TableHead>
              <TableHead className="hidden md:table-cell">Skills</TableHead>
              <TableHead className="hidden sm:table-cell w-[80px]">Location</TableHead>
              <TableHead className="hidden lg:table-cell w-[90px]">Salary</TableHead>
              <TableHead className="hidden sm:table-cell w-[70px]">Source</TableHead>
              <TableHead className="w-[72px]">Posted</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead className="w-[40px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                  No jobs match your filters
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(({ job, score }, rowIdx) => {
                const jobStatus = statuses[job.id] ?? "new"
                const cfg = STATUS_CONFIG[jobStatus]

                return (
                  <TableRow key={job.id} className={jobStatus === "skipped" ? "opacity-40" : undefined}>
                    <TableCell className="text-center text-xs text-muted-foreground tabular-nums">{rowIdx + 1}</TableCell>
                    <TableCell className="text-center"><MatchBadge score={score} /></TableCell>

                    <TableCell className="font-medium max-w-[240px]">
                      <span className="line-clamp-2 leading-snug text-sm">{job.title}</span>
                    </TableCell>

                    <TableCell className="text-muted-foreground text-sm max-w-[140px]">
                      <span className="truncate block">{job.company}</span>
                    </TableCell>

                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {job.tags.slice(0, 4).map((tag) => {
                          const isUserSkill = preferences.skills.some(
                            (s) => s.toLowerCase() === tag.toLowerCase()
                          )
                          return (
                            <Badge
                              key={tag}
                              variant={isUserSkill ? "default" : "secondary"}
                              className={`text-[11px] py-0 px-1.5 font-normal ${isUserSkill ? "opacity-90" : ""}`}
                            >
                              {tag}
                            </Badge>
                          )
                        })}
                      </div>
                    </TableCell>

                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      <span className="truncate block max-w-[80px]">{job.location}</span>
                    </TableCell>

                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {job.salary ?? "—"}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline" className="text-[11px] py-0 px-1.5 font-normal whitespace-nowrap">
                        {SOURCE_LABELS[job.source] ?? job.source}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {timeAgo(job.postedAt)}
                    </TableCell>

                    <TableCell>
                      <button
                        onClick={() => cycleStatus(job.id)}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-colors ${cfg.className}`}
                      >
                        {cfg.icon}{cfg.label}
                      </button>
                    </TableCell>

                    <TableCell>
                      <a
                        href={job.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink size={14} />
                      </a>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground text-right">
        {filtered.length} shown · sorted by match score · click status badge to cycle
      </p>
    </div>
  )
}
