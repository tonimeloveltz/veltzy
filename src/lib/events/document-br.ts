// Mascara de CPF (ate 11 digitos) ou CNPJ (12 a 14), pelo tamanho. A validacao dos digitos e do servidor.

export const formatDocumentBR = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2')
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}
