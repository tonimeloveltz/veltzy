import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TermosPage from './termos'

const renderPage = () =>
  render(
    <MemoryRouter>
      <TermosPage />
    </MemoryRouter>,
  )

describe('TermosPage', () => {
  it('renderiza o titulo principal dos termos', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { level: 1, name: /Termos de Serviço/i }),
    ).toBeInTheDocument()
  })

  it('exibe a data de ultima atualizacao', () => {
    renderPage()
    expect(screen.getAllByText(/Última atualização/i).length).toBeGreaterThan(0)
  })

  it('renderiza secoes-chave da copy', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: /Plataforma WhatsApp Business/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Limitação de responsabilidade/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Condutas proibidas/i })).toBeInTheDocument()
  })

  it('referencia a Politica de Privacidade com link interno para /privacidade', () => {
    renderPage()
    const link = screen
      .getAllByRole('link')
      .find((l) => l.getAttribute('href') === '/privacidade')
    expect(link).toBeDefined()
    expect(link).toHaveTextContent(/Política de Privacidade/i)
  })

  it('preserva o placeholder de contato suporte@veltzy.com', () => {
    renderPage()
    expect(screen.getByText(/suporte@veltzy\.com/i)).toBeInTheDocument()
  })
})
