-- 우리 마당: things bought with hearts live in docs coll 'yard'. Tell the partner when one is bought
-- (insert only, so moving things around while decorating does not call the function).
-- 오늘의 한 장 ('snaps') is gone, so it leaves the watched list.
drop trigger if exists docs_notify on public.docs;
create trigger docs_notify after insert or update on public.docs
  for each row when (new.coll in ('answers', 'photos', 'pokes', 'events', 'memories', 'bucket', 'pings', 'moods', 'letters'))
  execute function private.on_doc_change();
drop trigger if exists docs_notify_new on public.docs;
create trigger docs_notify_new after insert on public.docs
  for each row when (new.coll in ('yard'))
  execute function private.on_doc_change();
