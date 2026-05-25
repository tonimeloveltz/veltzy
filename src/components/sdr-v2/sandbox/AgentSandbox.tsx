import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Send, Loader2, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { AgentProfile } from '@/types/sdr-v2'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL

interface SandboxMessage {
  role: 'user' | 'assistant'
  content: string
  toolCalls?: Array<{ name: string; args: string; result: unknown }>
}

interface AgentSandboxProps {
  agentProfile: AgentProfile
  leadId: string
}

export const AgentSandbox = ({ agentProfile, leadId }: AgentSandboxProps) => {
  const [messages, setMessages] = useState<SandboxMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || isLoading) return

    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setIsLoading(true)

    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData?.session?.access_token

      const res = await fetch(`${SUPABASE_URL}/functions/v1/sdr-engine`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          leadId,
          companyId: agentProfile.company_id,
          messageContent: text,
          messageType: 'text',
          pipelineId: agentProfile.pipeline_id,
          sandbox: true,
        }),
      })

      const result = await res.json()

      if (result.ok) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: result.responseText ?? '(sem resposta de texto)',
            toolCalls: result.toolCalls,
          },
        ])
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `Erro: ${result.error ?? 'desconhecido'}` },
        ])
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Erro de conexao: ${err instanceof Error ? err.message : 'desconhecido'}` },
      ])
    } finally {
      setIsLoading(false)
    }
  }, [input, isLoading, leadId, agentProfile])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
  }

  return (
    <div className="flex h-[600px] gap-4">
      {/* Profile summary */}
      <Card className="w-72 shrink-0 overflow-y-auto">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Agent Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <ProfileRow label="Nome" value={agentProfile.agent_name} />
          <ProfileRow label="Tom" value={agentProfile.tone} />
          <ProfileRow label="Personalidade" value={agentProfile.personality} />
          <ProfileRow label="Proposito" value={agentProfile.purpose} />
          <ProfileRow label="Objetivo" value={agentProfile.primary_goal} />
          <ProfileRow label="Tools" value={agentProfile.enabled_tools.join(', ')} />
          <ProfileRow label="KB" value={agentProfile.knowledge_base_status} />
        </CardContent>
      </Card>

      {/* Chat */}
      <Card className="flex flex-1 flex-col">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <CardTitle className="text-sm">Sandbox de teste</CardTitle>
          <Button variant="ghost" size="sm" onClick={clearChat} className="gap-1 text-xs">
            <Trash2 className="h-3.5 w-3.5" /> Limpar
          </Button>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col overflow-hidden p-0">
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-2">
            {messages.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Envie uma mensagem para testar o agente "{agentProfile.agent_name}".
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i}>
                <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}>
                    {msg.content}
                  </div>
                </div>
                {msg.toolCalls && msg.toolCalls.length > 0 && (
                  <div className="ml-2 mt-1 space-y-1">
                    {msg.toolCalls.map((tc, j) => (
                      <ToolCallCard key={j} toolCall={tc} />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Pensando...
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t p-3">
            <div className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Digite como se fosse um lead..."
                disabled={isLoading}
              />
              <Button onClick={sendMessage} disabled={isLoading || !input.trim()} size="icon">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// --- Subcomponents ---

const ProfileRow = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-muted-foreground">{label}:</span>{' '}
    <span className="font-medium">{value}</span>
  </div>
)

const ToolCallCard = ({ toolCall }: { toolCall: { name: string; args: string; result: unknown } }) => {
  const [open, setOpen] = useState(false)

  let parsedArgs: Record<string, unknown> = {}
  try { parsedArgs = JSON.parse(toolCall.args) } catch { /* ignore */ }

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="block w-full rounded border bg-card p-2 text-left text-xs"
    >
      <div className="flex items-center gap-1 font-medium">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        Tool: {toolCall.name}
      </div>
      {open && (
        <div className="mt-1.5 space-y-1 text-muted-foreground">
          <div><span className="font-medium">Args:</span> {JSON.stringify(parsedArgs, null, 2)}</div>
          <div><span className="font-medium">Result:</span> {JSON.stringify(toolCall.result, null, 2)}</div>
        </div>
      )}
    </button>
  )
}
