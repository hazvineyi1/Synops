/**
 * Seed script for Synops Praxis — creates demo partners, orgs, users,
 * courses, modules, beats, assignments, discussions, and events.
 *
 * Run: pnpm --filter @workspace/db run seed
 * Safe to re-run — uses onConflictDoNothing for all inserts.
 */

import { db } from "./index";
import {
  partnersTable, organisationsTable, usersTable, brandThemesTable,
  coursesTable, modulesTable, beatsTable, assessmentsTable, assessmentItemsTable,
  enrolmentsTable, assignmentsTable, discussionsTable, discussionRepliesTable,
  announcementsTable, courseEventsTable, coursePagesTable, courseGroupsTable,
  courseGroupMembersTable, notificationsTable, credentialsTable,
} from "./schema";
import { sql } from "drizzle-orm";

const uuid = () => crypto.randomUUID();

async function seed() {
  console.log("🌱 Seeding Synops Praxis...");

  // ─── Partners ─────────────────────────────────────────────────────────────
  const [talentforge, skillbridge] = await db.insert(partnersTable).values([
    { id: "partner_talentforge", name: "TalentForge SA", slug: "talentforge", status: "active", contactEmail: "admin@talentforge.co.za", orgCount: 2, learnerCount: 12 },
    { id: "partner_skillbridge", name: "SkillBridge Africa", slug: "skillbridge", status: "active", contactEmail: "admin@skillbridge.co.za", orgCount: 1, learnerCount: 8 },
  ]).onConflictDoNothing().returning();

  // ─── Organisations ────────────────────────────────────────────────────────
  const [mtn, vodacom, shoprite] = await db.insert(organisationsTable).values([
    { id: "org_mtn", name: "MTN Skills Academy", partnerId: "partner_talentforge", industry: "Telecommunications", memberCount: 8 },
    { id: "org_vodacom", name: "Vodacom Learning Centre", partnerId: "partner_talentforge", industry: "Telecommunications", memberCount: 6 },
    { id: "org_shoprite", name: "Shoprite Workforce Development", partnerId: "partner_skillbridge", industry: "Retail", memberCount: 8 },
  ]).onConflictDoNothing().returning();

  // ─── Brand Themes ─────────────────────────────────────────────────────────
  await db.insert(brandThemesTable).values([
    { id: "theme_talentforge", tenantId: "partner_talentforge", tenantType: "partner", displayName: "TalentForge SA", primaryColor: "#1a3a5c", secondaryColor: "#e87722", accentColor: "#00a86b", credentialTitle: "TalentMark", fontFamily: "Inter" },
    { id: "theme_skillbridge", tenantId: "partner_skillbridge", tenantType: "partner", displayName: "SkillBridge Africa", primaryColor: "#2d2d6b", secondaryColor: "#f4a100", accentColor: "#0ea5e9", credentialTitle: "SkillMark", fontFamily: "Outfit" },
  ]).onConflictDoNothing();

  // ─── Users ────────────────────────────────────────────────────────────────
  const users = [
    { id: "user_superadmin", clerkId: "seed_superadmin", email: "super@praxis.dev", firstName: "Praxis", lastName: "Admin", role: "super_admin" as const },
    { id: "user_admin_tf", clerkId: "seed_admin_tf", email: "james.mokoena@talentforge.co.za", firstName: "James", lastName: "Mokoena", role: "partner_admin" as const, partnerId: "partner_talentforge" },
    { id: "user_admin_sb", clerkId: "seed_admin_sb", email: "sarah.williams@skillbridge.co.za", firstName: "Sarah", lastName: "Williams", role: "partner_admin" as const, partnerId: "partner_skillbridge" },
    { id: "user_orgadmin_mtn", clerkId: "seed_orgadmin_mtn", email: "thabo.dlamini@mtn.com", firstName: "Thabo", lastName: "Dlamini", role: "org_admin" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_orgadmin_voda", clerkId: "seed_orgadmin_voda", email: "nomsa.khumalo@vodacom.com", firstName: "Nomsa", lastName: "Khumalo", role: "org_admin" as const, partnerId: "partner_talentforge", organisationId: "org_vodacom" },
    { id: "user_orgadmin_shop", clerkId: "seed_orgadmin_shop", email: "sipho.nkosi@shoprite.co.za", firstName: "Sipho", lastName: "Nkosi", role: "org_admin" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
    { id: "user_coach_tf1", clerkId: "seed_coach_tf1", email: "aisha.patel@talentforge.co.za", firstName: "Aisha", lastName: "Patel", role: "coach" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_coach_tf2", clerkId: "seed_coach_tf2", email: "dev.maharaj@talentforge.co.za", firstName: "Dev", lastName: "Maharaj", role: "coach" as const, partnerId: "partner_talentforge", organisationId: "org_vodacom" },
    { id: "user_coach_sb1", clerkId: "seed_coach_sb1", email: "lindiwe.zulu@skillbridge.co.za", firstName: "Lindiwe", lastName: "Zulu", role: "coach" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
    // Learners — MTN
    { id: "user_l01", clerkId: "seed_l01", email: "bongani.mthembu@mtn.com", firstName: "Bongani", lastName: "Mthembu", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_l02", clerkId: "seed_l02", email: "zanele.mokoena@mtn.com", firstName: "Zanele", lastName: "Mokoena", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_l03", clerkId: "seed_l03", email: "lungelo.ndlovu@mtn.com", firstName: "Lungelo", lastName: "Ndlovu", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_l04", clerkId: "seed_l04", email: "precious.sithole@mtn.com", firstName: "Precious", lastName: "Sithole", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    { id: "user_l05", clerkId: "seed_l05", email: "siyanda.ngubane@mtn.com", firstName: "Siyanda", lastName: "Ngubane", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_mtn" },
    // Learners — Vodacom
    { id: "user_l06", clerkId: "seed_l06", email: "tshegofatso.molefe@vodacom.com", firstName: "Tshegofatso", lastName: "Molefe", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_vodacom" },
    { id: "user_l07", clerkId: "seed_l07", email: "khanyisile.dube@vodacom.com", firstName: "Khanyisile", lastName: "Dube", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_vodacom" },
    { id: "user_l08", clerkId: "seed_l08", email: "mpho.tau@vodacom.com", firstName: "Mpho", lastName: "Tau", role: "learner" as const, partnerId: "partner_talentforge", organisationId: "org_vodacom" },
    // Learners — Shoprite
    { id: "user_l09", clerkId: "seed_l09", email: "sibusiso.mabaso@shoprite.co.za", firstName: "Sibusiso", lastName: "Mabaso", role: "learner" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
    { id: "user_l10", clerkId: "seed_l10", email: "ntombifikile.hadebe@shoprite.co.za", firstName: "Ntombifikile", lastName: "Hadebe", role: "learner" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
    { id: "user_l11", clerkId: "seed_l11", email: "wiseman.cele@shoprite.co.za", firstName: "Wiseman", lastName: "Cele", role: "learner" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
    { id: "user_l12", clerkId: "seed_l12", email: "nobuhle.mhlongo@shoprite.co.za", firstName: "Nobuhle", lastName: "Mhlongo", role: "learner" as const, partnerId: "partner_skillbridge", organisationId: "org_shoprite" },
  ];
  await db.insert(usersTable).values(users as any).onConflictDoNothing();
  console.log("  ✓ Users seeded");

  // ─── Courses ──────────────────────────────────────────────────────────────
  const courses = [
    { id: "course_biz", title: "Business Management Fundamentals", description: "A practical introduction to running a successful business in the South African context. Covers planning, finance, marketing, operations, and leadership.", tenantId: "partner_talentforge", status: "published" as const, moduleCount: 5, competencyTags: ["Business Planning", "Financial Management", "Leadership"], nqfLevel: 4 },
    { id: "course_finlit", title: "Financial Literacy for the Modern Workforce", description: "Build the financial knowledge and skills needed to manage personal and business finances effectively. Relevant to NQF Level 3 learners.", tenantId: "partner_talentforge", status: "published" as const, moduleCount: 4, competencyTags: ["Financial Literacy", "Budgeting", "Credit Management"], nqfLevel: 3 },
    { id: "course_cx", title: "Customer Service Excellence in SA", description: "Master the art of delivering exceptional customer experiences in South Africa's diverse marketplace. From frontline service to complaint resolution.", tenantId: "partner_skillbridge", status: "published" as const, moduleCount: 3, competencyTags: ["Customer Service", "Communication", "Conflict Resolution"], nqfLevel: 3 },
    { id: "course_digital", title: "Digital Skills for the Workplace", description: "Essential digital literacy for the 21st century employee — from email etiquette to cloud collaboration tools.", tenantId: "partner_talentforge", status: "draft" as const, moduleCount: 2, competencyTags: ["Digital Literacy", "Communication"], nqfLevel: 2 },
  ];
  await db.insert(coursesTable).values(courses as any).onConflictDoNothing();
  console.log("  ✓ Courses seeded");

  // ─── Modules & Beats ──────────────────────────────────────────────────────
  const modules = [
    // Business Management
    { id: "mod_biz_01", courseId: "course_biz", title: "Introduction to Business Principles", order: 1, status: "published" as const, estimatedMinutes: 20, beatCount: 5 },
    { id: "mod_biz_02", courseId: "course_biz", title: "Financial Planning Basics", order: 2, status: "published" as const, estimatedMinutes: 25, beatCount: 5 },
    { id: "mod_biz_03", courseId: "course_biz", title: "Marketing & Customer Acquisition", order: 3, status: "published" as const, estimatedMinutes: 20, beatCount: 4 },
    { id: "mod_biz_04", courseId: "course_biz", title: "Operations Management", order: 4, status: "published" as const, estimatedMinutes: 20, beatCount: 4 },
    { id: "mod_biz_05", courseId: "course_biz", title: "Leadership & Team Building", order: 5, status: "published" as const, estimatedMinutes: 18, beatCount: 4 },
    // Financial Literacy
    { id: "mod_fin_01", courseId: "course_finlit", title: "Understanding Money & Banking", order: 1, status: "published" as const, estimatedMinutes: 18, beatCount: 4 },
    { id: "mod_fin_02", courseId: "course_finlit", title: "Budgeting & Cash Flow", order: 2, status: "published" as const, estimatedMinutes: 22, beatCount: 5 },
    { id: "mod_fin_03", courseId: "course_finlit", title: "Credit & Debt Management", order: 3, status: "published" as const, estimatedMinutes: 20, beatCount: 4 },
    { id: "mod_fin_04", courseId: "course_finlit", title: "Investment Basics", order: 4, status: "published" as const, estimatedMinutes: 20, beatCount: 4 },
    // Customer Service
    { id: "mod_cx_01", courseId: "course_cx", title: "The Customer-Centric Mindset", order: 1, status: "published" as const, estimatedMinutes: 18, beatCount: 4 },
    { id: "mod_cx_02", courseId: "course_cx", title: "Communication Skills for Service", order: 2, status: "published" as const, estimatedMinutes: 22, beatCount: 5 },
    { id: "mod_cx_03", courseId: "course_cx", title: "Handling Difficult Situations", order: 3, status: "published" as const, estimatedMinutes: 20, beatCount: 4 },
    // Digital Skills
    { id: "mod_dig_01", courseId: "course_digital", title: "Digital Literacy Fundamentals", order: 1, status: "draft" as const, estimatedMinutes: 15, beatCount: 3 },
    { id: "mod_dig_02", courseId: "course_digital", title: "Email & Professional Communication", order: 2, status: "draft" as const, estimatedMinutes: 18, beatCount: 4 },
  ];
  await db.insert(modulesTable).values(modules as any).onConflictDoNothing();

  // ─── Beats ────────────────────────────────────────────────────────────────
  const beats = [
    // mod_biz_01: Introduction to Business Principles
    { id: "beat_b01_01", moduleId: "mod_biz_01", type: "title_card" as const, order: 1, title: "What Is a Business?", narration: "A business is any organisation that produces goods or services in exchange for value. In South Africa, businesses range from sole traders in township markets to JSE-listed corporations." },
    { id: "beat_b01_02", moduleId: "mod_biz_01", type: "points" as const, order: 2, title: "The Four Functions of Business", narration: "Every business, regardless of size, performs four core functions that must work in harmony.", bulletPoints: ["Operations — producing the product or service", "Marketing — creating awareness and attracting customers", "Finance — managing money and resources", "Human Resources — building and developing teams"] },
    { id: "beat_b01_03", moduleId: "mod_biz_01", type: "scenario" as const, order: 3, title: "Thandeka's Catering Business", narration: "Thandeka runs a catering business from Soweto. She has excellent cooking skills but struggles to attract corporate clients.", scenario: "Thandeka has been catering township events for two years and earns R8 000 per month. A colleague suggests she approach corporate clients, but Thandeka is unsure how to present herself. She has no business cards, no website, and quotes prices verbally. What should Thandeka prioritise first to grow her business professionally?" },
    { id: "beat_b01_04", moduleId: "mod_biz_01", type: "compare" as const, order: 4, title: "Formal vs Informal Business Practices", narration: "Operating formally offers protection and credibility, even if it requires more effort upfront.", bulletPoints: ["No written contracts — disputes are hard to resolve", "No records — SARS compliance becomes impossible", "Written contracts protect both parties", "Proper records enable tax compliance and funding access"] },
    { id: "beat_b01_05", moduleId: "mod_biz_01", type: "close" as const, order: 5, title: "Module Summary", narration: "A successful business balances all four functions — operations, marketing, finance, and HR. Formalising your practice builds credibility and opens doors to growth.", bulletPoints: ["Define what your business does and who it serves", "Formalise contracts, records, and processes", "Balance all four business functions deliberately"] },

    // mod_biz_02: Financial Planning
    { id: "beat_b02_01", moduleId: "mod_biz_02", type: "title_card" as const, order: 1, title: "Financial Planning for Business", narration: "Financial planning means knowing where your money comes from, where it goes, and how to make it work harder for your business." },
    { id: "beat_b02_02", moduleId: "mod_biz_02", type: "points" as const, order: 2, title: "Revenue vs Profit", narration: "Many business owners confuse revenue with profit — understanding the difference is the foundation of financial literacy.", bulletPoints: ["Revenue = total money received from sales", "Costs = all expenses to produce and sell", "Gross profit = Revenue minus direct costs", "Net profit = Gross profit minus operating expenses"] },
    { id: "beat_b02_03", moduleId: "mod_biz_02", type: "scenario" as const, order: 3, title: "Sipho's Spaza Shop", narration: "Sipho earns R30 000 per month from his spaza shop but feels like he never has money. Let's examine why.", scenario: "Sipho's spaza shop turns over R30 000 per month. He spends R22 000 on stock, R3 000 on rent, R1 500 on electricity, and R500 on airtime. He takes R3 000 from the till each week for household expenses, without recording it. At month end, Sipho has R500 left and cannot understand why. What is Sipho's key financial problem, and what would you advise?" },
    { id: "beat_b02_04", moduleId: "mod_biz_02", type: "points" as const, order: 4, title: "Cash Flow Management", narration: "Profit on paper means nothing if you run out of cash. Managing timing is as important as managing amounts.", bulletPoints: ["Track when money arrives, not just when it's owed", "Keep 2–3 months of operating costs as reserves", "Invoice immediately — delay destroys cash flow", "Negotiate 30-day supplier terms where possible"] },
    { id: "beat_b02_05", moduleId: "mod_biz_02", type: "close" as const, order: 5, title: "Module Summary", narration: "Revenue and profit are different things. Cash flow determines survival. Separate personal and business finances from day one.", bulletPoints: ["Track all income and expenses in writing", "Build a cash reserve equal to 2 months of costs", "Never mix personal and business funds"] },

    // mod_fin_01: Understanding Money & Banking
    { id: "beat_f01_01", moduleId: "mod_fin_01", type: "title_card" as const, order: 1, title: "Understanding Money & Banking", narration: "Money is a tool. Understanding how the South African banking system works gives you control over your financial future." },
    { id: "beat_f01_02", moduleId: "mod_fin_01", type: "points" as const, order: 2, title: "How Banks Work", narration: "Banks are intermediaries that connect people who have money with people who need it.", bulletPoints: ["Banks accept deposits and pay interest to savers", "Banks lend deposits to borrowers at higher interest rates", "The difference — the spread — is the bank's profit", "SARB regulates all South African banks"] },
    { id: "beat_f01_03", moduleId: "mod_fin_01", type: "scenario" as const, order: 3, title: "Choosing the Right Account", narration: "Nompumelelo just got her first job and earns R6 500 per month. She needs to decide which bank account to open.", scenario: "Nompumelelo earns R6 500 per month and currently keeps her cash at home. Her employer insists on paying via EFT. She visits a bank and is offered three options: a basic savings account (no monthly fee, limited transactions), a cheque account (R135/month fee, unlimited transactions), and a premium account (R350/month, travel insurance, airport lounge). Which account should Nompumelelo choose, and why?" },
    { id: "beat_f01_04", moduleId: "mod_fin_01", type: "compare" as const, order: 4, title: "Transactional vs Savings Accounts", narration: "Each account type serves a different purpose. Using them correctly reduces fees and builds savings.", bulletPoints: ["Transactional: high fees, daily spending, linked to card", "Savings: lower fees, earns interest, limited withdrawals", "Use a transactional account for daily spending", "Park surplus in savings to earn interest"] },

    // mod_cx_01: Customer-Centric Mindset
    { id: "beat_c01_01", moduleId: "mod_cx_01", type: "title_card" as const, order: 1, title: "The Customer-Centric Mindset", narration: "Customer service is not a department — it is an attitude. Every interaction either builds or destroys the customer's trust in your brand." },
    { id: "beat_c01_02", moduleId: "mod_cx_01", type: "points" as const, order: 2, title: "Why Customers Leave", narration: "Understanding why customers defect is the first step to retaining them.", bulletPoints: ["68% leave because of perceived indifference from staff", "14% leave due to product or service quality", "9% leave for competitive reasons", "Only 1% die or move away"] },
    { id: "beat_c01_03", moduleId: "mod_cx_01", type: "scenario" as const, order: 3, title: "The Long Queue", narration: "A Monday morning at a busy Shoprite checkout. The queue is 15 people long. Patience is wearing thin.", scenario: "You are a cashier at Shoprite on a Monday morning. There are 15 people in your queue. A customer reaches the front after waiting 12 minutes and aggressively says, 'This is ridiculous! I've been waiting forever. You people are useless!' Your supervisor is busy. What do you say and do in the next 30 seconds?" },
    { id: "beat_c01_04", moduleId: "mod_cx_01", type: "compare" as const, order: 4, title: "Reactive vs Proactive Service", narration: "Great service anticipates needs before customers have to ask.", bulletPoints: ["Reactive: wait for complaints before acting", "Reactive: fix problems after they escalate", "Proactive: communicate delays before customers ask", "Proactive: solve potential problems before they occur"] },

    // mod_cx_02: Communication Skills
    { id: "beat_c02_01", moduleId: "mod_cx_02", type: "title_card" as const, order: 1, title: "Communication Skills for Service", narration: "In a country with 11 official languages, communication skill is a superpower. Clarity, empathy, and tone define every service interaction." },
    { id: "beat_c02_02", moduleId: "mod_cx_02", type: "points" as const, order: 2, title: "The LEAPS Model", narration: "The LEAPS model gives frontline staff a structured approach to every difficult conversation.", bulletPoints: ["Listen — give full attention without interrupting", "Empathise — acknowledge the customer's feelings", "Apologise — sincerely, for the inconvenience", "Problem-solve — offer a concrete solution", "Summarise — confirm the agreed resolution"] },
    { id: "beat_c02_03", moduleId: "mod_cx_02", type: "scenario" as const, order: 3, title: "The Billing Dispute", narration: "A customer calls in furious about a double charge on their account. They threaten to cancel.", scenario: "Mrs Dlamini calls customer service at 8am. She has been charged twice for her monthly data bundle. She is upset and says, 'I'm cancelling my contract! I've been with this network for 10 years and this is how you treat me!' Using the LEAPS model, how do you handle this call? Walk through each step." },
    { id: "beat_c02_04", moduleId: "mod_cx_02", type: "points" as const, order: 4, title: "Written Communication", narration: "Email and chat support require a different skill set — clarity replaces tone of voice.", bulletPoints: ["Use the customer's name in every response", "Mirror their language level — avoid technical jargon", "Structure: acknowledge → action → outcome → close", "Respond within 4 business hours maximum"] },
    { id: "beat_c02_05", moduleId: "mod_cx_02", type: "close" as const, order: 5, title: "Module Summary", narration: "Great communication is active, empathetic, and structured. The LEAPS model gives you a reliable framework for any difficult interaction.", bulletPoints: ["Always acknowledge feelings before solving problems", "Use LEAPS for escalated situations", "Written communication must be clear, warm, and timely"] },

    // Digital Skills basics
    { id: "beat_d01_01", moduleId: "mod_dig_01", type: "title_card" as const, order: 1, title: "Digital Literacy Fundamentals", narration: "Digital literacy is no longer optional. Every workplace — from spaza shops to corporate offices — now requires basic digital skills." },
    { id: "beat_d01_02", moduleId: "mod_dig_01", type: "points" as const, order: 2, title: "Core Digital Skills", narration: "There are five foundational digital skills that every employee needs to function effectively in a modern workplace.", bulletPoints: ["Communication — email, WhatsApp, video calls", "Information literacy — searching, evaluating, citing", "Data handling — spreadsheets, basic data entry", "Security — passwords, phishing, privacy", "Collaboration — shared documents, cloud tools"] },
    { id: "beat_d01_03", moduleId: "mod_dig_01", type: "scenario" as const, order: 3, title: "Spotting a Phishing Email", narration: "Phishing emails cost South African businesses over R2 billion annually. Knowing how to spot them is critical.", scenario: "You receive an email from 'hr@your-company-sa.net' saying: 'Urgent: Your payslip details need updating. Click here to confirm your bank account number or your March salary will be delayed.' The email looks professional with your company's logo. What red flags do you see, and what do you do?" },
  ];
  await db.insert(beatsTable).values(beats as any).onConflictDoNothing();
  console.log("  ✓ Modules & beats seeded");

  // ─── Assessments ──────────────────────────────────────────────────────────
  await db.insert(assessmentsTable).values([
    { id: "assess_biz", title: "Business Management Diagnostic", description: "Assess your baseline knowledge of business management principles.", type: "diagnostic" as const, status: "active" as const, tenantId: "partner_talentforge", competencyTags: ["Business Planning", "Financial Management"] },
    { id: "assess_finlit", title: "Financial Literacy Assessment", description: "Test your understanding of personal and business finance.", type: "mastery" as const, status: "active" as const, tenantId: "partner_talentforge", competencyTags: ["Financial Literacy", "Budgeting"] },
    { id: "assess_cx", title: "Customer Service Readiness", description: "Evaluate your customer service skills and knowledge.", type: "diagnostic" as const, status: "active" as const, tenantId: "partner_skillbridge", competencyTags: ["Customer Service", "Communication"] },
  ]).onConflictDoNothing();

  await db.insert(assessmentItemsTable).values([
    { id: "item_biz_01", assessmentId: "assess_biz", stem: "A business earns R50 000 in revenue but spends R35 000 on stock and R10 000 on rent and salaries. What is its net profit?", options: JSON.stringify([{id:"a",text:"R15 000"},{id:"b",text:"R5 000"},{id:"c",text:"R40 000"},{id:"d",text:"R50 000"}]), correctOptionId: "b", difficulty: "0.5", competencyTag: "Financial Management", order: 1 },
    { id: "item_biz_02", assessmentId: "assess_biz", stem: "Which of the following is NOT one of the four core functions of a business?", options: JSON.stringify([{id:"a",text:"Marketing"},{id:"b",text:"Logistics"},{id:"c",text:"Finance"},{id:"d",text:"Human Resources"}]), correctOptionId: "b", difficulty: "0.4", competencyTag: "Business Planning", order: 2 },
    { id: "item_biz_03", assessmentId: "assess_biz", stem: "Thandeka separates her personal and business bank accounts. This is an example of:", options: JSON.stringify([{id:"a",text:"Tax evasion"},{id:"b",text:"Good financial hygiene"},{id:"c",text:"Over-complicating her finances"},{id:"d",text:"A legal requirement only for companies"}]), correctOptionId: "b", difficulty: "0.3", competencyTag: "Financial Management", order: 3 },
    { id: "item_fin_01", assessmentId: "assess_finlit", stem: "What does 'compound interest' mean?", options: JSON.stringify([{id:"a",text:"Interest calculated only on the original amount"},{id:"b",text:"Interest calculated on the principal plus previously earned interest"},{id:"c",text:"A fixed fee charged by banks"},{id:"d",text:"Interest that decreases over time"}]), correctOptionId: "b", difficulty: "0.6", competencyTag: "Financial Literacy", order: 1 },
    { id: "item_cx_01", assessmentId: "assess_cx", stem: "According to research, what percentage of customers leave a business due to perceived staff indifference?", options: JSON.stringify([{id:"a",text:"14%"},{id:"b",text:"35%"},{id:"c",text:"68%"},{id:"d",text:"9%"}]), correctOptionId: "c", difficulty: "0.5", competencyTag: "Customer Service", order: 1 },
  ]).onConflictDoNothing();
  console.log("  ✓ Assessments seeded");

  // ─── Enrolments ───────────────────────────────────────────────────────────
  const enrolments = [
    // MTN learners → Business Management
    { id: uuid(), userId: "user_l01", courseId: "course_biz", status: "active" as const },
    { id: uuid(), userId: "user_l02", courseId: "course_biz", status: "active" as const },
    { id: uuid(), userId: "user_l03", courseId: "course_biz", status: "completed" as const, finalGrade: "87.5", finalLetterGrade: "B+" },
    { id: uuid(), userId: "user_l04", courseId: "course_biz", status: "active" as const },
    { id: uuid(), userId: "user_l05", courseId: "course_biz", status: "active" as const },
    // MTN learners → Financial Literacy
    { id: uuid(), userId: "user_l01", courseId: "course_finlit", status: "active" as const },
    { id: uuid(), userId: "user_l02", courseId: "course_finlit", status: "active" as const },
    { id: uuid(), userId: "user_l03", courseId: "course_finlit", status: "active" as const },
    // Vodacom learners
    { id: uuid(), userId: "user_l06", courseId: "course_biz", status: "active" as const },
    { id: uuid(), userId: "user_l07", courseId: "course_biz", status: "active" as const },
    { id: uuid(), userId: "user_l08", courseId: "course_finlit", status: "active" as const },
    // Shoprite learners → Customer Service
    { id: uuid(), userId: "user_l09", courseId: "course_cx", status: "active" as const },
    { id: uuid(), userId: "user_l10", courseId: "course_cx", status: "active" as const },
    { id: uuid(), userId: "user_l11", courseId: "course_cx", status: "completed" as const, finalGrade: "91", finalLetterGrade: "A" },
    { id: uuid(), userId: "user_l12", courseId: "course_cx", status: "active" as const },
  ];
  await db.insert(enrolmentsTable).values(enrolments as any).onConflictDoNothing();
  console.log("  ✓ Enrolments seeded");

  // ─── Assignments ──────────────────────────────────────────────────────────
  const now = new Date();
  const inDays = (n: number) => new Date(now.getTime() + n * 86400000);
  const ago = (n: number) => new Date(now.getTime() - n * 86400000);

  await db.insert(assignmentsTable).values([
    { id: "asgn_biz_01", courseId: "course_biz", moduleId: "mod_biz_01", title: "Business Principles Reflection", description: "Reflect on a business in your community and analyse it using the four functions framework.", instructions: "Write 400–600 words identifying how a local business (formal or informal) performs each of the four core business functions. Use specific examples.", submissionType: "essay" as const, dueDate: inDays(7), pointsPossible: "100", published: true, position: 1 },
    { id: "asgn_biz_02", courseId: "course_biz", moduleId: "mod_biz_02", title: "Cash Flow Statement Exercise", description: "Create a simplified 3-month cash flow statement for a fictional small business.", instructions: "Using the template provided, complete a cash flow statement for Thandeka's Catering for January, February, and March. Include at least 8 income and expense line items.", submissionType: "file_upload" as const, dueDate: inDays(14), pointsPossible: "150", published: true, position: 2 },
    { id: "asgn_biz_03", courseId: "course_biz", title: "Business Plan Draft", description: "Develop a one-page business plan for a business idea of your choice.", submissionType: "essay" as const, dueDate: inDays(21), pointsPossible: "200", published: true, position: 3 },
    { id: "asgn_fin_01", courseId: "course_finlit", moduleId: "mod_fin_02", title: "Personal Budget Analysis", description: "Analyse your own monthly budget and identify three areas for improvement.", instructions: "Complete the monthly budget worksheet for your personal finances. Categorise all income and expenses. Write a 300-word reflection identifying your top spending categories and where you could reduce costs.", submissionType: "essay" as const, dueDate: inDays(5), pointsPossible: "100", published: true, position: 1 },
    { id: "asgn_cx_01", courseId: "course_cx", moduleId: "mod_cx_02", title: "LEAPS Model Role Play Script", description: "Write a role-play script demonstrating the LEAPS model in a difficult customer interaction.", instructions: "Write a dialogue (minimum 15 exchanges) between a customer service agent and an angry customer. The script must clearly demonstrate all five LEAPS steps. Include stage directions.", submissionType: "essay" as const, dueDate: inDays(10), pointsPossible: "100", published: true, position: 1 },
    { id: "asgn_cx_02", courseId: "course_cx", title: "Service Recovery Case Study", description: "Analyse a real or fictional service failure and propose a recovery plan.", submissionType: "essay" as const, dueDate: ago(3), pointsPossible: "100", published: true, position: 2 },
  ]).onConflictDoNothing();
  console.log("  ✓ Assignments seeded");

  // ─── Discussions ──────────────────────────────────────────────────────────
  await db.insert(discussionsTable).values([
    { id: "disc_biz_01", courseId: "course_biz", authorId: "user_coach_tf1", title: "Introduce yourself and your business idea", body: "Welcome to Business Management Fundamentals! Please share your name, where you work or study, and one business idea you have always wanted to explore. This is a safe space — no idea is too big or too small.", isPinned: true, replyCount: 5, createdAt: ago(10) },
    { id: "disc_biz_02", courseId: "course_biz", authorId: "user_coach_tf1", title: "Module 1 Discussion: What makes a business sustainable?", body: "After completing Module 1, reflect on this question: What is the most important factor that determines whether a small business survives its first three years in South Africa? Use examples from your own experience or research to support your answer.", replyCount: 3, createdAt: ago(5) },
    { id: "disc_fin_01", courseId: "course_finlit", authorId: "user_coach_tf2", title: "Share your biggest money mistake (and what you learned)", body: "We all make financial mistakes. Sharing them openly helps others avoid the same traps. What is one financial mistake you have made, and what would you do differently? (Be as specific or as general as you are comfortable with.)", isPinned: true, replyCount: 4, createdAt: ago(7) },
    { id: "disc_cx_01", courseId: "course_cx", authorId: "user_coach_sb1", title: "Week 1 Check-in: What does excellent customer service look like to YOU?", body: "Before we dive into theory, let us ground this course in your lived experience. Describe the best customer service experience you have ever received — what made it stand out? And the worst — what went wrong and how should it have been handled?", isPinned: true, replyCount: 6, createdAt: ago(8) },
    { id: "disc_cx_02", courseId: "course_cx", authorId: "user_l09", title: "Question: How do you stay calm when a customer is verbally abusive?", body: "I work on a till at a busy store. Sometimes customers say really hurtful things when they are frustrated, even though it is not my fault. The LEAPS model helps but sometimes the anger is directed at me personally. How do you protect yourself emotionally while still being professional?", replyCount: 3, createdAt: ago(2) },
  ]).onConflictDoNothing();

  await db.insert(discussionRepliesTable).values([
    { id: uuid(), discussionId: "disc_biz_01", authorId: "user_l01", body: "Hi everyone! I'm Bongani from MTN's network operations team. My business idea is a mobile car wash service using eco-friendly products. I've been thinking about it for two years but haven't taken the step.", isInstructorReply: false, createdAt: ago(9) },
    { id: uuid(), discussionId: "disc_biz_01", authorId: "user_l02", body: "I'm Zanele, also from MTN. My dream is to open a crèche in Soweto — there is a massive shortage of quality ECD facilities in my area and I have seen the difference good early education makes.", isInstructorReply: false, createdAt: ago(9) },
    { id: uuid(), discussionId: "disc_biz_01", authorId: "user_coach_tf1", body: "Bongani and Zanele — both of you have identified real market gaps. That is the foundation of any good business. Over the next five modules, you'll develop the skills to evaluate and plan both of these ideas. Keep them in mind as we work through each concept.", isInstructorReply: true, createdAt: ago(8) },
    { id: uuid(), discussionId: "disc_cx_01", authorId: "user_l09", body: "Best experience: At a Woolworths Food in Rosebank, I couldn't find an item and an employee not only walked me to it but explained how to prepare it. Worst experience: A bank branch where I waited 45 minutes only to be told the system was down and I had to come back — no one told me while I was waiting.", isInstructorReply: false, createdAt: ago(7) },
    { id: uuid(), discussionId: "disc_cx_01", authorId: "user_coach_sb1", body: "These are perfect examples of the difference between reactive and proactive service. Sibusiso's bank experience is exactly what we will explore in Module 1 — when systems fail, communication becomes even more critical. Thank you for sharing!", isInstructorReply: true, createdAt: ago(6) },
  ]).onConflictDoNothing();
  console.log("  ✓ Discussions seeded");

  // ─── Announcements ────────────────────────────────────────────────────────
  await db.insert(announcementsTable).values([
    { id: "ann_biz_01", courseId: "course_biz", authorId: "user_coach_tf1", title: "Welcome to Business Management Fundamentals!", body: "Welcome to the course. We are excited to have you here. Please complete your profile and introduce yourself in the Discussion board. Module 1 is now open — work through it at your own pace before our first live session on Friday.", pinned: true, publishedAt: ago(12), createdAt: ago(12) },
    { id: "ann_biz_02", courseId: "course_biz", authorId: "user_coach_tf1", title: "Assignment 1 now open — due in 7 days", body: "The first assignment, Business Principles Reflection, is now live. You have 7 days to submit. Please read the instructions carefully and aim for 400–600 words. Quality of reasoning matters more than length. Reach out on the discussions board if you have questions.", publishedAt: ago(3), createdAt: ago(3) },
    { id: "ann_cx_01", courseId: "course_cx", authorId: "user_coach_sb1", title: "Live session this Thursday — Handling Difficult Customers", body: "We will have a live Zoom role-play session this Thursday at 14:00. Please join with camera on if possible. We will be practising the LEAPS model in pairs. The link will be sent 30 minutes before the session.", publishedAt: ago(1), createdAt: ago(1) },
    { id: "ann_plat_01", courseId: null, authorId: "user_superadmin", title: "Platform Update: Interactive Video Now Available", body: "We have launched interactive video (PlayPosit-style) for all modules. Coaches can now add timestamp-based questions to any video beat. Learners will be prompted to answer questions as the video plays. Check the Studio for details.", platformWide: true, publishedAt: ago(2), createdAt: ago(2) },
  ]).onConflictDoNothing();
  console.log("  ✓ Announcements seeded");

  // ─── Calendar Events ───────────────────────────────────────────────────────
  await db.insert(courseEventsTable).values([
    { id: uuid(), courseId: "course_biz", title: "Assignment 1 Due: Business Principles Reflection", type: "assignment" as const, startDate: inDays(7), allDay: true, linkedAssignmentId: "asgn_biz_01", color: "#ef4444" },
    { id: uuid(), courseId: "course_biz", title: "Live Session: Financial Planning Workshop", type: "class_session" as const, startDate: inDays(3), endDate: new Date(inDays(3).getTime() + 7200000), description: "Join via Zoom. Link shared in announcements.", color: "#3b82f6" },
    { id: uuid(), courseId: "course_biz", title: "Assignment 2 Due: Cash Flow Statement", type: "assignment" as const, startDate: inDays(14), allDay: true, linkedAssignmentId: "asgn_biz_02", color: "#ef4444" },
    { id: uuid(), courseId: "course_cx", title: "Live Session: LEAPS Role Play Practice", type: "class_session" as const, startDate: inDays(2), endDate: new Date(inDays(2).getTime() + 5400000), description: "Zoom session. Camera on required.", color: "#3b82f6" },
    { id: uuid(), courseId: "course_cx", title: "Assignment 1 Due: LEAPS Role Play Script", type: "assignment" as const, startDate: inDays(10), allDay: true, linkedAssignmentId: "asgn_cx_01", color: "#ef4444" },
    { id: uuid(), courseId: "course_finlit", title: "Assignment 1 Due: Personal Budget Analysis", type: "assignment" as const, startDate: inDays(5), allDay: true, linkedAssignmentId: "asgn_fin_01", color: "#ef4444" },
  ]).onConflictDoNothing();

  // ─── Course Pages ──────────────────────────────────────────────────────────
  await db.insert(coursePagesTable).values([
    { id: uuid(), courseId: "course_biz", authorId: "user_coach_tf1", title: "Course Overview", slug: "overview", body: `# Business Management Fundamentals\n\n## About This Course\n\nThis course equips you with the practical knowledge to start, manage, and grow a business in South Africa's unique economic context.\n\n## Learning Outcomes\n\nBy the end of this course you will be able to:\n\n- Describe the four core functions of a business\n- Create a basic cash flow statement\n- Develop a marketing plan for a small business\n- Apply leadership principles in a team context\n- Draft a one-page business plan\n\n## How to Succeed\n\n1. Complete all modules in sequence\n2. Engage in discussions — peer learning is critical\n3. Submit assignments on time — late submissions lose 10% per day\n4. Attend live sessions where possible\n\n## Your Facilitator\n\nAisha Patel has 8 years of experience as an SME development consultant and has helped over 200 entrepreneurs formalise their businesses.`, published: true, frontPage: true, position: 1 },
    { id: uuid(), courseId: "course_biz", authorId: "user_coach_tf1", title: "Assessment & Grading Policy", slug: "grading-policy", body: `# Assessment & Grading Policy\n\n## Grade Breakdown\n\n| Component | Weight |\n|---|---|\n| Module Assignments (3) | 60% |\n| Final Business Plan | 30% |\n| Discussion Participation | 10% |\n\n## Letter Grades\n\n| Grade | Range |\n|---|---|\n| A (Distinction) | 80–100% |\n| B (Merit) | 70–79% |\n| C (Pass) | 60–69% |\n| D (Development needed) | 50–59% |\n| F (Fail) | Below 50% |\n\n## Late Submission Policy\n\nAssignments submitted late will be penalised 10% of the total marks per day, up to a maximum of 50%. After 5 days, the maximum grade achievable is 50%.`, published: true, position: 2 },
    { id: uuid(), courseId: "course_cx", authorId: "user_coach_sb1", title: "Course Overview", slug: "overview", body: `# Customer Service Excellence in South Africa\n\n## Welcome\n\nThis course is designed for frontline staff who interact with customers daily. South Africa's diverse population and high-stress service environments require a unique approach to customer service.\n\n## What You Will Learn\n\n- How to adopt a genuine customer-centric mindset\n- Apply the LEAPS model in real-time difficult situations\n- Communicate effectively across language and cultural differences\n- Turn service failures into loyalty-building moments\n\n## Course Structure\n\nThis course has 3 modules, each with 4–5 animated learning beats followed by a Socratic dialogue session. You will also complete two written assignments and participate in a live role-play session.\n\n## PraxisMark Credential\n\nLearners who complete all modules with a mastery score above 80% will receive the **SkillMark Customer Service Excellence** credential, which includes a publicly verifiable evidence trail.`, published: true, frontPage: true, position: 1 },
  ]).onConflictDoNothing();

  // ─── Course Groups ────────────────────────────────────────────────────────
  const groupIds = [uuid(), uuid(), uuid()];
  await db.insert(courseGroupsTable).values([
    { id: groupIds[0], courseId: "course_biz", name: "Group A — Entrepreneurs", description: "Learners with existing or planned businesses" },
    { id: groupIds[1], courseId: "course_biz", name: "Group B — Employees", description: "Learners in formal employment looking to upskill" },
    { id: groupIds[2], courseId: "course_cx", name: "Shoprite Front-of-House Team", description: "Cashiers and customer-facing staff" },
  ]).onConflictDoNothing();

  await db.insert(courseGroupMembersTable).values([
    { id: uuid(), groupId: groupIds[0], userId: "user_l01", role: "leader" as const },
    { id: uuid(), groupId: groupIds[0], userId: "user_l02", role: "member" as const },
    { id: uuid(), groupId: groupIds[1], userId: "user_l03", role: "leader" as const },
    { id: uuid(), groupId: groupIds[1], userId: "user_l04", role: "member" as const },
    { id: uuid(), groupId: groupIds[2], userId: "user_l09", role: "leader" as const },
    { id: uuid(), groupId: groupIds[2], userId: "user_l10", role: "member" as const },
  ]).onConflictDoNothing();
  console.log("  ✓ Groups seeded");

  // ─── Sample Credentials ───────────────────────────────────────────────────
  const decayDate = new Date(); decayDate.setFullYear(decayDate.getFullYear() + 1);
  await db.insert(credentialsTable).values([
    { id: uuid(), userId: "user_l03", moduleId: "mod_biz_05", moduleTitle: "Leadership & Team Building", partnerId: "partner_talentforge", partnerName: "TalentForge SA", masteryScore: "0.88", evidenceSummary: "Achieved mastery through 12 Socratic exchanges demonstrating strong leadership reasoning", decayDate, status: "valid" },
    { id: uuid(), userId: "user_l11", moduleId: "mod_cx_02", moduleTitle: "Communication Skills for Service", partnerId: "partner_skillbridge", partnerName: "SkillBridge Africa", masteryScore: "0.91", evidenceSummary: "Achieved mastery through 9 Socratic exchanges and demonstrated LEAPS model application", decayDate, status: "valid" },
  ]).onConflictDoNothing();

  // ─── Notifications ────────────────────────────────────────────────────────
  await db.insert(notificationsTable).values([
    { id: uuid(), userId: "user_l01", type: "announcement" as const, title: "New Announcement in Business Management", body: "Assignment 1 now open — due in 7 days", link: "/courses/course_biz", courseId: "course_biz", read: false, createdAt: ago(3) },
    { id: uuid(), userId: "user_l01", type: "assignment_due" as const, title: "Assignment Due Soon", body: "Business Principles Reflection is due in 7 days", link: "/courses/course_biz/assignments/asgn_biz_01", courseId: "course_biz", read: false, createdAt: ago(1) },
    { id: uuid(), userId: "user_l01", type: "discussion_reply" as const, title: "Aisha Patel replied to your discussion post", body: "In: Introduce yourself and your business idea", link: "/courses/course_biz/discussions/disc_biz_01", courseId: "course_biz", read: true, createdAt: ago(8) },
    { id: uuid(), userId: "user_l09", type: "credential_issued" as const, title: "You've earned a new credential!", body: "SkillMark: Communication Skills for Service", link: "/credentials", read: false, createdAt: ago(2) },
  ]).onConflictDoNothing();

  console.log("  ✓ Notifications seeded");
  console.log("\n✅ Seed complete! Demo data is ready.");
  console.log("\n📋 Demo users (sign in via Clerk with these emails):");
  console.log("   super@praxis.dev — Platform Super Admin");
  console.log("   james.mokoena@talentforge.co.za — Partner Admin (TalentForge)");
  console.log("   aisha.patel@talentforge.co.za — Coach (MTN/TalentForge)");
  console.log("   bongani.mthembu@mtn.com — Learner");
  console.log("\n   Use /api/dev/set-role in development to switch roles.");

  process.exit(0);
}

seed().catch((err) => { console.error("Seed failed:", err); process.exit(1); });
