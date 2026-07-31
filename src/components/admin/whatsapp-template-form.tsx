import { useMemo, useState } from 'react'
import { Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { useCreateTemplate } from '@/hooks/use-whatsapp-templates'
import { extractTemplateVars } from '@/lib/template-vars'
import type { TemplateButton, TemplateCategory } from '@/types/whatsapp-template'

interface WhatsAppTemplateFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const CATEGORIES: { value: TemplateCategory; label: string }[] = [
  { value: 'UTILITY', label: 'Utilidade' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'AUTHENTICATION', label: 'Autenticação' },
]

const NAME_RE = /^[a-z0-9_]+$/

export const WhatsAppTemplateForm = ({ open, onOpenChange }: WhatsAppTemplateFormProps) => {
  const create = useCreateTemplate()

  const [name, setName] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('UTILITY')
  const [bodyText, setBodyText] = useState('')
  const [examples, setExamples] = useState<Record<number, string>>({})
  const [headerOn, setHeaderOn] = useState(false)
  const [headerText, setHeaderText] = useState('')
  const [buttons, setButtons] = useState<TemplateButton[]>([])

  // Variaveis sequenciais a partir de 1 (sem buraco). {{1}},{{3}} sem {{2}} = invalido.
  const vars = useMemo(() => extractTemplateVars(bodyText), [bodyText])
  const varsSequential = vars.every((n, i) => n === i + 1)

  const reset = () => {
    setName(''); setCategory('UTILITY'); setBodyText(''); setExamples({})
    setHeaderOn(false); setHeaderText(''); setButtons([])
  }

  const nameValid = NAME_RE.test(name) && name.length <= 512
  const examplesFilled = vars.every((n) => (examples[n] ?? '').trim().length > 0)
  const canSubmit =
    name.length > 0 && nameValid && bodyText.trim().length > 0 &&
    varsSequential && examplesFilled &&
    (!headerOn || headerText.trim().length > 0) &&
    buttons.every((b) => b.text.trim().length > 0 && (b.type !== 'URL' || (b.url ?? '').trim().length > 0)) &&
    !create.isPending

  const handleSubmit = () => {
    create.mutate(
      {
        name,
        language: 'pt_BR',
        category,
        body: { text: bodyText, examples: vars.map((n) => examples[n]) },
        header: headerOn ? { format: 'TEXT', text: headerText } : undefined,
        buttons: buttons.length ? buttons : undefined,
      },
      {
        onSuccess: () => {
          toast.success('Template enviado para revisão da Meta.')
          reset()
          onOpenChange(false)
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : 'Erro ao criar o template.'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Criar template</DialogTitle>
          <DialogDescription>
            Envie um modelo para aprovação da Meta. Idioma: Português (pt_BR).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase())}
              placeholder="ex: confirmacao_pedido"
            />
            {name.length > 0 && !nameValid && (
              <p className="text-xs text-red-600">Use apenas letras minúsculas, números e _ (máx. 512).</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as TemplateCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Corpo da mensagem</Label>
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              placeholder="Olá {{1}}, seu pedido {{2}} foi confirmado."
            />
            <p className="text-xs text-muted-foreground">Use {'{{1}}'}, {'{{2}}'}... para variáveis.</p>
            {vars.length > 0 && !varsSequential && (
              <p className="text-xs text-red-600">As variáveis devem ser sequenciais a partir de {'{{1}}'}.</p>
            )}
          </div>

          {vars.length > 0 && varsSequential && (
            <div className="space-y-2">
              <Label>Exemplos das variáveis</Label>
              {vars.map((n) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="w-10 text-xs text-muted-foreground">{`{{${n}}}`}</span>
                  <Input
                    value={examples[n] ?? ''}
                    onChange={(e) => setExamples((prev) => ({ ...prev, [n]: e.target.value }))}
                    placeholder={`Exemplo para {{${n}}}`}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between">
            <Label htmlFor="header-switch">Cabeçalho (texto)</Label>
            <Switch id="header-switch" checked={headerOn} onCheckedChange={setHeaderOn} />
          </div>
          {headerOn && (
            <Input value={headerText} onChange={(e) => setHeaderText(e.target.value)} placeholder="Texto do cabeçalho" />
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Botões (opcional)</Label>
              {buttons.length < 3 && (
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => setButtons((b) => [...b, { type: 'QUICK_REPLY', text: '' }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar
                </Button>
              )}
            </div>
            {buttons.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={b.type}
                  onValueChange={(v) => setButtons((arr) => arr.map((x, xi) => xi === i ? { ...x, type: v as TemplateButton['type'] } : x))}
                >
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="QUICK_REPLY">Resposta</SelectItem>
                    <SelectItem value="URL">Link</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={b.text}
                  onChange={(e) => setButtons((arr) => arr.map((x, xi) => xi === i ? { ...x, text: e.target.value } : x))}
                  placeholder="Texto do botão"
                />
                {b.type === 'URL' && (
                  <Input
                    value={b.url ?? ''}
                    onChange={(e) => setButtons((arr) => arr.map((x, xi) => xi === i ? { ...x, url: e.target.value } : x))}
                    placeholder="https://..."
                  />
                )}
                <Button type="button" size="icon" variant="ghost" onClick={() => setButtons((arr) => arr.filter((_, xi) => xi !== i))}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Criar template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
