import * as Command from "effect/cli/Command";
import { check } from "./freshness/check.ts";
import { sync } from "./freshness/sync.ts";

export const freshness = Command.make("freshness").pipe(
  Command.withDescription("Compare pages with the files they cite"),
  Command.withSubcommands([check, sync]),
);
