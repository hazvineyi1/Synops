-- Pre-built, shared case-study library across entrepreneurship industries. These are
-- published library cases (organisation_id NULL, is_library true) that any org can run or
-- FORK and tweak for its own training. Every case carries a fact pattern (context_block),
-- a domain AI persona, focus areas and a calibrated opening question, so every dialogue is
-- grounded and personalised. Idempotent: ON CONFLICT (id) DO NOTHING preserves any edits.

INSERT INTO case_scenarios
  (id, created_by, created_by_name, title, learning_objective, context_block, opening_question, focus_areas, ai_persona, difficulty, is_library, status, tags)
VALUES
  ('lib_retail_pricing', 'system', 'Synops Library',
   'Pricing a spaza shop for profit',
   'Reason about how to price everyday goods so the business stays both profitable and competitive.',
   'Nomsa runs a spaza shop in a township. She buys 2-litre cold drinks for R14 and sells them for R16. The shop next door sells the same drink for R15. Her monthly rent is R1,800 and she spends about R600 on electricity for her fridges. She sells roughly 400 cold drinks a month plus other goods. Lately she feels busy all day but never has money left at month-end.',
   'Nomsa is busy all day but broke at month-end. Before we touch her prices, what do you think is actually eating her R2 profit on each cold drink?',
   ARRAY['markup vs margin', 'fixed costs vs per-unit profit', 'competitor pricing'],
   'a pragmatic small-business finance mentor who thinks in cash flow, margins and runway',
   'foundational', true, 'published', ARRAY['retail', 'pricing', 'finance']),

  ('lib_agri_cashflow', 'system', 'Synops Library',
   'Cash flow on a seasonal farm',
   'Manage cash when income arrives in lumps but expenses happen every week.',
   'Sipho grows spinach and cabbages on a rented plot. His crops take about 8 weeks to harvest, and he sells to a local market in bulk twice a season. He is paid in a lump sum at harvest, but he needs money every week for seeds, water, transport and a part-time helper. Twice now he has run out of cash mid-season and had to borrow from a neighbour at high interest.',
   'Sipho earns twice a season but spends every single week. Walk me through where his money actually is between harvests, and why he keeps running dry?',
   ARRAY['income timing vs expense timing', 'working capital', 'building a cash buffer'],
   'a pragmatic small-business finance mentor who thinks in cash flow, margins and runway',
   'intermediate', true, 'published', ARRAY['agriculture', 'cash flow', 'finance']),

  ('lib_catering_costing', 'system', 'Synops Library',
   'Costing a catering job',
   'Cost a job fully, including the hidden costs, and decide whether to take it.',
   'Thandi caters for events. A client asks her to cater a 100-person function for R8,000. Her ingredients will cost about R4,500. She will also need two helpers for the day, transport for the food, gas to cook, and disposable plates. She is excited about the exposure and wants to say yes immediately.',
   'The R8,000 job feels like a win. Before Thandi says yes, what costs is she likely forgetting, and could this job actually lose her money?',
   ARRAY['full cost vs ingredient cost', 'labour and overheads', 'pricing for profit not exposure'],
   'a pragmatic small-business finance mentor who thinks in cash flow, margins and runway',
   'foundational', true, 'published', ARRAY['food', 'costing', 'finance']),

  ('lib_salon_hiring', 'system', 'Synops Library',
   'When to hire your first employee',
   'Decide when and how to hire in order to grow past your own capacity.',
   'Lerato runs a one-chair hair salon and is fully booked six days a week, turning clients away. She is exhausted. She is considering hiring a second stylist, but worries about paying a salary in slow weeks and whether the new person will treat clients well. She has never managed anyone before.',
   'Lerato is turning away money because she is the only pair of hands. What is she really afraid of about hiring, and how could she test that fear cheaply before committing?',
   ARRAY['capacity constraint', 'fixed salary risk', 'trust and quality control'],
   'a people-and-leadership coach who helps founders hire, delegate and lead a small team',
   'intermediate', true, 'published', ARRAY['personal care', 'hiring', 'leadership']),

  ('lib_tech_acquisition', 'system', 'Synops Library',
   'Winning your first paying customer',
   'Find and win paying customers instead of endlessly improving the product.',
   'Bongani built a simple booking app for small clinics. He has spent three months making it better and better, but he only has one clinic using it, and they got it for free. He believes that if the app is good enough, clinics will simply come. His savings are almost gone.',
   'Bongani keeps improving the app but has one free user and no income. What is he assuming about how customers are won, and how would you test whether that assumption is even true?',
   ARRAY['build vs sell', 'customer discovery', 'willingness to pay'],
   'a seasoned sales and customer-discovery coach who has closed and lost many deals',
   'intermediate', true, 'published', ARRAY['technology', 'sales', 'customer acquisition']),

  ('lib_manuf_supplier', 'system', 'Synops Library',
   'Choosing a supplier beyond price',
   'Weigh supplier reliability and quality against unit price using total cost.',
   'Fatima makes school uniforms. Her fabric supplier is the cheapest in town but often delivers late and sometimes sends the wrong colour, forcing her to miss orders. A second supplier is 12% more expensive but reliable. Fatima always picks the cheapest option to protect her margins.',
   'Fatima chooses the cheapest fabric to protect her margin, yet keeps missing orders. What is that cheap supplier actually costing her that never shows up on the invoice?',
   ARRAY['total cost of ownership', 'reliability vs unit price', 'reputation and lost sales'],
   'an operations mentor focused on process, suppliers and reliable on-time delivery',
   'intermediate', true, 'published', ARRAY['manufacturing', 'suppliers', 'operations']),

  ('lib_tourism_marketing', 'system', 'Synops Library',
   'Cheap marketing for a guesthouse',
   'Attract guests affordably and turn happy guests into reputation and referrals.',
   'Ayanda runs a 4-room guesthouse in a small town. Occupancy is low midweek. She spends money on printed flyers but is not sure they work. She has had a few very happy guests but has never asked them for reviews or referrals, and she has no online presence at all.',
   'Ayanda pays for flyers she cannot measure while her happy guests stay completely silent online. Where is the cheapest, most trustworthy marketing she is already sitting on and ignoring?',
   ARRAY['measurable vs unmeasurable marketing', 'word of mouth and reviews', 'low-cost online presence'],
   'a scrappy growth-marketing strategist focused on cheap, testable ways to reach customers',
   'foundational', true, 'published', ARRAY['tourism', 'marketing']),

  ('lib_transport_utilisation', 'system', 'Synops Library',
   'Which deliveries actually make money',
   'Understand cost per trip and asset use rather than charging a flat rate.',
   'Kagiso owns one bakkie and does deliveries. He charges a flat R250 per delivery no matter the distance. Some days he does 6 short trips; some days one long trip eats his whole day and a full tank of fuel. His bakkie also needs a big service soon. He is not sure which trips actually make him money.',
   'Kagiso charges a flat R250 whether the trip is 5km or 80km. Which of his trips do you suspect are secretly losing him money, and how would he find out for sure?',
   ARRAY['cost per trip vs flat pricing', 'fuel and time', 'maintenance and depreciation'],
   'a pragmatic small-business finance mentor who thinks in cash flow, margins and runway',
   'intermediate', true, 'published', ARRAY['transport', 'logistics', 'finance']),

  ('lib_crafts_labour', 'system', 'Synops Library',
   'Pricing handmade goods and your time',
   'Price handmade products to include your own labour, and judge a wholesale offer.',
   'Zinhle makes beaded jewellery she sells at markets. A necklace takes her 3 hours and R40 of beads. She sells it for R120 and feels good about R80 profit. She works every evening and weekend but somehow cannot save. A shop now offers to buy 50 pieces if she drops the price to R90 each.',
   'Zinhle counts R80 profit on each necklace but never manages to save. What is she simply not paying herself for, and what does that mean for the shop''s R90 offer?',
   ARRAY['labour as a real cost', 'true hourly rate', 'wholesale vs retail pricing'],
   'a pragmatic small-business finance mentor who thinks in cash flow, margins and runway',
   'intermediate', true, 'published', ARRAY['creative', 'pricing', 'finance']),

  ('lib_construction_quoting', 'system', 'Synops Library',
   'Quoting a job and controlling scope',
   'Quote accurately and manage scope creep, deposits and change requests.',
   'Themba is a builder. He quoted R30,000 to build a small room, based mostly on memory. Halfway through, the client keeps asking for small extras: a bigger window, better tiles, an extra plug point. Themba does not want to seem difficult, so he says yes each time. He took no deposit and is now paying for materials from his own pocket.',
   'Themba''s R30,000 quote is bleeding from small extras and he took no deposit. Where exactly did he lose control of this job, and what should have been agreed before the first brick was laid?',
   ARRAY['detailed quoting', 'scope creep and change orders', 'deposits and cash flow'],
   'a plain-language business advisor who helps founders reason about risk, pricing and agreements',
   'advanced', true, 'published', ARRAY['construction', 'quoting', 'operations'])
ON CONFLICT (id) DO NOTHING;
