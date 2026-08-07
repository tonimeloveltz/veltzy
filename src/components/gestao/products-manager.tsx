import { useState } from 'react'
import { Plus, Search, Pencil, Trash2, X, Check, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useProducts, useCreateProduct, useUpdateProduct, useDeleteProduct } from '@/hooks/use-products'
import { useAuthStore } from '@/stores/auth.store'
import type { Product } from '@/types/database'

const ProductsManager = () => {
  const roles = useAuthStore((s) => s.roles)
  const canManage = roles.some((r) => ['admin', 'manager', 'super_admin'].includes(r))

  const { data: products, isLoading, isError } = useProducts()
  const createProduct = useCreateProduct()
  const updateProductMutation = useUpdateProduct()
  const deleteProduct = useDeleteProduct()

  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newLink, setNewLink] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editLink, setEditLink] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const categories = [...new Set(products?.map((p) => p.category) ?? [])]

  const filtered = products?.filter((p) => {
    const q = search.toLowerCase()
    const matchSearch = !search
      || p.name.toLowerCase().includes(q)
      || (p.description?.toLowerCase().includes(q) ?? false)
    const matchCat = !catFilter || p.category === catFilter
    return matchSearch && matchCat
  })

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createProduct.mutateAsync({
      name: newName.trim(),
      description: newDescription.trim() || null,
      link: newLink.trim() || null,
      category: newCategory.trim() || 'geral',
    })
    setNewName('')
    setNewLink('')
    setNewCategory('')
    setNewDescription('')
    setShowNew(false)
  }

  const startEdit = (p: Product) => {
    setEditingId(p.id)
    setEditName(p.name)
    setEditLink(p.link ?? '')
    setEditCategory(p.category)
    setEditDescription(p.description ?? '')
  }

  const saveEdit = () => {
    if (!editingId) return
    updateProductMutation.mutate(
      {
        id: editingId,
        input: {
          name: editName.trim(),
          description: editDescription.trim() || null,
          link: editLink.trim() || null,
          category: editCategory.trim() || 'geral',
        },
      },
      { onSuccess: () => setEditingId(null) },
    )
  }

  const handleDelete = (id: string) => {
    if (!confirm('Remover este produto?')) return
    deleteProduct.mutate(id)
  }

  // Degrada em vez de quebrar. Cobre o cadastro ainda indisponivel no ambiente
  // (a tabela vive no banco Central e a migration e aplicada em passo separado)
  // e tambem RLS negando por role inesperada.
  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>Nome, descricao e link para inserir na conversa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-2 rounded-lg border border-border/20 p-4">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">Cadastro de produtos indisponivel</p>
              <p className="text-xs text-muted-foreground">
                Nao foi possivel carregar a lista neste ambiente. Se o recurso acabou de ser
                liberado, tente de novo em alguns minutos ou fale com o suporte.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Produtos</CardTitle>
            <CardDescription>Nome, descricao e link para inserir na conversa</CardDescription>
          </div>
          {canManage && (
            <Button size="sm" onClick={() => setShowNew(!showNew)}>
              <Plus className="mr-1 h-4 w-4" />
              Novo produto
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showNew && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Nome</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: Plano Pro" className="h-8" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Link</Label>
                <Input value={newLink} onChange={(e) => setNewLink(e.target.value)} placeholder="https://..." className="h-8" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoria</Label>
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Ex: geral" list="product-categories" className="h-8" />
              <datalist id="product-categories">
                {categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descricao</Label>
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm input-clean"
                placeholder="O que o cliente precisa saber sobre o produto..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowNew(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleCreate} disabled={createProduct.isPending || !newName.trim()}>
                {createProduct.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
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
          {filtered?.map((p) => (
            <div key={p.id} className="flex items-start gap-3 rounded-lg border border-border/20 p-3 hover:bg-muted/20 transition-smooth">
              {editingId === p.id ? (
                <div className="flex-1 space-y-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-7 text-xs" />
                    <Input value={editLink} onChange={(e) => setEditLink(e.target.value)} placeholder="https://..." className="h-7 text-xs" />
                  </div>
                  <Input value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Categoria" className="h-7 text-xs" />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="flex min-h-[40px] w-full rounded-md border border-input bg-background px-2 py-1 text-xs"
                  />
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setEditingId(null)}><X className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-primary" onClick={saveEdit} disabled={!editName.trim()}><Check className="h-3 w-3" /></Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{p.category}</span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{p.description}</p>
                    )}
                    {/* Sem link cadastrado nao renderiza ancora: link vazio vira
                        <a href=""> que recarrega a pagina ao clicar. */}
                    {p.link && (
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 block truncate text-xs text-primary hover:underline"
                      >
                        {p.link}
                      </a>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-0.5 shrink-0">
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => startEdit(p)}><Pencil className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(p.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {!isLoading && filtered?.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">Nenhum produto encontrado</p>
        )}
      </CardContent>
    </Card>
  )
}

export { ProductsManager }
