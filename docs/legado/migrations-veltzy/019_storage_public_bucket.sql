-- Torna o bucket chat-attachments publico para que getPublicUrl funcione
-- (avatares de leads e anexos de chat precisam ser acessiveis sem auth)
UPDATE storage.buckets SET public = true WHERE name = 'chat-attachments';
