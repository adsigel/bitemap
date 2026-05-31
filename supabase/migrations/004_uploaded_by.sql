ALTER TABLE sandwiches ADD COLUMN uploaded_by uuid REFERENCES auth.users(id);
CREATE INDEX idx_sandwiches_uploaded_by ON sandwiches(uploaded_by);
