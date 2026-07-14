-- Support / helpdesk tickets. Additive and idempotent -- safe to run against prod.

DO $$ BEGIN
  CREATE TYPE support_ticket_status AS ENUM ('open', 'pending', 'resolved', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE support_ticket_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS support_tickets (
  id               text PRIMARY KEY,
  subject          text NOT NULL,
  body             text NOT NULL DEFAULT '',
  requester_id     text NOT NULL,
  assignee_id      text,
  status           support_ticket_status NOT NULL DEFAULT 'open',
  priority         support_ticket_priority NOT NULL DEFAULT 'normal',
  partner_id       text,
  organisation_id  text,
  reply_count      integer NOT NULL DEFAULT 0,
  last_message_at  timestamp NOT NULL DEFAULT now(),
  created_at       timestamp NOT NULL DEFAULT now(),
  updated_at       timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id                text PRIMARY KEY,
  ticket_id         text NOT NULL,
  author_id         text NOT NULL,
  body              text NOT NULL,
  is_staff_reply    boolean NOT NULL DEFAULT false,
  is_internal_note  boolean NOT NULL DEFAULT false,
  created_at        timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_requester_idx ON support_tickets (requester_id);
CREATE INDEX IF NOT EXISTS support_tickets_partner_idx ON support_tickets (partner_id);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status);
CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id);
