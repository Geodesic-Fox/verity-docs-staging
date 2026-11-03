import Link from "next/link"

import { TokenList } from "@/components/assumptions/assumption-token"
import { Table1View } from "@/components/tables/table-1-backends"
import { familyName, families } from "@/lib/families"
import { getSecurityProfiles } from "@/lib/security"

/*
 * One row per backend, each with its full properties and assumptions, from
 * the entities JSON's backend profiles. `family` filters to one backend
 * family (its renderer name or site name). The published Table 1 sits in a
 * collapsed source note.
 */
export function SecurityTable({ family }: { family?: string }) {
  const profiles = getSecurityProfiles().filter(
    (p) => !family || p.family === familyName(family)
  )
  if (!profiles.length) {
    return (
      <p className="rounded-lg border px-4 py-6 text-center text-sm text-muted-foreground">
        No security profile for {familyName(family ?? "")} yet.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="w-[10rem] px-4 py-2.5 font-medium">Backend</th>
              <th className="px-4 py-2.5 font-medium">Properties</th>
              <th className="px-4 py-2.5 font-medium">Assumptions</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((profile) => {
              const backendFamily = families.find((f) => f.name === profile.family)
              return (
                <tr className="border-t align-top" key={profile.backend}>
                  <th
                    className="px-4 py-3 text-left font-mono text-[12.5px] font-medium whitespace-nowrap"
                    scope="row"
                  >
                    {backendFamily?.href ? (
                      <Link
                        className="hover:underline"
                        href={backendFamily.href}
                        title={backendFamily.name}
                      >
                        {profile.backend}
                      </Link>
                    ) : (
                      profile.backend
                    )}
                  </th>
                  <td className="px-4 py-3">
                    <TokenList citations={profile.properties} />
                  </td>
                  <td className="px-4 py-3">
                    {profile.assumptions.length ? (
                      <TokenList citations={profile.assumptions} />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Only proven bounds
                      </span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        These are each backend&apos;s own. A result also rests on its
        statement&apos;s assumptions: the hashes of its commitment scheme,
        shown with each result under Performance.
      </p>
      <details className="group text-sm">
        <summary className="cursor-pointer list-none text-xs text-muted-foreground select-none hover:text-foreground">
          <span className="inline-block transition-transform group-open:rotate-90">›</span>{" "}
          Source: the published Table 1
        </summary>
        <div className="mt-3">
          <Table1View family={family} />
        </div>
      </details>
    </div>
  )
}
