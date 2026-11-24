import { useFormContext } from 'react-hook-form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { EditorField } from '@/components/events/editor/editor-field'
import { EditorSection } from '@/components/events/editor/editor-section'
import type { EditorValues } from '@/lib/events/editor-form'

interface OrganizerSectionProps {
  companyName: string
}

export const OrganizerSection = ({ companyName }: OrganizerSectionProps) => {
  const { register, formState: { errors } } = useFormContext<EditorValues>()

  return (
    <EditorSection title="Organizador e privacidade">
      <div className="grid gap-4 sm:grid-cols-2">
        <EditorField label="Nome do organizador" htmlFor="organizer_name" optional
          hint={`Vazio: aparece "${companyName}".`}>
          <Input id="organizer_name" placeholder={companyName} {...register('organizer_name')} />
        </EditorField>
        <EditorField label="Contato exibido" htmlFor="organizer_contact" optional>
          <Input id="organizer_contact" placeholder="E-mail ou telefone" {...register('organizer_contact')} />
        </EditorField>
      </div>
      <EditorField label="Sobre o organizador" htmlFor="organizer_description" optional
        error={errors.organizer_description?.message}>
        <Textarea id="organizer_description" rows={3} {...register('organizer_description')} />
      </EditorField>
      <EditorField label="URL da Política de Privacidade" htmlFor="privacy_policy_url"
        error={errors.privacy_policy_url?.message}
        hint="Obrigatória para publicar. É o link do aceite no formulário de inscrição.">
        <Input id="privacy_policy_url" type="url" placeholder="https://" {...register('privacy_policy_url')} />
      </EditorField>
      <EditorField label="Mensagem da tela de confirmação" htmlFor="confirmation_page_message" optional
        error={errors.confirmation_page_message?.message}
        hint="Aparece para quem acabou de se inscrever.">
        <Textarea id="confirmation_page_message" rows={3} {...register('confirmation_page_message')} />
      </EditorField>
    </EditorSection>
  )
}
