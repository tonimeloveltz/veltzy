import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, X, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useReplyTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '@/hooks/use-reply-templates'
import type { ReplyTemplate } from '@/types/database'

const ScriptsManager = () => {
  const { data: templates, isLoading } = useReplyTemplates()
  const createTemplate = useCreateTemplate()
  const updateTemplateMutation = useUpdateTemplate()
  const deleteTemplate = useDeleteTemplate()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newContent, setNewContent] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editContent, setEditContent] = useState('')

  const categories = [...new Set(templates?.map((t) => t.category) ?? [])]

  const filtered = templates?.filter((t) => {
    const matchSearch = !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.content.toLowerCase().includes(search.toLowerCase())
    const matchCat = !catFilter || t.category === catFilter
    return matchSearch && matchCat
  })

  const handleCreate = async () => {
    if (!newTitle.trim() || !newContent.trim()) return
    await createTemplate.mutateAsync({ title: newTitle, content: newContent, category: newCategory || 'geral' })
    setNewTitle('')
    setNewCategory('')
    setNewContent('')
    setShowNew(false)
  }

  const startEdit = (t: ReplyTemplate) => {
    setEditingId(t.id)
    setEditTitle(t.title)
    setEditCategory(t.category)
    setEditContent(t.content)
  }

  const saveEdit = () => {
    if (!editingId) return
    updateTemplateMutation.mutate(
      { id: editingId, input: { title: editTitle, content: editContent, category: editCategory } },
      { onSuccess: () => setEditingId(null) },
    )
  }

  const handleDelete = (id: string) => {
    if (!confirm('Remover este template?')) return
    deleteTemplate.mutate(id)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Scripts de Resposta</CardTitle>
            <CardDescription>Templates rapidos para usar no chat</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNew(!showNew)}>
            <Plus className="mr-1 h-4 w-4" />
            Novo Template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showNew && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Titulo</Label>
                <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Saudacao" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Categoria</Label>
                <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ex: geral" list="categories" className="h-8" />
                <datalist id="categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Conteudo</Label>
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                placeholder="Texto do template..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCreate} disabled={createTemplate.isPending || !newTitle.trim()}>
                {createTemplate.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                Salvar
              </Button>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="h-8 pl-8 text-xs" />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="">Todas categorias</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground py-4">Carregando...</p>}

        <div className="space-y-1">
          {filtered?.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-border/20 p-3 hover:bg-muted/20 transition-smooth">
              {editingId === t.id ? (
                <div className="flex-1 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-7 text-xs" />
                    <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} className="h-7 text-xs" />
                  </div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{t.title}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{t.category}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{t.content}</p>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(t)}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(t.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>

        {!isLoading && filtered?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum template encontrado</p>
        )}
      </CardContent>
    </Card>
  )
}

export { ScriptsManager }
