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
  // ── Added Oct 2026 from MRB tutors' account of what candidates bring (framework v2.1 work) ──
  {
    id: "change-from-above",
    label: "I have to implement a change I did not choose",
    cue: "a change was handed down from above, often several at once, and the leader is in the middle carrying it out without control over it",
    lenses: [
      { id: "middle-manager-sensemaking", name: "Middle managers as sense-makers", tradition: "middle-range",
        gist: "Middle managers do more than pass change down: they interpret it for their teams and for themselves, and much of the difficulty is making sense of something whose reasons they were never given.",
        edge: "Explains confusion and uneven take-up in the middle; less useful where the change is simply unworkable whatever sense is made of it.",
        origin: "Middle-manager sensemaking during change, Balogun & Johnson; the strategic role of middle managers, Floyd & Wooldridge." },
      { id: "role-conflict", name: "Role conflict", tradition: "middle-range",
        gist: "When the people above and the people below expect incompatible things of you, the strain comes from the position, not from a personal failing.",
        edge: "Names the structural squeeze; does not by itself say which expectation to honour.",
        origin: "Role theory, Kahn and colleagues." },
      { id: "psychological-contract", name: "Psychological contract", tradition: "middle-range",
        gist: "People carry unwritten expectations about what they owe the organisation and what it owes them; repeated change imposed without explanation can feel like a broken promise, and the reaction follows from that.",
        edge: "Explains the sense of betrayal behind resistance; less so objections to the content of the change.",
        origin: "Psychological contract, Denise Rousseau." },
      { id: "procedural-justice-imposed", name: "Procedural justice", tradition: "middle-range",
        gist: "People accept outcomes they did not choose when the process feels fair: they had a voice, the reasons were explained, and the rules were applied consistently.",
        edge: "Points to what you can still control in how you implement; does not change a decision made above you.",
        origin: "Organisational justice, Thibaut & Walker; Tyler." },
    ],
  },
  {
    id: "decisions-never-come",
    label: "I keep chasing decisions that never come",
    cue: "the leader spends time following up for approvals or decisions that are delayed, deferred or never made",
    lenses: [
      { id: "non-decisions", name: "Non-decision as power", tradition: "middle-range",
        gist: "Not deciding can itself be an exercise of power: keeping an issue off the table protects some interests, so the delay may be doing a job for someone.",
        edge: "Reveals hidden interests behind delay; can over-read intent where the delay is simple overload.",
        origin: "The two faces of power, Bachrach & Baratz." },
      { id: "garbage-can", name: "Organised anarchy", tradition: "middle-range",
        gist: "In many organisations problems, solutions and decision-makers drift around separately and only come together by timing, so decisions happen when those streams meet, not when they are logically due.",
        edge: "Explains apparently random timing; offers less guidance on forcing a decision through.",
        origin: "The garbage can model of organisational choice, Cohen, March & Olsen." },
      { id: "diffusion-of-responsibility", name: "Diffusion of responsibility", tradition: "middle-range",
        gist: "When many people could decide, each assumes someone else will; a decision with no single clear owner tends not to be made.",
        edge: "Explains stalls where ownership is unclear; not where one owner is clearly avoiding the call.",
        origin: "Diffusion of responsibility, Darley & Latané." },
    ],
  },
  {
    id: "pressure-to-bend-rules",
    label: "I'm under pressure to bend due process",
    cue: "contracts, appointments or resources being pushed through without proper process, or pressure to sign off or look away",
    lenses: [
      { id: "ethical-fading", name: "Ethical fading", tradition: "middle-range",
        gist: "Under pressure, the ethical side of a decision can quietly drop out of view and it starts to feel like a purely practical or business choice, which is how decent people end up going along.",
        edge: "Explains how good people drift; less about deliberate wrongdoing by others.",
        origin: "Ethical fading and self-deception, Tenbrunsel & Messick." },
      { id: "normalisation-of-deviance", name: "Normalisation of deviance", tradition: "middle-range",
        gist: "When shortcuts are taken repeatedly without visible harm, they come to look normal, and the person who objects starts to look like the problem.",
        edge: "Explains how rule-bending becomes routine; less so a single, one-off pressure.",
        origin: "Normalisation of deviance, Diane Vaughan." },
      { id: "moral-distress", name: "Moral distress", tradition: "middle-range",
        gist: "Knowing the right thing to do but being constrained from doing it produces a distinct strain, which is different from not knowing what is right.",
        edge: "Names the cost to the person; does not resolve the dilemma itself.",
        origin: "Moral distress, Andrew Jameton (first described in nursing)." },
      { id: "ubuntu-obligation", name: "Ubuntu and competing obligations", tradition: "contextual",
        gist: "An ubuntu view sees obligations as arising from relationships, so pressure from kin, community or patrons can feel like a duty, not only corruption; leading well can mean honouring relationships while refusing to let them override fairness to everyone else served.",
        edge: "Helps explain why the pressure feels morally loaded; can be misused to excuse favouritism if fairness to the wider community is forgotten.",
        origin: "Ubuntu as a moral theory, Thaddeus Metz; ubuntu in management, Mzamo Mangaliso." },
    ],
  },
  {
    id: "weak-professional-norms",
    label: "Things aren't done properly to agreed standards",
    cue: "a general lack of professionalism, standards that exist on paper but are not followed, and the leader is expected to work around it",
    lenses: [
      { id: "descriptive-injunctive-norms", name: "What people do vs what they should do", tradition: "middle-range",
        gist: "People take their cue more from what they see others actually doing than from written rules; if the visible norm is cutting corners, the written standard loses.",
        edge: "Suggests changing what is visible and rewarded; less helpful where the standards themselves are unworkable.",
        origin: "Focus theory of normative conduct, Cialdini, Reno & Kallgren." },
      { id: "decoupling", name: "Decoupling", tradition: "middle-range",
        gist: "Organisations often adopt formal rules to look legitimate while day-to-day practice runs separately; the gap is sometimes built in, not an accident.",
        edge: "Explains why policy does not change practice; less about individuals' choices within the gap.",
        origin: "Institutionalised organisations, Meyer & Rowan." },
      { id: "normalisation-of-deviance-norms", name: "Normalisation of deviance", tradition: "middle-range",
        gist: "Small departures from standard that bring no immediate harm become the new standard over time, so nobody experiences themselves as unprofessional.",
        edge: "Explains gradual slippage; less so a sudden collapse of standards.",
        origin: "Normalisation of deviance, Diane Vaughan." },
    ],
  },
  {
    id: "undermined-in-conversation",
    label: "I get talked over or undermined in difficult conversations",
    cue: "the leader lacks the authority or words in hard conversations, is interrupted or undermined, often as a woman among men or with more senior colleagues",
    lenses: [
      { id: "status-expectations", name: "Status expectations", tradition: "middle-range",
        gist: "Groups form quick expectations of who is competent based on status signals like seniority and gender, and those expectations shape who gets heard, regardless of what is said.",
        edge: "Explains why good contributions are discounted; does not tell you on its own how to shift the expectation.",
        origin: "Expectation states theory, Berger; gender and status, Cecilia Ridgeway." },
      { id: "role-congruity", name: "Role congruity", tradition: "middle-range",
        gist: "Women leaders can face a double bind: assertiveness reads as out of role and warmth reads as weakness, so pushback is often about that mismatch rather than about the leader's competence.",
        edge: "Explains gendered resistance; less relevant where the undermining is about seniority alone.",
        origin: "Role congruity theory of prejudice toward female leaders, Eagly & Karau." },
      { id: "employee-voice", name: "Voice and silence", tradition: "middle-range",
        gist: "Whether people speak up depends on whether they judge it safe and worthwhile; a leader can be silenced by the same forces they try to lift for their team.",
        edge: "Explains when people hold back; less about the leader's tactics once they do speak.",
        origin: "Employee voice and silence, Elizabeth Morrison." },
      { id: "restorative-dialogue", name: "Restorative dialogue", tradition: "contextual",
        gist: "In an ubuntu frame a difficult conversation aims at restoring the relationship and shared purpose, not winning; hosting it well can rebuild standing that confrontation would not.",
        edge: "Offers a path that keeps relationships intact; can be read as asking the undermined person to absorb the cost if power is ignored.",
        origin: "Restorative practice; ubuntu as relational ethics, Metz." },
    ],
  },
  {
    id: "work-family-strain",
    label: "I'm stretched between work and family and struggling to keep going",
    cue: "heavy pressure to deliver alongside family and caring responsibilities, talk of needing resilience to keep going",
    lenses: [
      { id: "conservation-of-resources", name: "Conservation of resources", tradition: "middle-range",
        gist: "Stress builds when people lose, or fear losing, the resources they rely on (time, energy, support, status); protecting and rebuilding those resources matters more than pushing harder.",
        edge: "Explains why strain compounds; offers less on the organisational demands driving it.",
        origin: "Conservation of resources theory, Stevan Hobfoll." },
      { id: "work-family-conflict", name: "Work-family conflict", tradition: "middle-range",
        gist: "Time, strain and expectations from work and family compete, and the conflict runs both ways; naming which kind it is points to different responses.",
        edge: "Clarifies the type of conflict; does not remove the competing demands.",
        origin: "Sources of conflict between work and family roles, Greenhaus & Beutell." },
      { id: "job-demands-resources", name: "Job demands and resources", tradition: "middle-range",
        gist: "Burnout follows when demands outrun resources such as support, autonomy and feedback; a leader can sometimes add resources even when they cannot cut demands.",
        edge: "Useful for redesigning work; less so for pressures that come from outside work.",
        origin: "Job demands-resources model, Bakker & Demerouti." },
      { id: "communal-coping", name: "Communal coping", tradition: "contextual",
        gist: "Resilience is not only individual endurance; when a problem is treated as 'ours' and shared, people cope better, which fits an ubuntu view of strength coming through others.",
        edge: "Shifts the frame from personal toughness to shared load; depends on others being willing and able to share it.",
        origin: "Communal coping, Lyons and colleagues; ubuntu." },
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
