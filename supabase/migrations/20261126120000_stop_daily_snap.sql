-- 오늘의 한 장 is turned off: stop the 10-minute alert job. Photos already taken stay in the database.
select cron.unschedule('uridul-snap') where exists (select 1 from cron.job where jobname = 'uridul-snap');
