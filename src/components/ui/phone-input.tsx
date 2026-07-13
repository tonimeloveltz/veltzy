import * as React from 'react'
import { Input } from '@/components/ui/input'
import { formatPhoneBR } from '@/lib/phone'

export interface PhoneInputProps {
  /** Digitos locais crus (DDD + numero, SEM 55, SEM mascara). Ex.: '11917162109'. */
  value: string
  /** Emite os digitos locais crus a cada mudanca (max 11 digitos). */
  onChange: (rawDigits: string) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
}

/** Remove tudo que nao e digito e, se sobrar 12/13 digitos com 55 na frente, tira o 55. Corta em 11. */
const toRawLocal = (text: string): string => {
  let digits = text.replace(/\D/g, '')
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) {
    digits = digits.slice(2)
  }
  return digits.slice(0, 11)
}

/**
 * Input de telefone brasileiro com mascara visual (celular e fixo). A fonte de
 * verdade e o prop `value` (digitos locais crus); a exibicao e derivada por
 * formatPhoneBR a cada render. Edicao natural de texto (nao "caixa registradora"):
 * digitar/apagar/colar passam pelo onChange do input nativo, que extrai os digitos
 * e emite o valor cru. Colar um numero inteiro (com/sem 55, com/sem mascara) tambem
 * cai neste onChange (o texto colado inteiro chega em e.target.value), entao nao ha
 * handler de paste dedicado.
 *
 * type="tel" + inputMode="numeric" abrem o teclado numerico no mobile.
 *
 * Caret: como a mascara e reconstruida a cada render a partir dos digitos crus, o
 * browser perderia a posicao do cursor ao editar no meio (jogando pro fim). Ancoramos
 * pela CONTAGEM DE DIGITOS a esquerda do cursor (nao pelo indice da string, que muda
 * quando a mascara cresce/encolhe): no onChange guardamos quantos digitos ha a
 * esquerda; num useLayoutEffect reposicionamos o cursor logo apos o N-esimo digito da
 * string formatada. A verificacao do caret e MANUAL (jsdom nao pinta tela).
 */
const PhoneInput = React.forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, id, placeholder = '(11) 99999-9999', disabled, className, autoFocus, onBlur }, ref) => {
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

    // Quantos digitos ficam a esquerda do cursor no momento da digitacao. null quando
    // a mudanca de `value` nao veio de digitacao (ex.: EditLeadModal preenchendo o
    // valor salvo) -- nesse caso nao reposicionamos.
    const desiredDigitsLeft = React.useRef<number | null>(null)

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const el = e.target
      const selStart = el.selectionStart ?? el.value.length
      desiredDigitsLeft.current = el.value.slice(0, selStart).replace(/\D/g, '').length
      onChange(toRawLocal(el.value))
    }

    // Apos o re-render com o novo `value`, ancora o cursor logo apos o N-esimo digito
    // da string mascarada. So atua quando a mudanca veio de digitacao (ref != null) e o
    // campo esta focado. Zera a ref para nao reposicionar em renders subsequentes.
    React.useLayoutEffect(() => {
      const el = inputRef.current
      const target = desiredDigitsLeft.current
      if (!el || target === null || document.activeElement !== el) {
        desiredDigitsLeft.current = null
        return
      }
      const formatted = formatPhoneBR(value)
      let pos: number
      if (target === 0) {
        // logo depois do '(' inicial, se houver
        pos = formatted.startsWith('(') ? 1 : 0
      } else {
        let count = 0
        pos = formatted.length
        for (let i = 0; i < formatted.length; i++) {
          if (formatted[i] >= '0' && formatted[i] <= '9') {
            count++
            if (count === target) {
              pos = i + 1
              break
            }
          }
        }
      }
      el.setSelectionRange(pos, pos)
      desiredDigitsLeft.current = null
    }, [value])

    return (
      <Input
        ref={setRefs}
        type="tel"
        inputMode="numeric"
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoFocus={autoFocus}
        value={formatPhoneBR(value)}
        onChange={handleChange}
        onBlur={onBlur}
      />
    )
  }
)
PhoneInput.displayName = 'PhoneInput'

export { PhoneInput }
