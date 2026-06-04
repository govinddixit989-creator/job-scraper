"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
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

// Platforms scraped via Apify, shown as buttons
const APIFY_PLATFORMS: { id: string; label: string; flag: string }[] = [
  { id: "linkedin",  label: "LinkedIn",  flag: "🌐" },
  { id: "indeed",    label: "Indeed",    flag: "🔍" },
  { id: "naukri",    label: "Naukri",    flag: "🇮🇳" },
  { id: "glassdoor", label: "Glassdoor", flag: "🏢" },
]

// ─── Match scoring (0-100) ────────────────────────────────────────────────────
function computeMatch(job: Job, prefs: UserPreferences): number {
  const text = `${job.title} ${job.tags.join(" ")} ${job.company}`.toLowerCase()
  const userSkills = prefs.skills.map((s) => s.toLowerCase())
  const userRoles  = prefs.roles.map((r) => r.toLowerCase())

  // Role match — 0-40 pts
  const roleHits = userRoles.filter((r) => text.includes(r)).length
  const roleScore = Math.min(40, roleHits * (40 / Math.max(userRoles.length, 1)))

  // Skill match — 0-40 pts
  const skillHits = userSkills.filter((s) => text.includes(s)).length
  const skillScore = userSkills.length
    ? Math.min(40, (skillHits / userSkills.length) * 40)
    : 20 // neutral if no skills set

  // Work type match — 0-20 pts
  const wantAny = prefs.workTypes.includes("any")
  const jt = job.type.toLowerCase()
  let workScore = 0
  if (wantAny) {
    workScore = 20
  } else {
    if (prefs.workTypes.includes("remote")   && jt.includes("remote"))   workScore = 20
    if (prefs.workTypes.includes("contract") && (jt.includes("contract") || jt.includes("freelance"))) workScore = 20
    if (prefs.workTypes.includes("fulltime") && (jt.includes("full") || jt.includes("permanent")))     workScore = 20
  }

  return Math.round(roleScore + skillScore + workScore)
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
  const [scrapingPlatform, setScrapingPlatform] = useState<string | null>(null)
  const [scrapeMsg, setScrapeMsg] = useState("")
  const [onlyMatching, setOnlyMatching] = useState(false)

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

  useEffect(() => { loadJobs(); setStatuses(getStatuses()) }, [loadJobs])

  const handleRefresh = () => { setRefreshing(true); clearCache(); loadJobs(true) }

  const scrapeApify = async (platform: string) => {
    setScrapingPlatform(platform)
    setScrapeMsg(`Scraping ${SOURCE_LABELS[platform as JobSource] ?? platform}… (~2 min)`)
    try {
      const res = await fetch("/api/apify-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-apify-key": apiKeys.apify },
        body: JSON.stringify({ platform, roles: preferences.roles, skills: preferences.skills }),
      })
      const data = await res.json()
      if (!res.ok) { setScrapeMsg(`Error: ${data.error?.slice(0, 80)}`); return }
      const newJobs: Job[] = data.jobs ?? []
      if (newJobs.length > 0) {
        setJobs((prev) => {
          const ids = new Set(prev.map((j) => j.id))
          const merged = [...prev, ...newJobs.filter((j) => !ids.has(j.id))]
          setCachedJobs(merged)
          return merged
        })
        setScrapeMsg(`✓ Added ${newJobs.length} jobs from ${SOURCE_LABELS[platform as JobSource]}`)
      } else {
        setScrapeMsg("No new jobs found")
      }
    } catch (e) {
      setScrapeMsg(`Error: ${String(e).slice(0, 80)}`)
    } finally {
      setScrapingPlatform(null)
      setTimeout(() => setScrapeMsg(""), 5000)
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

    return scoredJobs
      .filter(({ job, score }) => {
        const jobStatus = statuses[job.id] ?? "new"
        if (tab !== "all" && jobStatus !== tab) return false
        if (sourceFilter !== "all" && job.source !== sourceFilter) return false
        if (onlyMatching && score < 40) return false

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
        <span className="text-muted-foreground text-xs">Filtering for:</span>
        {preferences.roles.map((r) => (
          <Badge key={r} variant="secondary" className="text-xs">{r}</Badge>
        ))}
        {preferences.workTypes.map((wt) => (
          <Badge key={wt} variant="outline" className="text-xs capitalize">{wt}</Badge>
        ))}
        {preferences.skills.slice(0, 5).map((s) => (
          <span key={s} className="text-xs text-muted-foreground font-mono">{s}</span>
        ))}
        {preferences.skills.length > 5 && (
          <span className="text-xs text-muted-foreground">+{preferences.skills.length - 5} skills</span>
        )}
        <button onClick={onEditPrefs} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-auto">
          <SlidersHorizontal size={12} /> Edit
        </button>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span><span className="font-semibold text-foreground">{jobs.length}</span> total jobs</span>
        <span><span className="font-semibold text-green-600">{highMatchCount}</span> high match (≥70%)</span>
        <span><span className="font-semibold text-foreground">{filtered.length}</span> shown</span>
      </div>

      {/* Apify scrape buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Scrape more:</span>
        {APIFY_PLATFORMS.map(({ id, label, flag }) => (
          <button
            key={id}
            onClick={() => scrapeApify(id)}
            disabled={scrapingPlatform !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-full hover:bg-muted transition-colors disabled:opacity-50"
          >
            {scrapingPlatform === id
              ? <Loader2 size={11} className="animate-spin" />
              : <span>{flag}</span>
            }
            {label}
          </button>
        ))}
        {scrapeMsg && <span className="text-xs text-muted-foreground">{scrapeMsg}</span>}
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
          <span className="text-muted-foreground">Only matching (≥40%)</span>
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
