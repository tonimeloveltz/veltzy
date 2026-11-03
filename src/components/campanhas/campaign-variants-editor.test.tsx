import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { VariantDraft } from '@/lib/campaign-variants'

const mutateAsync = vi.fn()
vi.mock('@/hooks/use-campaign-variants', () => ({
  useGenerateVariants: () => ({ mutateAsync, isPending: false }),
}))

const { CampaignVariantsEditor } = await import('@/components/campanhas/campaign-variants-editor')

const ORIG = 'Oi {{nome}}, temos uma oferta.'

const renderEditor = (value: VariantDraft[], onChange = vi.fn(), aiEnabled = true) =>
  render(<CampaignVariantsEditor original={ORIG} value={value} onChange={onChange} aiEnabled={aiEnabled} />)

describe('CampaignVariantsEditor', () => {
  beforeEach(() => mutateAsync.mockReset())

  it('gera total - 1 versoes novas (padrao 3 → 2) e entram pendentes', async () => {
    mutateAsync.mockResolvedValue({ variants: ['Ola {{nome}}, oferta!', 'E ai {{nome}}, tem oferta.'], incomplete: false })
    const onChange = vi.fn()
    renderEditor([], onChange)
    await act(async () => { fireEvent.click(screen.getByText('Gerar variações com IA')) })
    expect(mutateAsync).toHaveBeenCalledWith({ message: ORIG, count: 2 })
    expect(onChange).toHaveBeenCalledWith([
      { text: 'Ola {{nome}}, oferta!', status: 'pending' },
      { text: 'E ai {{nome}}, tem oferta.', status: 'pending' },
    ])
  })

  it('Aprovar bloqueado quando a versao perdeu variavel, com aviso', () => {
    renderEditor([{ text: 'Ola, temos oferta.', status: 'pending' }])
    expect(screen.getByText('Esta versão precisa ter {{nome}}.')).toBeTruthy()
    expect((screen.getByText('Aprovar').closest('button') as HTMLButtonElement).disabled).toBe(true)
  })

  it('Aprovar marca aprovada; editar volta para pendente', () => {
    const onChange = vi.fn()
    const { rerender } = renderEditor([{ text: 'Ola {{nome}}, oferta!', status: 'pending' }], onChange)
    fireEvent.click(screen.getByText('Aprovar'))
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'Ola {{nome}}, oferta!', status: 'approved' }])

    rerender(<CampaignVariantsEditor original={ORIG} value={[{ text: 'Ola {{nome}}, oferta!', status: 'approved' }]} onChange={onChange} aiEnabled />)
    fireEvent.change(screen.getByLabelText('Versão 2'), { target: { value: 'Oi oi {{nome}}, oferta!' } })
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'Oi oi {{nome}}, oferta!', status: 'pending' }])
  })

  it('Descartar remove a versao', () => {
    const onChange = vi.fn()
    renderEditor([{ text: 'A {{nome}}', status: 'pending' }, { text: 'B {{nome}}', status: 'pending' }], onChange)
    fireEvent.click(screen.getAllByText('Descartar')[0])
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'B {{nome}}', status: 'pending' }])
  })

  it('Gerar outra pede 1 versao evitando as atuais', async () => {
    mutateAsync.mockResolvedValue({ variants: ['Nova {{nome}}'], incomplete: false })
    const onChange = vi.fn()
    renderEditor([{ text: 'A {{nome}}', status: 'approved' }], onChange)
    await act(async () => { fireEvent.click(screen.getByText('Gerar outra')) })
    expect(mutateAsync).toHaveBeenCalledWith({ message: ORIG, count: 1, avoid: [ORIG, 'A {{nome}}'] })
    expect(onChange).toHaveBeenLastCalledWith([{ text: 'Nova {{nome}}', status: 'pending' }])
  })

  it('sem IA ativa: botao desabilitado com aviso', () => {
    renderEditor([], vi.fn(), false)
    expect((screen.getByText('Gerar variações com IA').closest('button') as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('A geração com IA não está ativa para a sua empresa.')).toBeTruthy()
  })
})
