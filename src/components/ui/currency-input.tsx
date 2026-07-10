import * as React from 'react'
import { Input } from '@/components/ui/input'

export interface CurrencyInputProps {
  /** Valor atual em reais (number). Nunca undefined: campo vazio e 0. */
  value: number
  /** Recebe o number apos cada digitacao. Campo vazio emite 0. */
  onChange: (value: number) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}

/** Reais -> centavos inteiros (evita ruido de ponto flutuante). */
const toCents = (v: number) => Math.round((v || 0) * 100)

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Formata reais como "R$ 1.234,56". O Intl usa NBSP (U+00A0) apos "R$"; trocamos por espaco comum. */
const formatBRL = (v: number) => brl.format(v || 0).replace(/\u00A0/g, ' ')

/** Extrai o valor de um texto colado. Entrada pt-BR: "R$ 1.234,56" | "1234,56" -> 1234.56 ("." milhar, "," decimal). */
const parsePasted = (text: string): number => {
  const normalized = text.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')
  const n = parseFloat(normalized)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Input de moeda em Real com digitacao estilo "caixa registradora": os digitos
 * entram pela direita como centavos. Ex.: "5" -> R$ 0,05; "512" -> R$ 5,12.
 * Backspace remove o digito mais a direita. Os centavos ficam sempre visiveis
 * e o cursor permanece no fim, entao nao ha edicao no meio.
 *
 * Renderiza um <Input> comum formatado por Intl.NumberFormat (sem lib de mascara
 * concorrendo pelo caret). Controlado para uso com o Controller do
 * react-hook-form; expoe sempre NUMBER.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, id, placeholder, disabled, className, autoFocus, onBlur, onKeyDown }, ref) => {
    // Ref interna para o <input>, combinada com o ref externo do forwardRef.
    const inputRef = React.useRef<HTMLInputElement | null>(null)
    const setRefs = React.useCallback(
      (el: HTMLInputElement | null) => {
        inputRef.current = el
        if (typeof ref === 'function') ref(el)
        else if (ref) (ref as { current: HTMLInputElement | null }).current = el
      },
      [ref],
    )

    // O input nativo nunca muda sozinho (bloqueamos onChange e damos preventDefault
    // nas teclas). Como o value e sempre derivado do prop, reposicionamos o caret
    // no fim a cada render enquanto o campo estiver focado -- antes do paint, para
    // nao piscar. Sem lib de mascara, este reposicionamento e absoluto (nao ha
    // corretor de caret concorrente).
    React.useLayoutEffect(() => {
      const el = inputRef.current
      if (el && document.activeElement === el) {
        const end = el.value.length
        el.setSelectionRange(end, end)
      }
    })

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      onKeyDown?.(e)
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return

      const cents = toCents(value)
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
        e.preventDefault()
        onChange((cents * 10 + Number(e.key)) / 100)
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onChange(Math.floor(cents / 10) / 100)
      }
      // Tab, setas, Enter etc. seguem normalmente.
    }

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault()
      onChange(parsePasted(e.clipboardData.getData('text')))
    }

    // Focar nao dispara render, entao o useLayoutEffect nao cobre o caret inicial:
    // reposicionamos no fim ao focar (Tab ou clique).
    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      const el = e.currentTarget
      const end = el.value.length
      el.setSelectionRange(end, end)
    }

    return (
      <Input
        ref={setRefs}
        type="text"
        inputMode="numeric"
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoFocus={autoFocus}
        value={formatBRL(value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onFocus={handleFocus}
        onChange={() => { /* entrada controlada via handleKeyDown/handlePaste */ }}
        onBlur={onBlur}
      />
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput }
