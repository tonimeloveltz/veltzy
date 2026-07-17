import { z } from 'zod'

/**
 * Fonte unica das regras de senha.
 *
 * O checklist da tela e o schema que bloqueia o submit nascem os dois desta
 * lista. Antes, a regra visual e a regra de bloqueio seriam duas escritas
 * separadas, livres para divergir. Para adicionar ou mudar uma regra, edite
 * apenas este array: o checklist e o zod acompanham sozinhos.
 */

export interface PasswordRule {
  id: string
  /** Texto exibido ao usuario no checklist e na mensagem de erro do submit. */
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_RULES: readonly PasswordRule[] = [
  {
    id: 'min-length',
    label: `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres`,
    test: (password) => password.length >= PASSWORD_MIN_LENGTH,
  },
  {
    id: 'uppercase',
    label: 'A senha deve ter pelo menos uma letra maiúscula',
    test: (password) => /[A-Z]/.test(password),
  },
  {
    id: 'lowercase',
    label: 'A senha deve ter pelo menos uma letra minúscula',
    test: (password) => /[a-z]/.test(password),
  },
  {
    id: 'digit',
    label: 'A senha deve ter pelo menos um número',
    test: (password) => /\d/.test(password),
  },
]

/**
 * Schema derivado de PASSWORD_RULES: cada regra vira um check com o mesmo
 * texto que o checklist exibe. superRefine (e nao uma cadeia de .refine)
 * porque acumula todas as falhas em vez de parar na primeira.
 */
export const passwordSchema = z.string().superRefine((password, ctx) => {
  PASSWORD_RULES.forEach((rule) => {
    if (!rule.test(password)) {
      ctx.addIssue({ code: 'custom', message: rule.label })
    }
  })
})
