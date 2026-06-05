import type { Browser } from "playwright-core"
import type { Job } from "@/lib/types"

export async function scrapeGlassdoor(browser: Browser, roles: string[]): Promise<Job[]> {
  const query = encodeURIComponent(roles.slice(0, 2).join(" "))
  const url = `https://www.glassdoor.com/Job/remote-${encodeURIComponent(roles[0]?.toLowerCase() ?? "software engineer")}-jobs-SRCH_IL.0,6_IS11047_KO7,${6 + (roles[0]?.length ?? 0) + 6}.htm`

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
      "Accept-Language": "en-US,en;q=0.9",
    })
    await page.goto(
      `https://www.glassdoor.com/Job/jobs.htm?sc.keyword=${query}&locT=C&locId=0&jobType=remote&fromAge=15`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    )
    await page.waitForSelector("[data-test='job-link'], li[data-id]", { timeout: 15000 }).catch(() => {})

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll("li[data-id], li.react-job-listing")
      return Array.from(cards).slice(0, 20).map(card => {
        const titleEl   = card.querySelector("[data-test='job-link'], a.jobLink")
        const compEl    = card.querySelector("[data-test='employer-name'], .css-87uc0g")
        const locEl     = card.querySelector("[data-test='emp-location'], .css-p0xn74")
        const salaryEl  = card.querySelector(".css-1xe2xww, [data-test='detailSalary']")
        return {
          title:    titleEl?.textContent?.trim()  ?? "",
          company:  compEl?.textContent?.trim()   ?? "",
          location: locEl?.textContent?.trim()    ?? "Remote",
          url:      (titleEl as HTMLAnchorElement)?.href ?? "",
          salary:   salaryEl?.textContent?.trim() ?? "",
        }
      })
    })

    return jobs
      .filter(j => j.title && j.url)
      .map((j, idx) => ({
        id:       `gd-pw-${Date.now()}-${idx}`,
        title:    j.title,
        company:  j.company,
        location: j.location,
        type:     "remote",
        salary:   j.salary || undefined,
        tags:     [],
        url:      j.url.startsWith("/") ? `https://www.glassdoor.com${j.url}` : j.url,
        postedAt: new Date().toISOString(),
        source:   "glassdoor" as const,
        status:   "new" as const,
      }))
  } finally {
    await page.close()
  }
}
