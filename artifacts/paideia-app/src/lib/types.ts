export interface Teacher {
  id: string;
  email: string;
  name: string;
  region: string;
  country: string | null;
  schoolName: string | null;
  subjects: string[];
  yearGroups: string[];
  isAdmin: boolean;
  status: "pending" | "active" | "suspended";
  onboardedAt: string | null;
  approvedAt: string | null;
  subscriptionStatus: "free" | "active" | "trialing" | "past_due" | "canceled";
  subscriptionCurrentPeriodEnd: string | null;
  createdAt: string;
}

export interface ImpersonationStatus {
  teacher: Teacher | null;
  impersonator: Teacher | null;
}

export interface Usage {
  subscribed: boolean;
  used: number;
  limit: number;
  remaining: number | null;
  subscriptionStatus: string;
  periodEnd: string | null;
  paidPlansEnabled: boolean;
  onWaitlist: boolean;
}

export interface ClassProfile {
  id: string;
  name: string;
  subject: string;
  yearGroup: string;
  syllabus: string | null;
  languageLevel: string | null;
  notes: string | null;
  createdAt: string;
}

export interface LibraryItem {
  id: string;
  kind: "plan" | "worksheet" | "quiz" | "parent-draft";
  title: string;
  subject: string;
  yearGroup: string;
  topic: string | null;
  createdAt: string;
}

export interface SharedItem {
  id: string;
  resourceType: "plan" | "worksheet" | "quiz" | "parent-draft";
  resourceId: string;
  copiedResourceId: string | null;
  message: string | null;
  sharedAt: string;
  viewedAt: string | null;
  fromName: string;
  fromEmail: string;
}

export interface WaitlistEntry {
  id: string;
  teacherId: string;
  teacherName: string;
  email: string;
  schoolName: string | null;
  country: string | null;
  region: string;
  note: string | null;
  createdAt: string;
  fulfilledAt: string | null;
}

export interface PendingTeacher {
  id: string;
  email: string;
  name: string;
  region: string;
  country: string | null;
  schoolName: string | null;
  subjects: string[];
  yearGroups: string[];
  status: string;
  createdAt: string;
}

export interface AdminStats {
  totals: {
    teachers: number;
    activeTeachersToday: number;
    activeTeachersThisWeek: number;
    classes: number;
    students: number;
    lessonPlans: number;
    worksheets: number;
    quizzes: number;
    parentDrafts: number;
    assignments: number;
    submissions: number;
    pilotRequests: number;
    events: number;
    aiCalls: number;
    aiTokens: number;
    aiCostUsd: number;
  };
  weeklyActivity: { weekStart: string; teachers: number; resources: number; submissions: number }[];
  dailyActivity: { day: string; activeTeachers: number; sessions: number }[];
  weeklyActiveTeachers: { weekStart: string; activeTeachers: number }[];
  signupFunnel: { signups: number; createdResource: number; returnedAfterWeek: number };
  recentSignups: { id: string; name: string; email: string; schoolName: string | null; country: string | null; region: string; createdAt: string }[];
}

export interface AdminEngagement {
  retentionCohorts: { weekStart: string; size: number; retention: number[] }[];
  teacherLeaderboard: {
    id: string;
    name: string;
    email: string;
    schoolName: string | null;
    country: string | null;
    region: string;
    createdAt: string;
    lessonPlans: number;
    worksheets: number;
    quizzes: number;
    parentDrafts: number;
    assignments: number;
    events: number;
    lastSeen: string | null;
  }[];
  featureUsage: { feature: string; total: number; uniqueTeachers: number }[];
}

export interface AdminProduct {
  topEvents: { label: string; surface: string | null; count: number; uniqueUsers: number }[];
  topPagesApp: { label: string; surface: string | null; count: number; uniqueUsers: number }[];
  topPagesSite: { label: string; surface: string | null; count: number; uniqueUsers: number }[];
  surfaceBreakdown: { label: string; surface: string | null; count: number; uniqueUsers: number }[];
}

export interface AdminAiUsage {
  totals: {
    calls: number;
    successful: number;
    failed: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
    avgLatencyMs: number;
  };
  byTeacher: { id: string | null; name: string; email: string | null; schoolName: string | null; calls: number; tokens: number; costUsd: number }[];
  daily: { day: string; calls: number; costUsd: number }[];
  byKind: { kind: string; calls: number; tokens: number; costUsd: number }[];
}

export type PilotStatus = "new" | "contacted" | "scheduled" | "in_pilot" | "won" | "lost";

export interface AdminPilot {
  id: string;
  source: string;
  schoolName: string | null;
  country: string | null;
  organization: string | null;
  contactName: string;
  contactEmail: string;
  gradeLevels: string | null;
  message: string | null;
  status: PilotStatus;
  notes: string | null;
  contactedAt: string | null;
  sourcePath: string | null;
  sourceReferrer: string | null;
  sourceUtm: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPilots {
  statusCounts: { status: string; count: number }[];
  pilots: AdminPilot[];
}

export interface DigestWindowStats {
  signups: number;
  pilots: number;
  lessonPlans: number;
  worksheets: number;
  quizzes: number;
  parentDrafts: number;
  assignments: number;
  submissions: number;
  activeTeachers: number;
  aiCalls: number;
  aiTokens: number;
  aiCostUsd: number;
  events: number;
}

export interface AdminDigest {
  windowStart: string;
  windowEnd: string;
  previousStart: string;
  current: DigestWindowStats;
  previous: DigestWindowStats;
  topEvents: { name: string; surface: string | null; count: number }[];
  newPilots: {
    id: string;
    contactName: string;
    contactEmail: string;
    organization: string | null;
    schoolName: string | null;
    country: string | null;
    status: string;
    createdAt: string;
  }[];
  topTeachers: { id: string; name: string; email: string; schoolName: string | null; events: number }[];
}

export interface RegionInfo {
  id: string;
  label: string;
  description: string;
  curriculumLabel: string;
  conventionsHint: string;
  subjects: string[];
  yearGroups: { value: string; label: string }[];
}

export interface LessonPlanContent {
  title: string;
  summary: string;
  learningObjectives: string[];
  successCriteria: string[];
  starter: { activity: string; durationMinutes: number };
  mainTask: { core: string; support: string; stretch: string; durationMinutes: number };
  miniPlenary: { activity: string; durationMinutes: number };
  exitTicket: { prompt: string; expectedResponse: string };
  resourcesNeeded: string[];
  commonMisconceptions: string[];
  homeworkSuggestion: string;
}

export interface WorksheetContent {
  title: string;
  instructions: string;
  questions: {
    number: number;
    prompt: string;
    type: "short" | "multiple_choice" | "long" | "calculation";
    options: string[] | null;
    answer: string;
    workingOrRubric: string;
  }[];
  teacherNotes: string;
}

export interface ParentDraftContent {
  subject: string;
  greeting: string;
  paragraphs: string[];
  closing: string;
  signature: string;
}

export interface QuizContent {
  title: string;
  format: string;
  instructions: string;
  items: {
    number: number;
    prompt: string;
    type: "multiple_choice" | "short_answer" | "true_false";
    options: string[] | null;
    correctAnswer: string;
    difficulty: "easy" | "medium" | "hard";
    skillAssessed: string;
  }[];
}

export interface LessonPlan {
  id: string;
  teacherId: string;
  title: string;
  region: string;
  subject: string;
  yearGroup: string;
  topic: string;
  priorKnowledge: string | null;
  durationMinutes: number;
  groupContext: string | null;
  content: LessonPlanContent;
  createdAt: string;
}

export interface Worksheet {
  id: string;
  teacherId: string;
  title: string;
  region: string;
  subject: string;
  yearGroup: string;
  topic: string;
  difficulty: string;
  questionCount: number;
  content: WorksheetContent;
  createdAt: string;
}

export interface ParentDraft {
  id: string;
  teacherId: string;
  studentName: string;
  region: string;
  yearGroup: string | null;
  tone: string;
  keyPoints: string;
  content: ParentDraftContent;
  createdAt: string;
}

export interface Quiz {
  id: string;
  teacherId: string;
  title: string;
  region: string;
  subject: string;
  yearGroup: string;
  topic: string;
  format: string;
  questionCount: number;
  content: QuizContent;
  createdAt: string;
}

export interface ClassRow {
  id: string;
  name: string;
  subject: string | null;
  yearGroup: string;
  region: string;
  studentCount?: number;
  createdAt: string;
}

export interface Student {
  id: string;
  classId: string;
  teacherId: string;
  firstName: string;
  lastInitial: string;
  email: string | null;
  joinCode: string;
  learningStyle: {
    schemaVersion: 1;
    processingStyle: "sequential" | "conceptual" | "mixed";
    pace: "quick" | "deliberate" | "moderate";
    strengthByQuestionType: { recall: number; comprehension: number; application: number };
    confidencePattern: "improving" | "fatiguing" | "consistent";
    inferenceConfidence: "low" | "developing" | "moderate" | "strong";
    sampleSize: number;
  } | null;
  diagnosticTakenAt: string | null;
  createdAt: string;
}

export interface Assignment {
  id: string;
  teacherId: string;
  classId: string;
  resourceKind: "worksheet" | "quiz";
  worksheetId: string | null;
  quizId: string | null;
  title: string;
  deliveryMode: "share_link" | "accounts";
  shareCode: string;
  closed: boolean;
  createdAt: string;
}

export type GradingStatus = "pending" | "grading" | "graded" | "failed";

export interface FeedbackItem {
  number: number;
  given: string;
  correct: string | null;
  state: "correct" | "incorrect" | "partial" | "needs_review";
  skill?: string;
  aiComment?: string;
  aiScore?: number;
  aiMax?: number;
}

export interface AiSubmissionSummary {
  overall: string;
  strengths: string[];
  gaps: string[];
  recommendations: string[];
}

export interface Submission {
  id: string;
  assignmentId: string;
  studentId: string | null;
  displayName: string;
  answers: Record<string, string>;
  autoScore: number;
  maxAutoScore: number;
  needsReviewCount: number;
  feedback: FeedbackItem[] | null;
  gradingStatus: GradingStatus;
  gradedAt: string | null;
  aiSummary: AiSubmissionSummary | null;
  submittedAt: string;
}

export interface Sample {
  id: string;
  kind: "lesson_plan" | "worksheet" | "quiz" | "parent_draft";
  region: string;
  subject: string;
  yearGroup: string;
  title: string;
  description: string;
  content: unknown;
  createdAt: string;
}

export interface TutorConversation {
  id: string;
  studentId: string;
  classId: string;
  title: string;
  socraticMode: boolean;
  scope: "all_material" | "specific_assignment";
  scopeRefId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TutorMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  citations: Array<{ type: "concept" | "source"; title: string; url?: string }> | null;
  usedPersonalization: boolean | null;
  createdAt: string;
}
