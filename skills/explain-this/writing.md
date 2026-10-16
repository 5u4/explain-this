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
