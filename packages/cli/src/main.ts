#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import * as Cause from "effect/Cause";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Runtime from "effect/Runtime";
import { open } from "./commands/open.ts";
import { validate } from "./commands/validate.ts";

Command.make("explain").pipe(
  Command.withSubcommands([validate, open]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain({
    teardown: (exit, onExit) =>
      Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)
        ? onExit(0)
        : Runtime.defaultTeardown(exit, onExit),
  }),
);
