import { LegalDocumentPage } from '@/components/legal/legal-document-page'
import content from '../../docs/legal/termos-de-servico.md?raw'

const META_DESCRIPTION =
  'Termos de Serviço do Veltzy: regras de acesso e uso da plataforma de CRM e atendimento via WhatsApp, incluindo a relação com a Plataforma WhatsApp Business da Meta.'

const TermosPage = () => (
  <LegalDocumentPage
    content={content}
    documentTitle="Termos de Serviço — Veltzy"
    metaDescription={META_DESCRIPTION}
  />
)

export default TermosPage
