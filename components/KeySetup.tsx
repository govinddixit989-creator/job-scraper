"use client"

import { useState } from "react"
import { ApiKeys } from "@/lib/types"
import { Input } from "@/components/ui/input"
import { Eye, EyeOff, Key, Loader2, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react"

interface Props {
  onComplete: (keys: ApiKeys) => void
}

async function validateGroq(key: string): Promise<boolean> {
  try {
    const res = await fetch("/api/validate-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ groq: key }),
    })
    const data = await res.json()
    return data.groq === true
  } catch {
    return false
  }
}

async function validateApify(key: string): Promise<boolean> {
  try {
    const res = await fetch("/api/validate-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apify: key }),
    })
    const data = await res.json()
    return data.apify === true
  } catch {
    return false
  }
}

type Status = "idle" | "loading" | "ok" | "error"

export default function KeySetup({ onComplete }: Props) {
  const [groq, setGroq] = useState("")
  const [apify, setApify] = useState("")
  const [showGroq, setShowGroq] = useState(false)
  const [showApify, setShowApify] = useState(false)
  const [groqStatus, setGroqStatus] = useState<Status>("idle")
  const [apifyStatus, setApifyStatus] = useState<Status>("idle")
  const [validating, setValidating] = useState(false)

  const handleContinue = async () => {
    if (!groq.trim() || !apify.trim()) return
    setValidating(true)
    setGroqStatus("loading")
    setApifyStatus("loading")

    const [groqOk, apifyOk] = await Promise.all([
      validateGroq(groq.trim()),
      validateApify(apify.trim()),
    ])

    setGroqStatus(groqOk ? "ok" : "error")
    setApifyStatus(apifyOk ? "ok" : "error")
    setValidating(false)

    if (groqOk && apifyOk) {
      onComplete({ groq: groq.trim(), apify: apify.trim() })
    }
  }

  const StatusIcon = ({ status }: { status: Status }) => {
    if (status === "loading") return <Loader2 size={16} className="animate-spin text-muted-foreground" />
    if (status === "ok") return <CheckCircle2 size={16} className="text-green-500" />
    if (status === "error") return <AlertCircle size={16} className="text-destructive" />
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center mx-auto">
            <Key size={22} className="text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Connect your API keys</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your keys are stored only in your browser — never sent to any server except the services themselves.
          </p>
        </div>

        {/* Keys */}
        <div className="space-y-5">

          {/* Groq */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Groq API Key</label>
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                Get key <ExternalLink size={10} />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Used to parse your resume and rank job relevance with AI</p>
            <div className="relative flex items-center">
              <Input
                type={showGroq ? "text" : "password"}
                placeholder="gsk_..."
                value={groq}
                onChange={(e) => { setGroq(e.target.value); setGroqStatus("idle") }}
                className="pr-16 font-mono text-sm"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                <StatusIcon status={groqStatus} />
                <button
                  onClick={() => setShowGroq((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showGroq ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {groqStatus === "error" && (
              <p className="text-xs text-destructive">Invalid key — check it at console.groq.com/keys</p>
            )}
          </div>

          {/* Apify */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Apify API Key</label>
              <a
                href="https://console.apify.com/account/integrations"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                Get key <ExternalLink size={10} />
              </a>
            </div>
            <p className="text-xs text-muted-foreground">Used to scrape LinkedIn Jobs and other job boards</p>
            <div className="relative flex items-center">
              <Input
                type={showApify ? "text" : "password"}
                placeholder="apify_api_..."
                value={apify}
                onChange={(e) => { setApify(e.target.value); setApifyStatus("idle") }}
                className="pr-16 font-mono text-sm"
              />
              <div className="absolute right-2 flex items-center gap-1.5">
                <StatusIcon status={apifyStatus} />
                <button
                  onClick={() => setShowApify((v) => !v)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showApify ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            {apifyStatus === "error" && (
              <p className="text-xs text-destructive">Invalid key — check it at console.apify.com</p>
            )}
          </div>
        </div>

        {/* Info box */}
        <div className="bg-muted/50 rounded-lg p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Why do I need these?</p>
          <p>• <span className="font-medium">Groq</span> — free tier, reads your resume and scores job matches using Llama 3</p>
          <p>• <span className="font-medium">Apify</span> — free tier ($5 credit), scrapes LinkedIn Jobs so you see real listings</p>
        </div>

        <button
          onClick={handleContinue}
          disabled={!groq.trim() || !apify.trim() || validating}
          className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-40 hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          {validating && <Loader2 size={16} className="animate-spin" />}
          {validating ? "Validating keys…" : "Save & Continue"}
        </button>
      </div>
    </div>
  )
}
