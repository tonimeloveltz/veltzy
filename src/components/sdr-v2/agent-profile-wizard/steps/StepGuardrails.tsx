import { useState } from 'react'
import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import type { WizardFormData } from '../AgentProfileWizard'

export const StepGuardrails = () => {
  const { register, watch, setValue } = useFormContext<WizardFormData>()
  const forbiddenTopics = watch('forbidden_topics') ?? []
  const escalateKeywords = watch('must_escalate_keywords') ?? []
  const [newTopic, setNewTopic] = useState('')
  const [newKeyword, setNewKeyword] = useState('')

  const addTopic = () => {
    const trimmed = newTopic.trim()
    if (trimmed && !forbiddenTopics.includes(trimmed)) {
      setValue('forbidden_topics', [...forbiddenTopics, trimmed])
      setNewTopic('')
    }
  }

  const removeTopic = (topic: string) => {
    setValue('forbidden_topics', forbiddenTopics.filter((t) => t !== topic))
  }

  const addKeyword = () => {
    const trimmed = newKeyword.trim()
    if (trimmed && !escalateKeywords.includes(trimmed)) {
      setValue('must_escalate_keywords', [...escalateKeywords, trimmed])
      setNewKeyword('')
    }
  }

  const removeKeyword = (kw: string) => {
    setValue('must_escalate_keywords', escalateKeywords.filter((k) => k !== kw))
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Guardrails</h3>
        <p className="text-sm text-muted-foreground">Restricoes e regras de seguranca do agente.</p>
      </div>

      {/* Topicos proibidos */}
      <div className="space-y-3">
        <Label>Topicos proibidos</Label>
        <p className="text-xs text-muted-foreground">O agente nunca abordara esses assuntos.</p>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: concorrentes, politica, religiao"
            value={newTopic}
            onChange={(e) => setNewTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTopic())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addTopic}>Adicionar</Button>
        </div>
        {forbiddenTopics.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {forbiddenTopics.map((topic) => (
              <span key={topic} className="inline-flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
                {topic}
                <button type="button" onClick={() => removeTopic(topic)}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Keywords de escalada */}
      <div className="space-y-3">
        <Label>Palavras de escalada imediata</Label>
        <p className="text-xs text-muted-foreground">Se o lead mencionar estas palavras, o agente transfere para humano imediatamente.</p>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: advogado, reclamacao formal, cancelar contrato"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
          />
          <Button type="button" variant="outline" size="sm" onClick={addKeyword}>Adicionar</Button>
        </div>
        {escalateKeywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {escalateKeywords.map((kw) => (
              <span key={kw} className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-1 text-xs text-orange-700 dark:text-orange-400">
                {kw}
                <button type="button" onClick={() => removeKeyword(kw)}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Custom guardrails */}
      <div className="space-y-2">
        <Label htmlFor="custom_guardrails">Regras customizadas (opcional)</Label>
        <p className="text-xs text-muted-foreground">Texto livre que sera incluido no prompt do agente como instrucao adicional.</p>
        <textarea
          id="custom_guardrails"
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="Ex: Nunca oferecer desconto sem aprovacao do gerente. Sempre perguntar CNPJ antes de gerar cobranca."
          {...register('custom_guardrails')}
        />
      </div>
    </div>
  )
}
