/*
 * Practice Hub — phenomenon → lens library (leadership).
 *
 * The organising principle (per Cris's design note): candidates do NOT need to know theory in advance.
 * They describe an experience; the system recognises the PHENOMENA in it (in practitioner language) and
 * offers SEVERAL middle-range and contextual lenses. Mutale never decides which theory applies — the
 * candidate does the intellectual work of choosing and then critically tests the fit.
 *
 * This is the DRAFTED map, authored from leadership-practice research for the academic team to correct
 * and extend. It is deliberately weighted away from the large generic management frameworks (see
 * EXCLUDED_FRAMEWORKS) and towards middle-range theory that explains WHY behaviour occurs, plus
 * contextual/African concepts of leadership and organising. Each lens carries a bite-size explainer
 * (text/audio-first; video is optional and never required) and an "edge" — what it does NOT explain —
 * which powers the critical-testing step.
 *
 * Retrieval, not recall: Mutale only ever offers lenses that exist here. It never surfaces theory from
 * its own training (which over-represents the famous frameworks), so the programme controls the corpus.
 */

export type Lens = {
  id: string;
  name: string;
  tradition: "middle-range" | "contextual";
  gist: string; // 2-3 sentence bite-size explainer
  edge: string; // what this lens does NOT explain — used to interrogate fit
  origin: string; // named plainly; real, established scholarship
};

export type Phenomenon = {
  id: string;
  label: string; // practitioner language — how a leader would actually describe it
  cue: string; // signals that this phenomenon may be present (for the matcher)
  lenses: Lens[];
};

/**
 * Blocked outright. These are the generic management frameworks that describe or prescribe process
 * rather than explain behaviour; a language model reaches for them first, which is exactly what we are
 * moving away from. The matcher is instructed never to name anything on this list, even in passing.
 */
export const EXCLUDED_FRAMEWORKS: string[] = [
  "Tuckman", "forming storming norming performing",
  "Kotter", "8 steps", "eight steps",
  "Lewin", "unfreeze", "refreeze",
  "Maslow", "hierarchy of needs",
  "Herzberg", "two factor", "hygiene factors",
  "Belbin", "team roles",
  "Blake and Mouton", "managerial grid",
  "Hersey", "Blanchard", "situational leadership",
  "GROW model",
  "SWOT",
];

export const PHENOMENA: Phenomenon[] = [
  {
    id: "resistance-to-change",
    label: "People are resisting a change I'm leading",
    cue: "the leader is introducing a change and meeting pushback, foot-dragging, or quiet non-compliance",
    lenses: [
      { id: "psychological-reactance", name: "Psychological reactance", tradition: "middle-range",
        gist: "When people feel their freedom to choose is being removed, they push back to restore it — the resistance is often about the loss of control, not the change itself.",
        edge: "It explains resistance driven by threatened autonomy, but not resistance that is a reasoned objection to a genuinely bad plan.",
        origin: "Reactance theory, Jack Brehm." },
      { id: "procedural-justice", name: "Procedural justice", tradition: "middle-range",
        gist: "People accept outcomes they dislike if they judge the process that produced them as fair — voice, consistency, and explanation matter more than the decision.",
        edge: "It explains resistance rooted in how the decision was made, less so resistance rooted in the substance of the change or in material self-interest.",
        origin: "Organizational justice, Thibaut & Walker; Tyler." },
      { id: "identity-threat", name: "Identity threat", tradition: "middle-range",
        gist: "A change can feel like an attack on who someone is and what they are good at; people defend a valued identity, not just a way of working.",
        edge: "Powerful where professional or personal identity is at stake; weaker where the change is emotionally neutral.",
        origin: "Social identity and identity work; Petriglieri on identity threat." },
      { id: "sense-making", name: "Sense-making", tradition: "middle-range",
        gist: "People act on the story they can tell themselves about what is happening; resistance can mean the change does not yet make sense in their frame, so they cannot enact it.",
        edge: "Explains confusion and stalled action; less useful when people understand the change perfectly well and simply oppose it.",
        origin: "Sensemaking in organizations, Karl Weick." },
    ],
  },
  {
    id: "no-open-disagreement",
    label: "My team won't disagree with me openly",
    cue: "silence in meetings, no challenge, people agree in the room and object afterwards",
    lenses: [
      { id: "psychological-safety", name: "Psychological safety", tradition: "middle-range",
        gist: "People stay silent when they believe speaking up is risky to their standing; teams learn whether candour is safe from how leaders react to the first person who tries it.",
        edge: "Explains silence driven by interpersonal risk; not silence that comes from disengagement or from simply having nothing to add.",
        origin: "Psychological safety, Amy Edmondson." },
      { id: "voice-and-silence", name: "Voice, exit and loyalty", tradition: "middle-range",
        gist: "When people are unhappy they can voice it, quietly withdraw (exit), or stay loyal and say nothing; which they choose depends on whether they believe voice will change anything.",
        edge: "Frames the choice to speak or not; says less about the emotional cost of speaking in a specific relationship.",
        origin: "Exit, Voice and Loyalty, Albert Hirschman." },
      { id: "seriti-dignity", name: "Seriti (dignity and standing)", tradition: "contextual",
        gist: "In many African relational settings, open disagreement can threaten a person's seriti — their dignity and standing — and that of the leader, so challenge is offered indirectly to protect the relationship.",
        edge: "Illuminates why directness feels costly and how respect shapes candour; needs care not to be applied as a blanket cultural explanation.",
        origin: "Seriti / dignity in Southern African thought; relational conceptions of personhood." },
      { id: "power-distance", name: "Power distance", tradition: "middle-range",
        gist: "Where there is a strong expectation that authority is not questioned, silence is deference, not agreement; the more senior the leader, the stronger the pull.",
        edge: "A useful lens on hierarchy, but treats a tendency as if it were fixed; individuals and teams vary widely within any setting.",
        origin: "Cross-cultural work on power distance; later critiques of over-generalisation." },
    ],
  },
  {
    id: "unclear-roles",
    label: "Nobody's clear on who does what",
    cue: "duplicated work, dropped balls, arguments about whose job something was",
    lenses: [
      { id: "role-theory", name: "Role ambiguity and role conflict", tradition: "middle-range",
        gist: "Strain comes from two distinct things: not knowing what your role is (ambiguity), and being pulled by incompatible expectations of it (conflict); they need different fixes.",
        edge: "Names the problem precisely, but does not by itself explain the coordination or trust breakdowns that let roles blur in the first place.",
        origin: "Role theory; Kahn et al. on role stress." },
      { id: "relational-coordination", name: "Relational coordination", tradition: "middle-range",
        gist: "Work coordinates well when people share goals, share knowledge, and hold mutual respect; where those are thin, tasks fall between people no matter how clear the org chart is.",
        edge: "Explains coordination as relationship, less so formal accountability or authority to decide.",
        origin: "Relational coordination, Jody Hoffer Gittell." },
      { id: "psychological-ownership", name: "Psychological ownership", tradition: "middle-range",
        gist: "People take responsibility for what they feel is theirs; unclear roles often mean no one feels ownership of the gap, so it stays unowned.",
        edge: "Explains who steps up, less so how to allocate work fairly or resolve overlapping claims.",
        origin: "Psychological ownership, Pierce, Kostova & Dirks." },
    ],
  },
  {
    id: "team-conflict",
    label: "The team keeps arguing and it's getting personal",
    cue: "recurring disagreement, factions, heat that outlasts the issue",
    lenses: [
      { id: "task-vs-relationship-conflict", name: "Task vs relationship conflict", tradition: "middle-range",
        gist: "Disagreement about the work can sharpen thinking; disagreement that has become about the people corrodes it. The skill is keeping conflict on the task before it turns personal.",
        edge: "Distinguishes types of conflict; less clear on what tips one into the other, or on power imbalances behind the conflict.",
        origin: "Intragroup conflict, Karen Jehn." },
      { id: "procedural-justice-conflict", name: "Procedural justice", tradition: "middle-range",
        gist: "Much recurring conflict is really about a process people experienced as unfair; fix the felt fairness of how things are decided and the heat often drops.",
        edge: "Strong where grievance is about process; weaker where the conflict is a genuine clash of values or interests.",
        origin: "Organizational justice, Tyler & Lind." },
      { id: "ubuntu-repair", name: "Ubuntu and relational repair", tradition: "contextual",
        gist: "In an ubuntu frame a person is a person through others, so conflict is a tear in the web of relationships that must be repaired, not just a problem to be settled; restoring the relationship can matter more than winning the point.",
        edge: "Offers a repair-oriented path many frameworks miss; can be romanticised, and does not remove the need to address real interests.",
        origin: "Ubuntu philosophy; restorative and relational leadership traditions." },
    ],
  },
  {
    id: "no-ownership",
    label: "People wait to be told and won't take ownership",
    cue: "passivity, everything escalates to the leader, low initiative",
    lenses: [
      { id: "self-determination", name: "Self-determination (autonomy, competence, relatedness)", tradition: "middle-range",
        gist: "People self-start when three needs are met: some control over how they work, a sense they can succeed, and connection to others. Take any away and motivation drops to compliance.",
        edge: "Explains the conditions for initiative; says less about structural blockers like unclear authority or fear of blame.",
        origin: "Self-determination theory, Deci & Ryan." },
      { id: "learned-helplessness", name: "Learned helplessness", tradition: "middle-range",
        gist: "When effort has repeatedly made no difference, people stop trying — the passivity is a learned response to an environment that punished or ignored initiative.",
        edge: "Explains withdrawal after repeated futility; not passivity that is really about capacity, clarity, or incentives.",
        origin: "Learned helplessness, Seligman." },
      { id: "letsema-collective", name: "Letsema (collective work and responsibility)", tradition: "contextual",
        gist: "In traditions of collective effort like letsema, responsibility is shared and mobilised through common purpose and mutual obligation, not individual job descriptions; ownership grows from belonging to the effort.",
        edge: "Illuminates how shared purpose drives contribution; needs pairing with clarity so 'everyone's job' does not become no one's.",
        origin: "Letsema / collective-work traditions in Southern Africa." },
    ],
  },
  {
    id: "influence-without-authority",
    label: "I need to move people I have no authority over",
    cue: "matrixed work, peers, other departments, stakeholders who don't report to the leader",
    lenses: [
      { id: "social-capital", name: "Social capital", tradition: "middle-range",
        gist: "Influence without authority runs on relationships built before you need them — trust, reciprocity and being connected across the network are the currency you spend.",
        edge: "Explains the capacity to influence; less so the specific ask or the ethics of trading favours.",
        origin: "Social capital, Nahapiet & Ghoshal; Burt on brokerage." },
      { id: "legitimacy", name: "Legitimacy", tradition: "middle-range",
        gist: "People follow those they see as legitimate — as having the right to ask — and legitimacy is granted by others, not claimed. Fair, consistent, explained conduct earns it.",
        edge: "Explains willing followership; not situations resolved purely by resources or coercion.",
        origin: "Legitimacy; Tyler on why people defer to authority." },
      { id: "relational-leadership", name: "Relational leadership", tradition: "contextual",
        gist: "Leadership is not a property of a role but something produced between people in relationship; where you lack position, you lead through the quality and reciprocity of your relationships.",
        edge: "Reframes leadership as relational rather than positional; can understate the real effects of formal power.",
        origin: "Relational leadership theory; African relational conceptions of authority." },
    ],
  },
  {
    id: "yes-then-no-followthrough",
    label: "People agree in the moment then don't follow through",
    cue: "commitments made and quietly dropped, polite agreement without action",
    lenses: [
      { id: "commitment-vs-compliance", name: "Commitment vs compliance", tradition: "middle-range",
        gist: "Saying yes to avoid friction is compliance; it evaporates once the pressure is off. Real follow-through needs internalised commitment, which comes from involvement and ownership, not agreement in a meeting.",
        edge: "Explains hollow agreement; not follow-through that fails for lack of time, capability, or competing priorities.",
        origin: "Commitment and internalisation, Kelman; Herscovitch & Meyer." },
      { id: "psychological-contract", name: "Psychological contract", tradition: "middle-range",
        gist: "People act on the unwritten deal they believe they have with you; when that felt bargain is unclear or has been broken before, spoken agreements carry little weight.",
        edge: "Explains withdrawal after a felt breach; less useful where no prior expectation was set.",
        origin: "Psychological contract, Denise Rousseau." },
      { id: "face-saving", name: "Face and saving face", tradition: "contextual",
        gist: "Agreeing in the room can be a way to protect everyone's face; the real position surfaces only later and elsewhere, so the meeting 'yes' was never the decision.",
        edge: "Explains public agreement that does not bind; needs care not to be read as mere insincerity.",
        origin: "Face-work, Goffman; face and harmony in relational cultures." },
    ],
  },
  {
    id: "capable-but-disengaged",
    label: "A capable person has gone quiet or is underperforming",
    cue: "a good performer withdrawing, doing the minimum, or slipping",
    lenses: [
      { id: "self-efficacy", name: "Self-efficacy", tradition: "middle-range",
        gist: "Belief that you can succeed at a specific task drives effort and persistence; a capable person may have lost that belief for this task, even while able, and so has stopped trying.",
        edge: "Explains effort tied to confidence; not disengagement driven by values, fairness, or life outside work.",
        origin: "Self-efficacy, Albert Bandura." },
      { id: "effort-reward-imbalance", name: "Effort–reward imbalance / burnout", tradition: "middle-range",
        gist: "Sustained high effort met with low reward — recognition, security, or advancement — leads people to disengage to protect themselves; the withdrawal is self-preservation, not laziness.",
        edge: "Explains exhaustion and pulling back; less so a sudden change tied to one event or relationship.",
        origin: "Effort–reward imbalance, Siegrist; burnout, Maslach." },
      { id: "psychological-contract-breach", name: "Psychological contract breach", tradition: "middle-range",
        gist: "A quiet, capable withdrawal often follows a moment where the person felt a promise was broken; they are now giving what they feel they are owed, no more.",
        edge: "Strong where a specific breach can be traced; weaker where disengagement is gradual and diffuse.",
        origin: "Psychological contract breach, Robinson & Rousseau." },
    ],
  },
  {
    id: "impostor-belonging",
    label: "I'm not sure I belong in this role",
    cue: "a leader doubting their legitimacy, especially after a promotion or transition",
    lenses: [
      { id: "identity-work", name: "Identity work in role transition", tradition: "middle-range",
        gist: "Stepping up is not just learning tasks; it is becoming a different professional self, and the discomfort is the ordinary work of trying on a new identity that does not fit yet.",
        edge: "Normalises transition discomfort; does not address genuine skill gaps that need closing.",
        origin: "Identity work and role transitions, Herminia Ibarra." },
      { id: "impostor-phenomenon", name: "Impostor phenomenon", tradition: "middle-range",
        gist: "Capable people can attribute their success to luck and fear being 'found out'; the feeling is common at transitions and is not evidence that you are actually unqualified.",
        edge: "Explains the internal experience; not external situations where the doubt reflects real, addressable gaps.",
        origin: "Impostor phenomenon, Clance & Imes." },
      { id: "legitimacy-granted", name: "Legitimacy is granted", tradition: "contextual",
        gist: "Authority to lead is conferred by those you lead, not by the title alone; belonging grows as you earn recognition through conduct, which takes time and is normal to lack at first.",
        edge: "Reframes belonging as earned over time; can understate structural barriers some leaders face in being granted it.",
        origin: "Legitimacy of authority; relational conceptions of leadership." },
    ],
  },
  {
    id: "no-shared-purpose",
    label: "The group feels fragmented, with no shared sense of purpose",
    cue: "silos, competing agendas, no felt 'we'",
    lenses: [
      { id: "collective-identity", name: "Collective identity", tradition: "middle-range",
        gist: "Groups act together when members see themselves as part of a shared 'we'; fragmentation is often a weak or contested collective identity, not a lack of goals.",
        edge: "Explains cohesion and its absence; less so the material conflicts of interest that can divide a group.",
        origin: "Social identity in organisations; collective identity." },
      { id: "sense-making-shared", name: "Shared sense-making", tradition: "middle-range",
        gist: "A group needs a shared story of what it is doing and why to coordinate; without common meaning, effort scatters even when everyone is willing.",
        edge: "Explains fragmented action from fragmented meaning; not division that is really about incentives.",
        origin: "Sensemaking, Weick; collective sensemaking." },
      { id: "ubuntu-belonging", name: "Ubuntu (I am because we are)", tradition: "contextual",
        gist: "An ubuntu view holds that identity and purpose are constituted through community; shared purpose is built by strengthening belonging and mutual obligation, not only by cascading a strategy.",
        edge: "Foregrounds belonging as the route to purpose; risks being invoked as a slogan without the practices that make it real.",
        origin: "Ubuntu philosophy; communitarian conceptions of leadership." },
    ],
  },
  {
    id: "firefighting",
    label: "I'm always firefighting and can't step back to lead",
    cue: "the leader is pulled into operational detail, cannot delegate, no time to think",
    lenses: [
      { id: "operational-strategic-identity", name: "Operational vs strategic identity", tradition: "middle-range",
        gist: "Leaders who rose by being excellent operators can cling to that identity because it is where they feel competent and valued; stepping back feels like losing the thing they are good at.",
        edge: "Explains the pull of the familiar role; not situations where there genuinely is no one else to delegate to.",
        origin: "Role transition; the specialist-to-leader shift, Ibarra; Watkins." },
      { id: "delegation-as-development", name: "Delegation as development", tradition: "middle-range",
        gist: "Delegation is not offloading tasks but deliberately growing others' capability and ownership; done as development it frees the leader, done as dumping it rebounds.",
        edge: "Explains how to build capacity over time; not the immediate crunch where firefighting is unavoidable.",
        origin: "Delegation and development; situational judgement in leadership development." },
      { id: "psychological-ownership-delegation", name: "Psychological ownership", tradition: "middle-range",
        gist: "People pick up work when they feel it is genuinely theirs; chronic firefighting often means ownership has quietly collected on the leader and never transferred.",
        edge: "Explains where responsibility settles; less so the systemic under-staffing that can cause overload.",
        origin: "Psychological ownership, Pierce et al." },
    ],
  },
];

export function phenomenonById(id: string): Phenomenon | undefined {
  return PHENOMENA.find((p) => p.id === id);
}

export function lensById(phenomenonId: string, lensId: string): Lens | undefined {
  return phenomenonById(phenomenonId)?.lenses.find((l) => l.id === lensId);
}

/** A compact catalogue (id + label + cue) the matcher chooses FROM. It never invents beyond this list. */
export function catalogueForMatcher(): string {
  return PHENOMENA.map((p) => `- ${p.id} :: "${p.label}" — present when ${p.cue}`).join("\n");
}
