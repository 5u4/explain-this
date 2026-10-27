#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import { open, openTeardown } from "./commands/open.ts";
import { validate } from "./commands/validate.ts";

Command.make("explain").pipe(
  Command.withSubcommands([validate, open]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({ teardown: openTeardown }),
);
