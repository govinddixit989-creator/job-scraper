import type { Browser } from "playwright-core"
import type { Job } from "@/lib/types"

export async function scrapeNaukri(browser: Browser, roles: string[]): Promise<Job[]> {
  const query = roles.slice(0, 2).join(" ").replace(/\s+/g, "-").toLowerCase()
  const url = `https://www.naukri.com/${query}-jobs?jobsPerPage=20&wfhType=work+from+home`

  const page = await browser.newPage()
  try {
    await page.setExtraHTTPHeaders({ "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" })
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 })
    await page.waitForSelector(".srp-jobtuple-wrapper, .jobTuple", { timeout: 15000 }).catch(() => {})

    const jobs = await page.evaluate(() => {
      const cards = document.querySelectorAll(".srp-jobtuple-wrapper, .jobTuple")
      return Array.from(cards).slice(0, 20).map(card => {
        const titleEl  = card.querySelector(".title, a.title, [class*='title']")
        const compEl   = card.querySelector(".comp-name, .companyInfo span, [class*='comp']")
        const locEl    = card.querySelector(".loc, .location, [class*='location']")
        const linkEl   = card.querySelector("a.title, a[href*='naukri.com/job-listings']")
        const salaryEl = card.querySelector(".salary, [class*='salary']")
        const expEl    = card.querySelector(".expwdth, [class*='exp']")
        return {
          title:   titleEl?.textContent?.trim()  ?? "",
          company: compEl?.textContent?.trim()   ?? "",
          location: locEl?.textContent?.trim()   ?? "India",
          url:     (linkEl as HTMLAnchorElement)?.href ?? "",
          salary:  salaryEl?.textContent?.trim() ?? "",
          exp:     expEl?.textContent?.trim()    ?? "",
        }
      })
    })

    return jobs
      .filter(j => j.title && j.url)
      .map((j, idx) => ({
        id:       `nk-pw-${Date.now()}-${idx}`,
        title:    j.title,
        company:  j.company,
        location: j.location,
        type:     "remote",
        salary:   j.salary || undefined,
        tags:     [],
        url:      j.url,
        postedAt: new Date().toISOString(),
        source:   "naukri" as const,
        status:   "new" as const,
      }))
  } finally {
    await page.close()
  }
}
