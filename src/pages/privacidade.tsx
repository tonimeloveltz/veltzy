import { LegalDocumentPage } from '@/components/legal/legal-document-page'
import content from '../../docs/legal/politica-privacidade.md?raw'

const META_DESCRIPTION =
  'Politica de Privacidade do Veltzy: como coletamos, usamos, compartilhamos e protegemos dados pessoais, em conformidade com a LGPD e com as politicas da Plataforma WhatsApp Business da Meta.'

const DPO_EMAIL = 'privacidade@veltz.group'

const PrivacidadePage = () => (
  <LegalDocumentPage
    content={content}
    documentTitle="Política de Privacidade — Veltzy"
    metaDescription={META_DESCRIPTION}
    footerExtra={
      <p className="mt-1">
        Encarregado pelo Tratamento de Dados (DPO):{' '}
        <a
          href={`mailto:${DPO_EMAIL}`}
          className="font-medium text-primary underline underline-offset-2 hover:opacity-80"
        >
          {DPO_EMAIL}
        </a>
      </p>
    }
  />
)

export default PrivacidadePage
