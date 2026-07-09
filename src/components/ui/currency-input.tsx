import * as React from 'react'
import { NumericFormat } from 'react-number-format'
import { Input } from '@/components/ui/input'

export interface CurrencyInputProps {
  /** Valor atual em reais (number) ou undefined quando vazio. */
  value: number | undefined
  /** Recebe o number digitado, ou undefined quando o campo fica vazio. */
  onChange: (value: number | undefined) => void
  id?: string
  placeholder?: string
  disabled?: boolean
  className?: string
  autoFocus?: boolean
  onBlur?: () => void
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
}

/**
 * Input de moeda em Real, controlado, para uso com o Controller do
 * react-hook-form. Exibe mascara "R$ 1.234,56" mas expoe sempre um NUMBER
 * (floatValue) para o form; campo vazio expoe undefined.
 */
const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, id, placeholder, disabled, className, autoFocus, onBlur, onKeyDown }, ref) => {
    return (
      <NumericFormat
        getInputRef={ref}
        id={id}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
        autoFocus={autoFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        customInput={Input}
        value={value ?? ''}
        prefix="R$ "
        thousandSeparator="."
        decimalSeparator=","
        decimalScale={2}
        fixedDecimalScale
        allowNegative={false}
        onValueChange={(values) => onChange(values.floatValue)}
      />
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'

export { CurrencyInput }
