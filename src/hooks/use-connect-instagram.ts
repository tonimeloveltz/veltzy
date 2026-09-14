import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { edgeFunctionErrorCode } from '@/lib/edge-function-error'
import { instagramOAuthErrorMessage } from '@/lib/instagram-messages'
import { startInstagramAuthorize } from '@/services/instagram.service'

/** Pede a URL de autorizacao ao servidor e sai para o instagram.com. */
export const useConnectInstagram = () =>
  useMutation({
    mutationFn: startInstagramAuthorize,
    onSuccess: (url) => window.location.assign(url),
    onError: (err) => toast.error(instagramOAuthErrorMessage(edgeFunctionErrorCode(err))),
  })
