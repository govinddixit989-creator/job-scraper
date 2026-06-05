import { NextRequest, NextResponse } from "next/server"
import { Job } from "@/lib/types"

// Apify actor IDs per platform
const APIFY_ACTORS: Record<string, string> = {
  linkedin:  "hKByXkMQaC5Qt9UMN",
  indeed:    "misceres/indeed-scraper",
  naukri:    "zuzka/naukri-jobs-scraper",
  glassdoor: "bebity/glassdoor-jobs-scraper",
}

// Apify input builders per platform
function buildApifyInput(platform: string, roles: string[], skills: string[]): Record<string, unknown> {
  const query = [...roles.slice(0, 2), ...skills.slice(0, 2)].slice(0, 3).join(" ")
  switch (platform) {
    case "linkedin":
      return { searchTerms: roles.slice(0, 3).map(r => `${r} remote`), location: "Worldwide", maxResults: 25, proxy: { useApifyProxy: true } }
    case "indeed":
      return { position: query, country: "IN", maxItems: 25, proxy: { useApifyProxy: true } }
    case "naukri":
      return { keyword: roles.slice(0, 2).join(" "), location: "Work from Home", maxJobs: 25 }
    case "glassdoor":
      return { keyword: query, location: "Remote", maxResults: 25, proxy: { useApifyProxy: true } }
    default:
      return {}
  }
}

// Normalize raw Apify items to Job objects
function normalize(platform: string, item: Record<string, unknown>, idx: number): Job | null {
  const title = String(item.title ?? item.positionName ?? item.jobTitle ?? "")
  const url   = String(item.url ?? item.externalApplyUrl ?? item.jdURL ?? item.link ?? "")
  if (!title || !url) return null
  return {
    id:       `${platform}-ap-${idx}-${Date.now()}`,
    title,
    company:  String(item.companyName ?? item.company ?? ""),
    location: String(item.location ?? item.jobLocation ?? "Remote"),
    type:     String(item.jobType ?? item.employmentType ?? "remote").toLowerCase(),
    salary:   item.salary ? String(item.salary) : undefined,
    tags:     Array.isArray(item.skills) ? (item.skills as string[]).slice(0, 6) : [],
    url,
    postedAt: String(item.postedAt ?? item.publishedAt ?? item.createdDate ?? ""),
    source:   platform as Job["source"],
    status:   "new",
  }
}

// Try Apify scraping
async function tryApify(platform: string, roles: string[], skills: string[], apifyKey: string): Promise<Job[]> {
  const actorId = APIFY_ACTORS[platform]
  if (!actorId) throw new Error(`No actor for ${platform}`)

  const res = await fetch(
    `https://api.apify.com/v2/acts/${encodeURIComponent(actorId)}/run-sync-get-dataset-items?token=${apifyKey}&timeout=90&memory=256`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildApifyInput(platform, roles, skills)),
      signal: AbortSignal.timeout(100_000),
    }
  )
  if (!res.ok) throw new Error(`Apify ${res.status}: ${(await res.text()).slice(0, 100)}`)

  const items: Record<string, unknown>[] = await res.json()
  return items.map((item, idx) => normalize(platform, item, idx)).filter(Boolean) as Job[]
}

// Playwright fallback — dynamic import so it doesn't crash in environments without Chromium
async function tryPlaywright(platform: string, roles: string[]): Promise<Job[]> {
  const { launchBrowser } = await import("@/lib/playwright-browser")
  const browser = await launchBrowser()
  try {
    switch (platform) {
      case "linkedin": {
        const { scrapeLinkedIn } = await import("@/lib/scrapers/linkedin")
        return await scrapeLinkedIn(browser, roles)
      }
      case "indeed": {
        const { scrapeIndeed } = await import("@/lib/scrapers/indeed")
        return await scrapeIndeed(browser, roles)
      }
      case "naukri": {
        const { scrapeNaukri } = await import("@/lib/scrapers/naukri")
        return await scrapeNaukri(browser, roles)
      }
      case "glassdoor": {
        const { scrapeGlassdoor } = await import("@/lib/scrapers/glassdoor")
        return await scrapeGlassdoor(browser, roles)
      }
      default:
        return []
    }
  } finally {
    await browser.close()
  }
}

export async function POST(req: NextRequest) {
  const apifyKey = req.headers.get("x-apify-key") ?? ""
  const { platform, roles = [], skills = [] } = await req.json()

  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 })

  let jobs: Job[] = []
  let method = ""
  let error = ""

  // 1. Try Apify (fast, structured data)
  if (apifyKey) {
    try {
      jobs = await tryApify(platform, roles, skills, apifyKey)
      method = "apify"
    } catch (e) {
      error = String(e instanceof Error ? e.message : e)
      console.warn(`[scrape] Apify failed for ${platform}:`, error)
    }
  }

  // 2. Playwright fallback if Apify failed or no key
  if (jobs.length === 0) {
    try {
      jobs = await tryPlaywright(platform, roles)
      method = "playwright"
    } catch (e) {
      const pwError = String(e instanceof Error ? e.message : e)
      console.error(`[scrape] Playwright failed for ${platform}:`, pwError)
      return NextResponse.json({
        jobs: [],
        platform,
        error: `Both Apify and Playwright failed. Apify: ${error.slice(0, 80)}. Playwright: ${pwError.slice(0, 80)}`,
      })
    }
  }

  return NextResponse.json({ jobs, platform, method, count: jobs.length })
}

export const maxDuration = 60
