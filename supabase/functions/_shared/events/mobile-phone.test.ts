import { assertEquals } from 'jsr:@std/assert@1'
import { isMobilePhoneBR } from './mobile-phone.ts'

Deno.test('celular com e sem 55 e mascara e aceito', () => {
  assertEquals(isMobilePhoneBR('11917162109'), true)
  assertEquals(isMobilePhoneBR('5511917162109'), true)
  assertEquals(isMobilePhoneBR('(11) 91716-2109'), true)
})

Deno.test('fixo e recusado, mesmo valido no isValidPhoneBR', () => {
  assertEquals(isMobilePhoneBR('1133334444'), false)
  assertEquals(isMobilePhoneBR('551133334444'), false)
})

Deno.test('invalido continua invalido', () => {
  assertEquals(isMobilePhoneBR(''), false)
  assertEquals(isMobilePhoneBR('10917162109'), false)
})
