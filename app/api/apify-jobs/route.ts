import { NextRequest, NextResponse } from "next/server"
import { Job } from "@/lib/types"

// ─── Apify actor IDs ──────────────────────────────────────────────────────────
const ACTORS: Record<string, string> = {
  linkedin: "hKByXkMQaC5Qt9UMN",                // LinkedIn Jobs Scraper
  indeed:   "misceres/indeed-scraper",            // Indeed Scraper
  naukri:   "zuzka/naukri-jobs-scraper",          // Naukri Scraper
  glassdoor: "bebity/glassdoor-jobs-scraper",     // Glassdoor Jobs
  internshala: "apify/web-scraper",               // Generic for Internshala
}

// ─── Platform input builders ──────────────────────────────────────────────────
function buildInput(platform: string, roles: string[], skills: string[]): Record<string, unknown> {
  const query = [...roles, ...skills.slice(0, 3)].slice(0, 3).join(" ")

  switch (platform) {
    case "linkedin":
      return {
        searchTerms: roles.slice(0, 3).map((r) => `${r} remote`),
        location: "Worldwide",
        maxResults: 50,
        proxy: { useApifyProxy: true },
      }
    case "indeed":
      return {
        position: query,
        country: "IN",
        maxItems: 50,
        proxy: { useApifyProxy: true },
      }
    case "naukri":
      return {
        keyword: roles.slice(0, 2).join(" "),
        location: "Work from Home",
        maxJobs: 50,
      }
    case "glassdoor":
      return {
        keyword: query,
        location: "Remote",
        maxResults: 50,
        proxy: { useApifyProxy: true },
      }
    default:
      return {}
  }
}

// ─── Response normalizers ─────────────────────────────────────────────────────
function normalizeLinkedIn(item: Record<string, unknown>, idx: number): Job {
  return {
    id: `li-${item.id ?? idx}`,
    title: String(item.title ?? item.positionName ?? ""),
    company: String(item.companyName ?? item.company ?? ""),
    location: String(item.location ?? "Remote"),
    type: String(item.jobType ?? item.employmentType ?? "remote").toLowerCase(),
    salary: item.salary ? String(item.salary) : undefined,
    tags: Array.isArray(item.skills) ? (item.skills as string[]).slice(0, 6) : [],
    url: String(item.url ?? item.externalApplyUrl ?? item.linkedinUrl ?? ""),
    postedAt: String(item.postedAt ?? item.publishedAt ?? ""),
    source: "linkedin" as const,
    status: "new" as const,
  }
}

function normalizeIndeed(item: Record<string, unknown>, idx: number): Job {
  return {
    id: `ind-${item.id ?? idx}`,
    title: String(item.positionName ?? item.title ?? ""),
    company: String(item.company ?? ""),
    location: String(item.location ?? "India"),
    type: String(item.jobType ?? "fulltime").toLowerCase(),
    salary: item.salary ? String(item.salary) : undefined,
    tags: [],
    url: String(item.url ?? item.externalApplyUrl ?? ""),
    postedAt: String(item.postedAt ?? item.scrapedAt ?? ""),
    source: "indeed" as const,
    status: "new" as const,
  }
}

function normalizeNaukri(item: Record<string, unknown>, idx: number): Job {
  return {
    id: `nk-${item.jobId ?? item.id ?? idx}`,
    title: String(item.title ?? item.jobTitle ?? ""),
    company: String(item.companyName ?? item.company ?? ""),
    location: String(item.location ?? item.jobLocation ?? "India"),
    type: "remote",
    salary: item.salary ? String(item.salary) : undefined,
    tags: Array.isArray(item.skills)
      ? (item.skills as string[]).slice(0, 6)
      : Array.isArray(item.keySkills)
      ? (item.keySkills as string[]).slice(0, 6)
      : [],
    url: String(item.jdURL ?? item.url ?? item.link ?? ""),
    postedAt: String(item.createdDate ?? item.postedAt ?? ""),
    source: "naukri" as const,
    status: "new" as const,
  }
}

function normalizeGlassdoor(item: Record<string, unknown>, idx: number): Job {
  return {
    id: `gd-${item.id ?? idx}`,
    title: String(item.jobTitle ?? item.title ?? ""),
    company: String((item.employer as Record<string, unknown>)?.name ?? item.company ?? ""),
    location: String(item.location ?? "Remote"),
    type: "remote",
    salary: item.salarySource ? String(item.salarySource) : undefined,
    tags: [],
    url: String(item.jobListingId ? `https://www.glassdoor.com/job-listing/j?jl=${item.jobListingId}` : item.url ?? ""),
    postedAt: String(item.listingDate ?? ""),
    source: "glassdoor" as const,
    status: "new" as const,
  }
}

const NORMALIZERS: Record<string, (item: Record<string, unknown>, idx: number) => Job> = {
  linkedin: normalizeLinkedIn,
  indeed: normalizeIndeed,
  naukri: normalizeNaukri,
  glassdoor: normalizeGlassdoor,
}

// ─── Route ────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const apifyKey = req.headers.get("x-apify-key")
  if (!apifyKey) return NextResponse.json({ error: "Missing Apify key" }, { status: 401 })

  const { platform, roles = [], skills = [] } = await req.json()
  const actorId = ACTORS[platform]
  if (!actorId) return NextResponse.json({ error: `Unknown platform: ${platform}` }, { status: 400 })

  const input = buildInput(platform, roles, skills)

  try {
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${apifyKey}&timeout=120&memory=256`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(130_000),
      }
    )

    if (!runRes.ok) {
      const errText = await runRes.text()
      return NextResponse.json({ error: `Apify error (${runRes.status}): ${errText.slice(0, 200)}` }, { status: runRes.status })
    }

    const items: Record<string, unknown>[] = await runRes.json()
    const normalize = NORMALIZERS[platform] ?? normalizeLinkedIn
    const jobs: Job[] = items
      .map((item, idx) => normalize(item, idx))
      .filter((j) => j.title && j.url)

    return NextResponse.json({ jobs, platform, count: jobs.length })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
