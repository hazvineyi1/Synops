-- Starter payment-methods catalog for Arete.
-- Safe to run more than once: each row is skipped if its `code` already exists.
-- Region codes should match the regions you use on your plans. Edit freely in
-- Admin -> Billing -> Payment methods after seeding.
--
-- Rails: stripe (live) | flutterwave (slice 2) | paynow (later) | manual (admin
-- confirms an out-of-band payment such as Remitly or a bank deposit).

INSERT INTO payment_methods (code, label, rail, regions, instructions, sort)
SELECT v.code, v.label, v.rail, v.regions::text[], v.instructions, v.sort
FROM (VALUES
  -- Diaspora / global: cards via Stripe (already live).
  ('card',          'Card / Apple Pay',            'stripe',      '{global}',        NULL, 0),

  -- Zimbabwe: EcoCash & OneMoney settle through Paynow.
  ('ecocash',       'EcoCash',                     'paynow',      '{ZW}',            NULL, 10),
  ('onemoney',      'OneMoney',                    'paynow',      '{ZW}',            NULL, 11),

  -- Mobile money via Flutterwave (charging lands in the Flutterwave slice).
  ('mtn_momo',      'MTN Mobile Money',            'flutterwave', '{ZM}',            NULL, 20),
  ('airtel_money',  'Airtel Money',                'flutterwave', '{ZM,ZW}',         NULL, 21),
  ('orange_money',  'Orange Money',                'flutterwave', '{BW,CI,SN,CM}',   NULL, 22),
  ('mpesa',         'M-Pesa',                      'flutterwave', '{KE,TZ}',         NULL, 23),

  -- Bank / instant EFT (South Africa, Zambia, Nigeria, Kenya) via Flutterwave.
  ('bank_transfer', 'Bank transfer / Instant EFT', 'flutterwave', '{ZA,ZM,NG,KE}',  NULL, 30),

  -- Manual rails: customer pays out-of-band, an admin marks them paid.
  ('remitly',       'Remitly (send to us)',        'manual',      '{global}',
     'Send your subscription payment via Remitly to the Synops account (ask billing for the current recipient details), then email the Remitly reference number to billing@synops-consulting.com. We activate your Pro plan within 24 hours.', 40),
  ('bank_deposit',  'Bank deposit',                'manual',      '{ZW,ZM,ZA}',
     'Deposit to the local Synops bank account (ask billing for details), then email proof of payment to billing@synops-consulting.com. We activate your Pro plan within 24 hours.', 41)
) AS v(code, label, rail, regions, instructions, sort)
WHERE NOT EXISTS (SELECT 1 FROM payment_methods pm WHERE pm.code = v.code);

SELECT code, label, rail, regions, active FROM payment_methods ORDER BY sort, label;
