// Instructional design method library for the Kanon curriculum engine.
//
// This is the single source of truth for the browsable method library AND the
// "Add activity / Add assessment" picker. Each method carries its phases plus a
// set of ready-to-use activity and assessment templates. Template "type" values
// must match the API enums:
//   activityType:   discussion | assignment | interactive | learnersourcing | peer_review | simulation | lab
//   assessmentType: formative | summative | quiz | assignment | project | exam | discussion

import type { ProjectUpdateDesignMethod } from "@workspace/kanon-api-client";

// A method key is one of the API's design-method enum values (never null). Typing
// the library against the generated enum makes any drift between this library and
// the OpenAPI contract a compile-time error instead of a runtime 400.
export type MethodKey = NonNullable<ProjectUpdateDesignMethod>;

export type ActivityType =
  | "discussion"
  | "assignment"
  | "interactive"
  | "learnersourcing"
  | "peer_review"
  | "simulation"
  | "lab";

export type AssessmentType =
  | "formative"
  | "summative"
  | "quiz"
  | "assignment"
  | "project"
  | "exam"
  | "discussion";

export interface ActivityTemplate {
  title: string;
  activityType: ActivityType;
  description: string;
}

export interface AssessmentTemplate {
  title: string;
  assessmentType: AssessmentType;
  description: string;
}

export interface MethodPhase {
  name: string;
  blurb: string;
}

export interface InstructionalMethod {
  key: MethodKey;
  name: string;
  origin: string;
  tagline: string;
  summary: string;
  bestFor: string;
  phases: MethodPhase[];
  activityTemplates: ActivityTemplate[];
  assessmentTemplates: AssessmentTemplate[];
}

export const INSTRUCTIONAL_METHODS: InstructionalMethod[] = [
  {
    key: "addie",
    name: "ADDIE",
    origin: "Instructional Systems Design",
    tagline: "The classic five-phase process model.",
    summary:
      "A linear, end-to-end process for building instruction. Each phase feeds the next and produces a concrete deliverable, which makes ADDIE a dependable default for full course builds.",
    bestFor: "Full course builds where requirements are reasonably stable.",
    phases: [
      { name: "Analyze", blurb: "Define learners, context, constraints, and the gap instruction must close." },
      { name: "Design", blurb: "Set objectives, sequence, and the assessment strategy before building." },
      { name: "Develop", blurb: "Produce the materials, media, and assessments." },
      { name: "Implement", blurb: "Deliver to learners and prepare facilitators." },
      { name: "Evaluate", blurb: "Measure against objectives and feed results back into the design." },
    ],
    activityTemplates: [
      {
        title: "Needs-analysis worksheet",
        activityType: "assignment",
        description: "Learners or stakeholders document the current gap, audience, and constraints that the module must address.",
      },
      {
        title: "Guided practice walkthrough",
        activityType: "interactive",
        description: "A scaffolded, step-by-step task that lets learners apply the new skill with immediate feedback.",
      },
    ],
    assessmentTemplates: [
      {
        title: "End-of-module mastery check",
        assessmentType: "summative",
        description: "A summative assessment aligned to every module objective to confirm the design achieved its goal.",
      },
      {
        title: "Pre-instruction baseline",
        assessmentType: "formative",
        description: "A short formative diagnostic from the Analyze phase that establishes a starting point to evaluate against.",
      },
    ],
  },
  {
    key: "sam",
    name: "SAM (Successive Approximation Model)",
    origin: "Michael Allen",
    tagline: "Iterative, prototype-first design.",
    summary:
      "An agile alternative to ADDIE. Short cycles of design, prototype, and review converge on a working solution, which suits projects where requirements emerge through building.",
    bestFor: "Prototype-first engagements and uncertain or evolving requirements.",
    phases: [
      { name: "Preparation", blurb: "Gather background and run a kickoff Savvy Start with stakeholders." },
      { name: "Iterative Design", blurb: "Sketch, prototype, and review in short repeated cycles." },
      { name: "Iterative Development", blurb: "Build, test with learners, and refine in alpha, beta, and gold." },
    ],
    activityTemplates: [
      {
        title: "Rapid prototype review",
        activityType: "peer_review",
        description: "Learners or faculty react to a low-fidelity prototype so the design can be corrected early and cheaply.",
      },
      {
        title: "Try-it sandbox",
        activityType: "interactive",
        description: "An interactive draft of the experience used to test assumptions before full development.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Prototype usability check",
        assessmentType: "formative",
        description: "A formative, low-stakes check that captures whether the prototype helps learners reach the objective.",
      },
    ],
  },
  {
    key: "backward-design",
    name: "Backward Design (Understanding by Design)",
    origin: "Wiggins and McTighe",
    tagline: "Start from the desired results.",
    summary:
      "Plan from outcomes back to instruction. Identify the results, then the evidence that proves them, and only then the learning experiences. This keeps every activity and assessment aligned to outcomes.",
    bestFor: "Outcome alignment and accreditation-driven curricula.",
    phases: [
      { name: "Identify desired results", blurb: "State the enduring understandings and measurable outcomes." },
      { name: "Determine acceptable evidence", blurb: "Decide what performance proves the outcomes were met." },
      { name: "Plan learning experiences", blurb: "Design activities that build toward that evidence." },
    ],
    activityTemplates: [
      {
        title: "Performance task rehearsal",
        activityType: "assignment",
        description: "Learners practice the authentic performance that the summative assessment will later require.",
      },
      {
        title: "Essential-question discussion",
        activityType: "discussion",
        description: "A discussion organized around the unit's essential questions to surface and build enduring understanding.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Authentic performance task",
        assessmentType: "project",
        description: "A culminating task where learners transfer their understanding to a realistic scenario, scored with a rubric.",
      },
      {
        title: "Understanding evidence quiz",
        assessmentType: "quiz",
        description: "A checkpoint that gathers acceptable evidence of the targeted understanding before the final task.",
      },
    ],
  },
  {
    key: "blooms",
    name: "Bloom's Taxonomy",
    origin: "Bloom, revised by Anderson and Krathwohl",
    tagline: "Sequence cognitive demand.",
    summary:
      "A ladder of cognitive processes from remembering to creating. Use it to write measurable objectives and to deliberately raise the cognitive demand of activities and assessments.",
    bestFor: "Writing measurable objectives and balancing cognitive demand.",
    phases: [
      { name: "Remember", blurb: "Recall facts and basic concepts." },
      { name: "Understand", blurb: "Explain ideas and concepts." },
      { name: "Apply", blurb: "Use information in new situations." },
      { name: "Analyze", blurb: "Draw connections and distinguish parts." },
      { name: "Evaluate", blurb: "Justify a stance or decision." },
      { name: "Create", blurb: "Produce new or original work." },
    ],
    activityTemplates: [
      {
        title: "Apply-level problem set",
        activityType: "assignment",
        description: "Practice problems that move learners from recall to applying a concept in an unfamiliar context.",
      },
      {
        title: "Analyze-and-critique discussion",
        activityType: "discussion",
        description: "Learners break down a case or artifact and defend an evaluation, targeting the higher tiers of the taxonomy.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Tiered exam",
        assessmentType: "exam",
        description: "An exam with items deliberately spread across remember, apply, and evaluate levels.",
      },
      {
        title: "Create-level capstone",
        assessmentType: "project",
        description: "A project that requires learners to produce original work, the highest level of the taxonomy.",
      },
    ],
  },
  {
    key: "gagne",
    name: "Gagne's Nine Events of Instruction",
    origin: "Robert Gagne",
    tagline: "A reliable structure for a single lesson.",
    summary:
      "Nine events that mirror the mental conditions for learning. They give a single lesson or module a dependable arc from gaining attention through to retention and transfer.",
    bestFor: "Structuring an individual lesson or module.",
    phases: [
      { name: "Gain attention", blurb: "Open with a hook that orients learners." },
      { name: "Inform objectives", blurb: "Tell learners what they will be able to do." },
      { name: "Recall prior learning", blurb: "Connect to what learners already know." },
      { name: "Present content", blurb: "Deliver the new material clearly." },
      { name: "Provide guidance", blurb: "Offer worked examples and cues." },
      { name: "Elicit performance", blurb: "Have learners practice the skill." },
      { name: "Provide feedback", blurb: "Give timely, specific feedback." },
      { name: "Assess performance", blurb: "Check whether the objective is met." },
      { name: "Enhance retention", blurb: "Support transfer to new contexts." },
    ],
    activityTemplates: [
      {
        title: "Hook and prior-knowledge warmup",
        activityType: "discussion",
        description: "A short opener that gains attention and surfaces relevant prior knowledge before new content.",
      },
      {
        title: "Guided practice with feedback",
        activityType: "interactive",
        description: "Learners elicit performance on the new skill and receive immediate, specific feedback.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Performance check",
        assessmentType: "formative",
        description: "A short assess-performance event confirming the lesson objective before moving on.",
      },
    ],
  },
  {
    key: "merrill",
    name: "Merrill's First Principles of Instruction",
    origin: "M. David Merrill",
    tagline: "Problem-centered, with a four-phase cycle.",
    summary:
      "Learning is promoted when learners solve real problems through a cycle of activation, demonstration, application, and integration. A strong fit for skills that must transfer to practice.",
    bestFor: "Problem-centered, transfer-focused skill building.",
    phases: [
      { name: "Problem", blurb: "Anchor learning in a real-world task." },
      { name: "Activation", blurb: "Activate relevant prior experience." },
      { name: "Demonstration", blurb: "Show, do not just tell, the new skill." },
      { name: "Application", blurb: "Have learners apply the skill with coaching." },
      { name: "Integration", blurb: "Support transfer into the learner's own work." },
    ],
    activityTemplates: [
      {
        title: "Worked-example demonstration",
        activityType: "interactive",
        description: "A demonstration that shows the skill in action before learners attempt it themselves.",
      },
      {
        title: "Real-world application task",
        activityType: "assignment",
        description: "Learners apply the new skill to an authentic problem drawn from their own context.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Problem-solution portfolio",
        assessmentType: "project",
        description: "Learners integrate the skill by solving a real problem and reflecting on transfer to their work.",
      },
    ],
  },
  {
    key: "four-c-id",
    name: "4C/ID (Four-Component Instructional Design)",
    origin: "van Merrienboer",
    tagline: "Built for complex, whole-task learning.",
    summary:
      "Designs complex skills around authentic whole tasks supported by four components. It manages cognitive load while keeping learning grounded in realistic, integrated performance.",
    bestFor: "Complex professional skills and whole-task competence.",
    phases: [
      { name: "Learning tasks", blurb: "Sequence authentic whole tasks from simple to complex." },
      { name: "Supportive information", blurb: "Provide the theory and mental models behind the tasks." },
      { name: "Procedural information", blurb: "Give just-in-time, step-by-step guidance." },
      { name: "Part-task practice", blurb: "Drill the routine sub-skills to automaticity." },
    ],
    activityTemplates: [
      {
        title: "Whole-task simulation",
        activityType: "simulation",
        description: "An authentic, integrated task that requires learners to coordinate several sub-skills at once.",
      },
      {
        title: "Part-task skill drill",
        activityType: "interactive",
        description: "Focused, repeated practice of a routine sub-skill so it becomes automatic during whole tasks.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Whole-task performance assessment",
        assessmentType: "project",
        description: "Learners perform a realistic whole task scored against the integrated competency.",
      },
    ],
  },
  {
    key: "kirkpatrick",
    name: "Kirkpatrick's Four Levels",
    origin: "Donald Kirkpatrick",
    tagline: "An evaluation framework for impact.",
    summary:
      "A model for evaluating instruction across four levels, from immediate reaction to business results. Use it to plan how a course will prove its value, not just deliver content.",
    bestFor: "Planning evaluation and demonstrating impact.",
    phases: [
      { name: "Reaction", blurb: "How learners respond to the experience." },
      { name: "Learning", blurb: "What knowledge or skill they gained." },
      { name: "Behavior", blurb: "How their performance changes in practice." },
      { name: "Results", blurb: "The outcomes that change for the organization." },
    ],
    activityTemplates: [
      {
        title: "On-the-job application log",
        activityType: "assignment",
        description: "Learners record how they applied the skill in practice, evidence for the behavior level.",
      },
    ],
    assessmentTemplates: [
      {
        title: "Reaction survey",
        assessmentType: "formative",
        description: "A short post-module survey capturing learner reaction, the first level of evaluation.",
      },
      {
        title: "Transfer and results review",
        assessmentType: "summative",
        description: "A later assessment that gathers evidence of changed behavior and downstream results.",
      },
    ],
  },
];

export function getMethod(key: string): InstructionalMethod | undefined {
  return INSTRUCTIONAL_METHODS.find((m) => m.key === key);
}

export const ACTIVITY_TYPE_OPTIONS: { value: ActivityType; label: string }[] = [
  { value: "discussion", label: "Discussion" },
  { value: "assignment", label: "Assignment" },
  { value: "interactive", label: "Interactive" },
  { value: "learnersourcing", label: "Learnersourcing" },
  { value: "peer_review", label: "Peer review" },
  { value: "simulation", label: "Simulation" },
  { value: "lab", label: "Lab" },
];

export const ASSESSMENT_TYPE_OPTIONS: { value: AssessmentType; label: string }[] = [
  { value: "formative", label: "Formative" },
  { value: "summative", label: "Summative" },
  { value: "quiz", label: "Quiz" },
  { value: "assignment", label: "Assignment" },
  { value: "project", label: "Project" },
  { value: "exam", label: "Exam" },
  { value: "discussion", label: "Discussion" },
];
