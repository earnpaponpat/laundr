CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL,
    issue_date TIMESTAMPTZ DEFAULT now(),
    due_date TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('draft', 'pending', 'paid', 'overdue')) DEFAULT 'draft',
    subtotal NUMERIC(10, 2) DEFAULT 0,
    rewash_charges NUMERIC(10, 2) DEFAULT 0,
    loss_charges NUMERIC(10, 2) DEFAULT 0,
    total NUMERIC(10, 2) DEFAULT 0,
    items_json JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, invoice_number)
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'invoices' AND policyname = 'Users can only see their own org invoices'
    ) THEN
        CREATE POLICY "Users can only see their own org invoices" ON invoices FOR ALL USING (org_id = get_current_org_id());
    END IF;
END $$;
