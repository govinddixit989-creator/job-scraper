import { chromium } from "playwright-core"
import chromiumBin from "@sparticuz/chromium-min"

/** Returns a launched browser; caller must close it. */
export async function launchBrowser() {
  const execPath = await chromiumBin.executablePath(
    // Chromium binary hosted by sparticuz — only downloaded on Vercel cold start
    "https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar"
  )

  return chromium.launch({
    args: chromiumBin.args,
    executablePath: execPath,
    headless: true,
  })
}
