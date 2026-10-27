#!/usr/bin/env bun
import { BunRuntime, BunServices } from "@effect/platform-bun";
import * as Command from "effect/cli/Command";
import * as Effect from "effect/Effect";
import { build } from "./commands/build.ts";
import { dev } from "./commands/dev.ts";
import { validate } from "./commands/validate.ts";

Command.make("explain").pipe(
  Command.withSubcommands([validate, dev, build]),
  Command.run({ version: "0.1.0" }),
  Effect.provide(BunServices.layer),
  BunRuntime.runMain,
);
