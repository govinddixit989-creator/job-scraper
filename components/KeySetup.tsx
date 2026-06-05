"use client"

import { useEffect, useState } from "react"
import { ApiKeys } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Key, ExternalLink, AlertCircle } from "lucide-react"
import { getApiKeys } from "@/lib/storage"

interface Props {
  onComplete: (keys: ApiKeys) => void
}

function formatError(groq: string, apify: string): string | null {
  if (groq && !groq.startsWith("gsk_"))   return "Groq key should start with gsk_"
  if (apify && !apify.startsWith("apify_api_")) return "Apify key should start with apify_api_"
  return null
}

export default function KeySetup({ onComplete }: Props) {
  const [groq,  setGroq]  = useState("")
  const [apify, setApify] = useState("")
  const [showGroq,  setShowGroq]  = useState(false)
  const [showApify, setShowApify] = useState(false)

  // Pre-fill from localStorage if keys were previously saved
  useEffect(() => {
    const saved = getApiKeys()
    if (saved?.groq)  setGroq(saved.groq)
    if (saved?.apify) setApify(saved.apify)
  }, [])

  const error = formatError(groq.trim(), apify.trim())
  const canSave = groq.trim().startsWith("gsk_") && apify.trim().startsWith("apify_api_")

  const handleSave = () => {
    if (!canSave) return
    onComplete({ groq: groq.trim(), apify: apify.trim() })
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">

        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto">
            <Key size={22} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Your API keys</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Saved to your browser only — never sent to our servers.
            You only need to do this once.
          </p>
        </div>

        <div className="space-y-5">

          {/* Groq */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Groq API Key</label>
              <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Get free key <ExternalLink size={10} />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Resume parsing + job relevance scoring</p>
            <div className="relative flex items-center">
              <Input
                type={showGroq ? "text" : "password"}
                placeholder="gsk_..."
                value={groq}
                onChange={(e) => setGroq(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="pr-10 font-mono text-sm"
                autoFocus
              />
              <button onClick={() => setShowGroq(v => !v)} tabIndex={-1}
                className="absolute right-2 text-muted-foreground hover:text-foreground">
                {showGroq ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Apify */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Apify API Key</label>
              <a href="https://console.apify.com/account/integrations" target="_blank" rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                Get free key <ExternalLink size={10} />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">LinkedIn, Naukri, Indeed scraping</p>
            <div className="relative flex items-center">
              <Input
                type={showApify ? "text" : "password"}
                placeholder="apify_api_..."
                value={apify}
                onChange={(e) => setApify(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
                className="pr-10 font-mono text-sm"
              />
              <button onClick={() => setShowApify(v => !v)} tabIndex={-1}
                className="absolute right-2 text-muted-foreground hover:text-foreground">
                {showApify ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle size={14} /> {error}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={!canSave}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          Save & continue
        </button>

        <p className="text-xs text-center text-muted-foreground">
          Keys are stored in <code className="bg-muted px-1 rounded">localStorage</code> and loaded automatically on every visit.
        </p>
      </div>
    </div>
  )
}
