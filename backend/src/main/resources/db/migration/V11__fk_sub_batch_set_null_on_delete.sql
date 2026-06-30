ALTER TABLE submissions DROP FOREIGN KEY fk_sub_batch;

ALTER TABLE submissions
    ADD CONSTRAINT fk_sub_batch FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE SET NULL;
