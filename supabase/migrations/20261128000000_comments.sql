-- Comments on events, photos, memories and bucket-list items live in docs coll 'comments'.
-- A new comment tells the other person (insert only).
drop trigger if exists docs_notify_new on public.docs;
create trigger docs_notify_new after insert on public.docs
  for each row when (new.coll in ('yard', 'comments'))
  execute function private.on_doc_change();
