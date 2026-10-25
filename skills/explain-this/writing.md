# Writing a page

The reader is an engineer new to this code. They scan headings and first sentences, and read on only
where those promise an answer. Every rule below ends in a check.

## Page

- **Bottom line up front.** The first paragraph says what the component is for and the one idea that
  makes it work. A reader who stops there can say both.
- **Headings are claims.** Each heading states what its section shows: "Retries stop after the third
  failure" rather than "Retries". The headings alone outline the page.
- **Fold detail.** Line-by-line walkthroughs and edge cases a first read can skip go in `<details>`.
  The page reads whole with every `<details>` closed.
- **Curse of knowledge.** Define each project term at first use, and keep one name per concept for
  the whole page.
- **Glossary on a trigger.** When the page uses three or more project terms the reader must hold
  at once, a short glossary under the first paragraph defines them; each term still gets its
  first-use definition in the prose. A page with fewer such terms has no glossary.

## Examples

- **Trace one case.** Pick one concrete case and state its assumptions in one sentence: the input,
  the caller, the state it starts from. Follow it through every step the page covers; each step cites
  the lines it runs, says why it happens, and names the condition that would skip it. Variants come
  after the trace, each naming the step where it diverges.
- **Running example.** Later sections reuse the traced case. A new case appears only where the
  traced one cannot reach.
- **Concrete before general.** When the page names an abstraction (an interface, a generic type, a
  lifecycle), the traced case comes first, then the general form, then a sentence mapping the parts:
  "`req.user` here is the `Principal` of the interface".
- **Two instances for a pattern.** A claim that a pattern recurs shows two instances from different
  modules side by side, then one sentence on what they share.
- **Near miss.** Where a reader would over-apply a rule, show the case that looks alike but lacks
  the one attribute that matters, and name that attribute. Label a tempting wrong reading before
  showing it: "You might expect …, but …".
- **Introduce and trim excerpts.** A sentence before each excerpt says what to look at in it. Cite
  only the ranges that carry the point; several ranges in one citation skip the lines between. An
  excerpt longer than about ten lines becomes an `<AnnotatedSource>` whose notes label each chunk
  with its purpose (validate input, resolve target, dispatch).

## Pictures

There is no diagram quota: no page or paragraph must have a diagram. Content triggers a picture;
the count of pictures is never a goal. Diagram syntax and rendering are in `format.md`.

- **Draw on a trigger.** Draw only when the content matches a trigger, using its form:
  - three or more things related non-linearly (calls, dependencies, ownership): a `flowchart`;
  - states and the transitions between them: a `stateDiagram`;
  - three or more actors passing messages over time, even in one fixed order: a `sequenceDiagram`;
  - one data shape changing across steps: a `<Tabs>` with one `<Tab>` per step, each showing the
    shape at that step.

  These are not triggers: a linear process one actor runs that fits a numbered list (write the
  list), including tabs that each describe a step in words or commands rather than show the data
  shape at that step; logic inside one function (cite it); a concept one sentence explains (write
  the sentence).
  Before drawing, name the trigger to yourself; the page does not justify its diagrams. With no
  trigger, do not draw.
- **Tables for comparisons.** Options compared across shared dimensions go in a table, one row per
  option. A state diagram with self-loops or parallel edges, or a branch-only decision tree, is
  also a table.

A picture is a mermaid diagram or a step-snapshot `<Tabs>`: one whose tabs are the ordered steps of
one process. A `<Tabs>` offering alternatives (languages, platforms, variants) is not a picture.
Every picture passes these checks; edges labeled and node cap apply to mermaid diagrams only:

- **Question named.** The last sentence before the picture, directly above its fence or `<Tabs>`,
  names the question it answers: "Which process tells the browser to reload?". A heading alone
  does not count.
- **Edges labeled.** Every edge and message carries a label saying what flows or happens along it:
  `A -->|calls on save| B`. An unlabeled arrow fails.
- **Node cap.** At most 7 nodes, participants, or states. This is a legibility ceiling: past it,
  split the diagram by question or move detail to prose.
- **Nodes cited.** Every in-repo node, and every tab's shape, names something the page's prose
  cites to code, so a reader can go from each box or step to its lines. An actor outside the repo
  (browser, user, external service) passes when the prose names it as outside the repo.
- **Earns its place.** Words that narrate the same thing as the picture, prose or a list, are the
  pairing: keep it. Delete the picture only when it redraws a table or another picture on the same
  page, or depicts a single relation the sentence directly above it states in full.

## Pages in another language

- **Terms stay in English.** Write every word that names a thing or state in software in English:
  skill, stale, citation, page, claim, file, command, directory, commit, exit code. The page's
  language carries verbs, connectives, explanation, and the page naming itself (本页). The Curse of
  knowledge definition is in the page's language; after it, the English term stands alone. Swapping
  the page's language would leave every software term as it is.

### Chinese

- **Break 一逗到底.** Keep each clause under about 20 characters. End the sentence with 。 once a
  comma chain reaches three clauses.
- **Move a long 定语 behind its noun.** Write "此设备必须在技师的指导下使用，且技师必须接受过正式培训",
  not "必须在接受过正式培训的技师的指导下使用".
- **Write out 翻译腔.** Use the verb itself: 研究, not 进行研究; 因此, not 基于这个原因. Use 被 only
  when the sentence is about the thing acted on.
