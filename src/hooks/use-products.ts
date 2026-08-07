import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import * as productsService from '@/services/products.service'
import type { Product } from '@/types/database'

export const useProducts = () => {
  const companyId = useAuthStore((s) => s.company?.id)

  return useQuery({
    queryKey: ['products', companyId],
    queryFn: () => productsService.getProducts(companyId!),
    enabled: !!companyId,
  })
}

export const useCreateProduct = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (input: { name: string; description?: string | null; link?: string | null; category?: string }) =>
      productsService.createProduct(companyId!, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produto criado!')
    },
    onError: () => toast.error('Erro ao criar produto'),
  })
}

export const useUpdateProduct = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (data: { id: string; input: Partial<Pick<Product, 'name' | 'description' | 'link' | 'category' | 'is_active'>> }) =>
      productsService.updateProduct(companyId!, data.id, data.input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('Produto atualizado!')
    },
    onError: () => toast.error('Erro ao atualizar produto'),
  })
}

export const useDeleteProduct = () => {
  const queryClient = useQueryClient()
  const companyId = useAuthStore((s) => s.company?.id)

  return useMutation({
    mutationFn: (id: string) => productsService.deleteProduct(companyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      // O de templates so toasta erro. Aqui a remocao confirma, porque some uma
      // linha da lista e o vendedor precisa saber que foi o clique dele.
      toast.success('Produto removido!')
    },
    onError: () => toast.error('Erro ao remover produto'),
  })
}
