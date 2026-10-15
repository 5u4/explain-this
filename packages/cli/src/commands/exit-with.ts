import * as Data from "effect/Data";
import * as Runtime from "effect/Runtime";

export class ExitWith extends Data.TaggedError("ExitWith")<{ readonly code: 1 | 2 }> {
  override get [Runtime.errorExitCode](): number {
    return this.code;
  }
  override readonly [Runtime.errorReported] = false;
}
