import { useEffect, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface LegalDocumentPageProps {
  /** Conteudo markdown bruto (fonte: docs/legal/*.md importado via ?raw) */
  content: string
  /** Texto da tag <title> */
  documentTitle: string
  /** Conteudo da meta description (atualiza a tag global, sem duplicar) */
  metaDescription: string
  /** Conteudo extra opcional no rodape (ex: contato do DPO) */
  footerExtra?: ReactNode
}

const isExternal = (href?: string) => !!href && /^https?:\/\//.test(href)

const MarkdownLink = ({ href, children, ...props }: ComponentPropsWithoutRef<'a'>) => {
  if (isExternal(href)) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium text-primary underline underline-offset-2 hover:opacity-80 break-words"
        {...props}
      >
        {children}
      </a>
    )
  }
  return (
    <a href={href} className="font-medium text-primary underline underline-offset-2 hover:opacity-80" {...props}>
      {children}
    </a>
  )
}

// Transforma a mencao em negrito "Política de Privacidade" em link interno
// para /privacidade, sem alterar o texto-fonte do markdown.
const MarkdownStrong = ({ children, ...props }: ComponentPropsWithoutRef<'strong'>) => {
  if (children === 'Política de Privacidade') {
    return (
      <Link to="/privacidade" className="font-semibold text-primary underline underline-offset-2 hover:opacity-80">
        {children}
      </Link>
    )
  }
  return (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  )
}

const extractLastUpdated = (content: string) => {
  const match = content.match(/Última atualização:\s*([^\n*]+)/)
  return match?.[1]?.trim() ?? ''
}

const LegalDocumentPage = ({ content, documentTitle, metaDescription, footerExtra }: LegalDocumentPageProps) => {
  const lastUpdated = extractLastUpdated(content)

  // Pagina publica institucional: forca tema claro independente da preferencia
  // salva pelo app, restaurando ao sair.
  useEffect(() => {
    const root = document.documentElement
    const hadDark = root.classList.contains('dark')
    const hadSand = root.classList.contains('sand')
    root.classList.remove('dark', 'sand')
    return () => {
      if (hadDark) root.classList.add('dark')
      if (hadSand) root.classList.add('sand')
    }
  }, [])

  // Atualiza a meta description global (evita duplicar a tag do index.html)
  // restaurando o valor original ao sair da pagina.
  useEffect(() => {
    const tag = document.querySelector<HTMLMetaElement>('meta[name="description"]')
    const original = tag?.getAttribute('content') ?? null
    tag?.setAttribute('content', metaDescription)
    return () => {
      if (tag && original !== null) tag.setAttribute('content', original)
    }
  }, [metaDescription])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <title>{documentTitle}</title>

      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2" aria-label="Ir para a página inicial do Veltzy">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">
              V
            </span>
            <span className="text-lg font-bold text-foreground">Veltzy</span>
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            Início
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-5 py-10">
        <article className="text-foreground/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ ...props }) => (
                <h1 className="mb-3 mt-0 text-3xl font-bold tracking-tight text-foreground" {...props} />
              ),
              h2: ({ ...props }) => (
                <h2 className="mb-3 mt-10 text-xl font-semibold text-foreground" {...props} />
              ),
              h3: ({ ...props }) => (
                <h3 className="mb-2 mt-6 text-base font-semibold text-foreground" {...props} />
              ),
              p: ({ ...props }) => <p className="my-4 text-[15px] leading-7" {...props} />,
              ul: ({ ...props }) => <ul className="my-4 list-disc space-y-2 pl-6 text-[15px] leading-7" {...props} />,
              ol: ({ ...props }) => <ol className="my-4 list-decimal space-y-2 pl-6 text-[15px] leading-7" {...props} />,
              li: ({ ...props }) => <li className="leading-7" {...props} />,
              strong: MarkdownStrong,
              // Bloco de destaque (callout): usado para chamar atencao a
              // instrucoes importantes, como a exclusao de dados (exigencia Meta).
              blockquote: ({ ...props }) => (
                <blockquote
                  className="my-6 rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>p:first-child]:text-base [&>p:first-child]:font-semibold [&>p:first-child]:text-foreground"
                  {...props}
                />
              ),
              hr: ({ ...props }) => <hr className="my-8 border-border" {...props} />,
              a: MarkdownLink,
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-[720px] px-5 py-6 text-sm text-muted-foreground">
          {lastUpdated && <p>Última atualização: {lastUpdated}</p>}
          {footerExtra}
          <p className="mt-3 text-xs">© {lastUpdated.match(/\d{4}/)?.[0] ?? ''} Veltzy</p>
        </div>
      </footer>
    </div>
  )
}

export { LegalDocumentPage }
