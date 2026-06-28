import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import PrivacidadePage from './privacidade'

const renderPage = () =>
  render(
    <MemoryRouter>
      <PrivacidadePage />
    </MemoryRouter>,
  )

describe('PrivacidadePage', () => {
  it('renderiza o titulo principal da politica', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Política de Privacidade/i }),
    ).toBeInTheDocument()
  })

  it('exibe a data de ultima atualizacao no rodape', () => {
    renderPage()
    expect(screen.getAllByText(/Última atualização/i).length).toBeGreaterThan(0)
  })

  it('renderiza secoes-chave da copy', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Quem somos/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Plataforma WhatsApp Business/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Seus direitos como titular/i })).toBeInTheDocument()
  })

  it('links externos abrem em nova aba com rel seguro', () => {
    renderPage()
    const links = screen.getAllByRole('link') as HTMLAnchorElement[]
    const externos = links.filter((l) => /^https?:\/\//.test(l.getAttribute('href') ?? ''))
    expect(externos.length).toBeGreaterThan(0)
    for (const link of externos) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
      expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
    }
  })

  it('contem link de contato do DPO', () => {
    renderPage()
    const mailto = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === 'mailto:privacidade@veltz.group')
    expect(mailto).toBeDefined()
  })

  it('exibe o bloco de destaque de exclusao de dados (exigencia Meta)', () => {
    renderPage()
    expect(screen.getByText('Exclusão de dados')).toBeInTheDocument()
    expect(
      screen.getByText(/com o assunto "Solicitação de exclusão de dados"/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/15 dias úteis/i)).toBeInTheDocument()
  })
})
