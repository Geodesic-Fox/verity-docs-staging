import { TokenButton } from "@/components/assumptions/token-button"
import { CircuitLink } from "@/components/census/circuit-modal"
import { subcircuitLabel, subcircuits, templateList, type Template } from "@/data/subcircuits"
import { tokenData } from "@/lib/assumption-index"
import { circuitIndex } from "@/lib/circuit-index"

function TemplateSection({ template }: { template: Template }) {
  const members = subcircuits.filter((s) => s.template === template.id)
  return (
    <section className="scroll-mt-24 border-t pt-6" id={template.id}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3>{template.name}</h3>
        <TokenButton {...tokenData(template.id)} label="Definition" />
        {circuitIndex().templates[template.id] ? (
          <CircuitLink circuit={template.id} className="text-[13px] font-medium text-muted-foreground hover:text-foreground">
            View circuit
          </CircuitLink>
        ) : null}
      </div>
      <p className="mt-1.5 max-w-[760px] text-[14px] text-muted-foreground">{template.summary}</p>

      <table className="mt-4 w-full max-w-[860px] table-fixed text-[13px]">
        <thead className="text-left text-xs text-muted-foreground">
          <tr>
            <th className="w-[9rem] pb-1.5 font-medium">Parameter</th>
            <th className="w-[45%] pb-1.5 font-medium">Meaning</th>
            <th className="pb-1.5 font-medium">Values</th>
          </tr>
        </thead>
        <tbody>
          {template.parameters.map((p) => (
            <tr className="border-t align-baseline" key={p.key}>
              <td className="py-1.5 pr-4">{p.label}</td>
              <td className="py-1.5 pr-4 text-muted-foreground">{p.description}</td>
              <td className="py-1.5 tabular-nums">
                {[...new Set(members.map((s) => s.params[p.key]))].join(", ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="mr-1 text-muted-foreground">Subcircuits</span>
        {members.map((s) => (
          <TokenButton key={s.id} {...tokenData(s.id)} label={subcircuitLabel(s)} />
        ))}
      </div>
    </section>
  )
}

export function SubcircuitTemplates() {
  const measured = templateList.filter((t) => !t.placeholder)
  const pending = templateList.filter((t) => t.placeholder)
  return (
    <div className="not-prose font-sans" data-breakout="">
      <div className="flex flex-col gap-10">
        {measured.map((t) => (
          <TemplateSection key={t.id} template={t} />
        ))}
      </div>

      <p className="mt-16 text-[13px] font-medium text-muted-foreground">Not in the tables yet</p>
      <p className="mt-1 max-w-[720px] text-[13px] text-muted-foreground">
        Templates from the vLLM integration. Input sets have been exported from a vLLM serving run of Llama-3.2-1B on an
        L40S, but no backend has results on them yet.
      </p>
      <div className="mt-6 flex flex-col gap-10">
        {pending.map((t) => (
          <TemplateSection key={t.id} template={t} />
        ))}
      </div>
    </div>
  )
}
