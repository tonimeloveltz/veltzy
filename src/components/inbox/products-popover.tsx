import { useState } from 'react'
import { Search, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useProducts } from '@/hooks/use-products'
import type { Product } from '@/types/database'

interface ProductsPopoverProps {
  onSelect: (product: Product) => void
  /**
   * Aberto/fechado e controlado pela barra de composicao: abaixo de 640px o
   * gatilho proprio some e quem abre este painel e o menu agrupado (Plus).
   * A barra tambem garante que este painel e o de templates nunca abram juntos.
   */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Permite esconder o gatilho onde ele vive dentro do menu agrupado. */
  triggerClassName?: string
}

/**
 * ATENCAO ao mexer: este componente retorna OS DOIS, gatilho e painel absoluto,
 * dentro de um Fragment. Nunca um <div>. O Fragment nao gera no no DOM, entao o
 * gatilho continua sendo filho direto da barra e o `hidden` dele vira
 * display:none e sai do fluxo flex sem consumir gap. Envolver num <div> "para
 * organizar" cria um flex item de largura zero que come 8px de gap e derruba a
 * conta de largura da barra sem quebrar nada visivelmente.
 *
 * Antes o componente retornava OU o gatilho OU o painel. Isso fazia o icone
 * sumir ao abrir e a barra saltar 40px (32 do icone mais 8 do gap).
 * Ver secao 5 da Spec de cadastro de produtos.
 */
const ProductsPopover = ({
  onSelect,
  open,
  onOpenChange,
  triggerClassName,
}: ProductsPopoverProps) => {
  const { data: products } = useProducts()
  const [search, setSearch] = useState('')

  const setOpen = (value: boolean) => {
    onOpenChange(value)
    if (!value) setSearch('')
  }

  const filtered = products?.filter((p) => {
    if (!search) return true
    const q = search.toLowerCase()
    return p.name.toLowerCase().includes(q) || (p.description?.toLowerCase().includes(q) ?? false)
  })

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn(
          'h-8 w-8 text-muted-foreground hover:text-foreground',
          open && 'bg-accent text-foreground',
          triggerClassName
        )}
        onClick={() => setOpen(!open)}
        title="Produtos"
      >
        <Package className="h-4 w-4" />
      </Button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border bg-popover p-2 shadow-lg animate-fade-in">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto scrollbar-minimal space-y-1">
            {filtered?.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">Nenhum produto encontrado</p>
            )}
            {filtered?.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  onSelect(p)
                  setOpen(false)
                }}
                className="w-full rounded-md px-2 py-1.5 text-left hover:bg-accent hover:text-accent-foreground transition-smooth"
              >
                <p className="text-xs font-medium truncate">{p.name}</p>
                {p.description && (
                  <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>
                )}
              </button>
            ))}
          </div>
          <button
            onClick={() => setOpen(false)}
            className="mt-1 w-full text-center text-[10px] text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
        </div>
      )}
    </>
  )
}

export { ProductsPopover }
