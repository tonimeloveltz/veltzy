import { veltzy as db } from '@/lib/supabase'
import type { Product } from '@/types/database'

export const getProducts = async (companyId: string): Promise<Product[]> => {
  const { data, error } = await db()
    .from('products')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('category')
    .order('name')
  if (error) throw error
  return data
}

export const createProduct = async (
  companyId: string,
  input: { name: string; description?: string | null; link?: string | null; category?: string }
): Promise<Product> => {
  const { data, error } = await db()
    .from('products')
    .insert({ ...input, company_id: companyId })
    .select()
    .single()
  if (error) throw error
  return data
}

export const updateProduct = async (
  companyId: string,
  id: string,
  input: Partial<Pick<Product, 'name' | 'description' | 'link' | 'category' | 'is_active'>>
): Promise<Product> => {
  const { data, error } = await db()
    .from('products')
    .update(input)
    .eq('id', id)
    .eq('company_id', companyId)
    .select()
    .single()
  if (error) throw error
  return data
}

export const deleteProduct = async (companyId: string, id: string): Promise<void> => {
  const { error } = await db()
    .from('products')
    .delete()
    .eq('id', id)
    .eq('company_id', companyId)
  if (error) throw error
}
