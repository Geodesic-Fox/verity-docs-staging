import type { Metadata } from "next"

import { AssumptionToken } from "@/components/assumptions/assumption-token"
import { registryAnchor } from "@/lib/assumption-index"
import {
  registry,
  trustDescriptions,
  trustLabels,
  trustLevels,
  type Entry,
} from "@/lib/assumptions"
import { getPage } from "@/lib/docs"

const page = getPage(["assumptions"])!

export const metadata: Metadata = {
  title: page.title,
  description: page.description,
}

function Row({ entry, detail }: { entry: Entry; detail?: string }) {
  return (
    <tr className="scroll-mt-24 border-t align-top" id={registryAnchor(entry.id)}>
      <td className="w-[15rem] px-4 py-3">
        <AssumptionToken citation={{ id: entry.id }} />
      </td>
      <td className="px-4 py-3">{entry.summary}</td>
      {detail !== undefined ? (
        <td className="w-[40%] px-4 py-3 text-muted-foreground">{detail}</td>
      ) : null}
    </tr>
  )
}

export default function AssumptionsPage() {
  const assumptions = registry.filter((e) => e.kind === "assumption")
  const properties = registry.filter((e) => e.kind === "property")
  return (
    <div className="w-full max-w-[1100px] px-6 py-12 font-sans lg:px-10">
      <h1 className="text-[2rem] leading-[1.16] font-[450] tracking-[-0.04em]">
        {page.label}
      </h1>
      <p className="mt-2 max-w-[720px] text-[15px] text-muted-foreground">
        Every security claim in these docs lists a component&apos;s properties
        and the assumptions they rest on. Assumptions are rated by how far to
        trust them. Select any token for its precise statement.
      </p>

      <table className="mt-6 text-[13px]">
        <tbody>
          {trustLevels.map((level) => (
            <tr key={level}>
              <td className="py-1 pr-4 align-baseline">
                <span className="docs-trust" data-trust={level}>
                  {trustLabels[level]}
                </span>
              </td>
              <td className="py-1 align-baseline text-muted-foreground">
                {trustDescriptions[level]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-8 overflow-hidden rounded-lg border text-[13px]">
        <table className="w-full">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Assumption</th>
              <th className="px-4 py-2.5 font-medium">In words</th>
              <th className="px-4 py-2.5 font-medium">Why this rating</th>
            </tr>
          </thead>
          <tbody>
            {trustLevels.flatMap((level) =>
              assumptions
                .filter((e) => e.kind === "assumption" && e.trust === level)
                .map((entry) => (
                  <Row
                    detail={entry.kind === "assumption" ? entry.why : ""}
                    entry={entry}
                    key={entry.id}
                  />
                ))
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mt-14 text-lg font-semibold tracking-[-0.01em]">Properties</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        What a component has, as opposed to what it assumes. They need no
        rating.
      </p>
      <div className="mt-4 overflow-hidden rounded-lg border text-[13px]">
        <table className="w-full">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 font-medium">Property</th>
              <th className="px-4 py-2.5 font-medium">In words</th>
            </tr>
          </thead>
          <tbody>
            {properties.map((entry) => (
              <Row entry={entry} key={entry.id} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
