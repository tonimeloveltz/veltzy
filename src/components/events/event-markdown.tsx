import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import { cn } from '@/lib/utils'

// Renderer unico da descricao do evento (D10): o mesmo no preview do editor e na pagina publica.
// HTML cru e ignorado (skipHtml) e so os elementos da barra passam; o urlTransform padrao
// do react-markdown descarta javascript: e afins. Nada de dangerouslySetInnerHTML.

const ALLOWED = ['p', 'strong', 'em', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'a', 'br']

const Link = ({ children, href }: ComponentPropsWithoutRef<'a'>) => (
  <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline underline-offset-2">
    {children}
  </a>
)

interface EventMarkdownProps {
  content: string
  className?: string
}

export const EventMarkdown = ({ content, className }: EventMarkdownProps) => (
  <div
    className={cn(
      'space-y-3 break-words text-sm leading-relaxed',
      '[&_h1]:text-lg [&_h1]:font-semibold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:font-semibold',
      '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:space-y-1 [&_ol]:space-y-1 [&_ul]:pl-5 [&_ol]:pl-5',
      className,
    )}
  >
    <ReactMarkdown skipHtml allowedElements={ALLOWED} unwrapDisallowed components={{ a: Link }}>
      {content}
    </ReactMarkdown>
  </div>
)
