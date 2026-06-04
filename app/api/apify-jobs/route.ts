import { NextRequest, NextResponse } from "next/server"
import { Job } from "@/lib/types"

// LinkedIn Jobs Scraper actor on Apify
const ACTOR_ID = "hKByXkMQaC5Qt9UMN"

export async function POST(req: NextRequest) {
  const apifyKey = req.headers.get("x-apify-key")
  if (!apifyKey) return NextResponse.json({ error: "Missing Apify key" }, { status: 401 })

  const { roles, location = "Worldwide" } = await req.json()
  if (!roles?.length) return NextResponse.json({ jobs: [] })

  // Build search terms from user's roles
  const searchTerms: string[] = roles.slice(0, 3).map((r: string) => `${r} remote`)

  try {
    // Run actor synchronously (waits for result, up to 5 min)
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apifyKey}&timeout=120&memory=256`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          searchTerms,
          location,
          maxResults: 50,
          proxy: { useApifyProxy: true },
        }),
        signal: AbortSignal.timeout(130_000),
      }
    )

    if (!runRes.ok) {
      const errText = await runRes.text()
      return NextResponse.json({ error: errText }, { status: runRes.status })
    }

    const items: Record<string, unknown>[] = await runRes.json()

    const jobs: Job[] = items.map((item, idx) => ({
      id: `apify-${idx}-${String(item.id ?? idx)}`,
      title: String(item.title ?? item.positionName ?? ""),
      company: String(item.companyName ?? item.company ?? ""),
      location: String(item.location ?? "Remote"),
      type: String(item.jobType ?? item.employmentType ?? "remote").toLowerCase(),
      salary: item.salary ? String(item.salary) : undefined,
      tags: Array.isArray(item.skills)
        ? (item.skills as string[]).slice(0, 6)
        : [],
      url: String(item.url ?? item.externalApplyUrl ?? item.linkedinUrl ?? ""),
      postedAt: String(item.postedAt ?? item.publishedAt ?? ""),
      source: "linkedin" as unknown as Job["source"],
      status: "new" as const,
    })).filter((j) => j.title && j.url)

    return NextResponse.json({ jobs })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
