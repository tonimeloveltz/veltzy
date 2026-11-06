-- 084 Automações — gatilho recorrente: marca do último disparo.
-- process-recurring-cadences usa (recurring_cron + recurring_last_run_at) p/ decidir o "due".
ALTER TABLE veltzy.cadences
  ADD COLUMN IF NOT EXISTS recurring_last_run_at timestamptz;
