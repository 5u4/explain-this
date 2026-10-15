import type { ReactNode } from "react";
import type { Diagnostic } from "../api.ts";

export function DevErrors({
  title,
  errors,
}: {
  readonly title: string;
  readonly errors: ReadonlyArray<Diagnostic>;
}): ReactNode {
  return (
    <section className="dev-errors" role="alert">
      <h2 className="dev-errors-title">{title}</h2>
      <ol>
        {errors.map((error, index) => (
          <li key={index}>
            <code>
              {error.file}:{error.line}:{error.column}
            </code>
            <span>{error.message}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
