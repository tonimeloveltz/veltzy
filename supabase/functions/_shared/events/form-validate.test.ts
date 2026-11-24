import { assertEquals } from 'jsr:@std/assert@1'
import { isValidCNPJ, isValidCPF, validateAnswers, type ValidatableField } from './form-validate.ts'

const f = (id: string, type: string, extra: Partial<ValidatableField> = {}): ValidatableField => ({
  id, kind: 'custom', type, required: false, options: null, ...extra,
})
const opts = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

Deno.test('CPF/CNPJ: digitos verificadores', () => {
  assertEquals(isValidCPF('529.982.247-25'), true)
  assertEquals(isValidCPF('529.982.247-24'), false)
  assertEquals(isValidCPF('111.111.111-11'), false)
  assertEquals(isValidCNPJ('11.222.333/0001-81'), true)
  assertEquals(isValidCNPJ('11.222.333/0001-82'), false)
  assertEquals(isValidCNPJ('00000000000000'), false)
})

Deno.test('documento: aceita CPF e CNPJ validos, recusa o resto', () => {
  const fields = [f('d1', 'document'), f('d2', 'document'), f('d3', 'document')]
  const errors = validateAnswers(fields, [
    { field_id: 'd1', value: '52998224725' },
    { field_id: 'd2', value: '11222333000181' },
    { field_id: 'd3', value: '123' },
  ])
  assertEquals(errors, { d3: 'invalid_document' })
})

Deno.test('obrigatorio vazio e terms sempre obrigatorio', () => {
  const fields = [f('t', 'text', { required: true }), f('opt', 'text'), f('terms', 'terms')]
  assertEquals(validateAnswers(fields, [{ field_id: 't', value: '  ' }]), { t: 'required', terms: 'required' })
  assertEquals(validateAnswers(fields, [{ field_id: 't', value: 'ok' }, { field_id: 'terms', value: true }]), {})
})

Deno.test('opcao inexistente e checkbox em radio', () => {
  const fields = [f('r', 'radio', { options: opts }), f('s', 'select', { options: opts }), f('c', 'checkbox', { options: opts })]
  assertEquals(validateAnswers(fields, [
    { field_id: 'r', value: ['a', 'b'] },
    { field_id: 's', value: 'z' },
    { field_id: 'c', value: ['a', 'z'] },
  ]), { r: 'invalid_option', s: 'invalid_option', c: 'invalid_option' })
  assertEquals(validateAnswers(fields, [
    { field_id: 'r', value: 'a' },
    { field_id: 's', value: ['b'] },
    { field_id: 'c', value: ['a', 'c'] },
  ]), {})
})

Deno.test('tamanho: text ate 255, paragraph ate 2000', () => {
  const fields = [f('t', 'text'), f('p', 'paragraph')]
  assertEquals(validateAnswers(fields, [{ field_id: 't', value: 'x'.repeat(256) }, { field_id: 'p', value: 'x'.repeat(2000) }]), { t: 'too_long' })
  assertEquals(validateAnswers(fields, [{ field_id: 'p', value: 'x'.repeat(2001) }]), { p: 'too_long' })
})

Deno.test('email, telefone, cidade/estado, endereco e data', () => {
  const fields = [f('e', 'email'), f('ph', 'phone'), f('cs', 'city_state'), f('ad', 'address'), f('dt', 'datetime')]
  assertEquals(validateAnswers(fields, [
    { field_id: 'e', value: 'a@b' },
    { field_id: 'ph', value: '(00) 91234-5678' },
    { field_id: 'cs', value: 'Recife/PE' },
    { field_id: 'ad', value: { street: 'Rua A', number: 10 } },
    { field_id: 'dt', value: 'ontem' },
  ]), { e: 'invalid_email', ph: 'invalid_phone', cs: 'invalid_type', ad: 'invalid_type', dt: 'invalid_date' })
  assertEquals(validateAnswers(fields, [
    { field_id: 'e', value: 'ana@empresa.com.br' },
    { field_id: 'ph', value: '(81) 99999-1234' },
    { field_id: 'cs', value: { city: 'Recife', state: 'PE' } },
    { field_id: 'ad', value: { street: 'Rua A', number: '10' } },
    { field_id: 'dt', value: '2026-11-28T09:00' },
  ]), {})
})

Deno.test('campo fixo e ignorado (vem no envelope)', () => {
  assertEquals(validateAnswers([f('fx', 'text', { kind: 'fixed', required: true })], []), {})
})
