import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CurrencyInput } from '@/components/ui/currency-input'

// Nota: posicao de caret nao e verificavel em jsdom (nao pinta tela); depende de teste manual no browser.

/** Harness controlado (value sempre number), igual aos usos reais. */
function Harness({ initial }: { initial: number }) {
  const [v, setV] = useState<number>(initial)
  return (
    <div>
      <CurrencyInput value={v} onChange={setV} placeholder="valor" />
      <span data-testid="out">{String(v)}</span>
    </div>
  )
}

const getInput = () => screen.getByPlaceholderText('valor') as HTMLInputElement
const out = () => Number(screen.getByTestId('out').textContent)

describe('CurrencyInput (caixa registradora)', () => {
  it('inicial 0, digitar "5" -> "R$ 0,05" e emite 0.05', async () => {
    const user = userEvent.setup()
    render(<Harness initial={0} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '5')
    expect(input.value).toBe('R$ 0,05')
    expect(out()).toBeCloseTo(0.05, 2)
  })

  it('inicial 0, digitar "512" -> "R$ 5,12" e emite 5.12', async () => {
    const user = userEvent.setup()
    render(<Harness initial={0} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '512')
    expect(input.value).toBe('R$ 5,12')
    expect(out()).toBeCloseTo(5.12, 2)
  })

  it('inicial 0, digitar "1500000" -> "R$ 15.000,00" e emite 15000', async () => {
    const user = userEvent.setup()
    render(<Harness initial={0} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '1500000')
    expect(input.value).toBe('R$ 15.000,00')
    expect(out()).toBe(15000)
  })

  it('inicial 5.12, backspace uma vez -> "R$ 0,51"', async () => {
    const user = userEvent.setup()
    render(<Harness initial={5.12} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '{Backspace}')
    expect(input.value).toBe('R$ 0,51')
  })

  it('inicial 5.12, apagar tudo -> "R$ 0,00" e emite 0', async () => {
    const user = userEvent.setup()
    render(<Harness initial={5.12} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '{Backspace}{Backspace}{Backspace}')
    expect(input.value).toBe('R$ 0,00')
    expect(out()).toBe(0)
  })

  it('inicial 1500.5 SEM foco -> "R$ 1.500,50"', () => {
    render(<Harness initial={1500.5} />)
    expect(getInput().value).toBe('R$ 1.500,50')
  })

  it('inicial 1500 SEM foco -> "R$ 1.500,00"', () => {
    render(<Harness initial={1500} />)
    expect(getInput().value).toBe('R$ 1.500,00')
  })

  it('inicial 0, colar "R$ 1.234,56" -> emite 1234.56', async () => {
    const user = userEvent.setup()
    render(<Harness initial={0} />)
    const input = getInput()
    await user.click(input)
    await user.paste('R$ 1.234,56')
    expect(out()).toBeCloseTo(1234.56, 2)
  })

  it('inicial 500, focar e digitar "9" -> o valor muda (nao fica inerte)', async () => {
    const user = userEvent.setup()
    render(<Harness initial={500} />)
    const input = getInput()
    await user.click(input)
    await user.type(input, '9')
    expect(out()).not.toBe(500)
    expect(out()).toBeCloseTo(5000.09, 2)
  })
})
