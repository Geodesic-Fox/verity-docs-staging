Verity is a system for verifying how AI datacenters are used. It aims for security in extremely adversarial settings: the intended application is enforcing an international agreement to [deliberately pace AI development](https://www.pacingthefrontier.com/). A *developer* keeps private records of the computations it runs in its datacenters, as Boolean circuits and the values they computed, and continuously proves to an *auditor* that those records have properties chosen as proxies for two ideals:

- **Faithfulness:** the records accurately and comprehensively reflect the developer's actual computations.
- **Inference-only:** the records reflect only having performed inference, not training.

Verity has two protocols, remote and onsite, which differ in one thing: whether the auditor has hardware at the developer's site. [Architecture](/protocols/remote#physical-architecture) shows the layers they're built from.

## Where to start

- **What an accept means**, and who has to trust what: Protocols, then [Remote](/protocols/remote) and [Onsite](/protocols/onsite).
- **The vocabulary every page shares**, such as proof blocks, boundary gates and incorrect proof blocks: Circuit declaration.
- **Why a sample bounds the faults**: [Sampling](/proof-systems/sampling). **What the auditor learns**: [Zero knowledge](/proof-systems/zero-knowledge).
- **What it costs**: each page's *Overhead* section, and Performance.
- **Inference-only**: the inference-only policy.
- **Figures for estimates**: Hardware and Workloads.
- **A term you don't know**: the Glossary.

## Reading a page

A page that states a guarantee gives its public parameters and outputs, the protocol, and its security: the assumptions it rests on, and each guarantee with the error it carries. A guarantee is a theorem in which named assumptions imply a conclusion; an assumption is a named hypothesis that nothing proves. Where a page sketches a guarantee's proof, the sketch carries one of three marks. *Proved for the abstract scheme* means Lean proves the statement over abstract primitives, such as any commit-and-prove argument with the stated properties, and nothing yet connects it to the construction Verity runs. *Proved and instantiated* means Lean proves it of that construction, under the assumptions the page names. *Lean proof pending* means the statement is given here and its Lean proof is not done. Security assumptions lists the cryptographic assumptions, with a rating of how far to trust each one.
