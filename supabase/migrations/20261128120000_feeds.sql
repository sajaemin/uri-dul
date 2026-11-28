-- Feeding a character (docs coll 'feeds') tells the other person, like comments and new yard items.
drop trigger if exists docs_notify_new on public.docs;
create trigger docs_notify_new after insert on public.docs
  for each row when (new.coll in ('yard', 'comments', 'feeds'))
  execute function private.on_doc_change();
