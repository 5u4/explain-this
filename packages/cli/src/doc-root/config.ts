import { ExplainConfig } from "@explain/contract/config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SchemaIssue from "effect/SchemaIssue";

export class DocRootNotFound extends Schema.TaggedError<DocRootNotFound>()("DocRootNotFound", {
  from: Schema.String,
}) {}

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  diagnostics: Schema.Array(
    Schema.Struct({
      file: Schema.String,
      line: Schema.Number,
      column: Schema.Number,
      message: Schema.String,
    }),
  ),
}) {}

export const configFileName = "explain.json";

export const findDocRoot = Effect.fnUntraced(function* (from: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let directory = path.resolve(from);
  while (true) {
    if (yield* fs.exists(path.join(directory, configFileName))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return yield* new DocRootNotFound({ from });
    directory = parent;
  }
});

const decodeConfig = (text: string) =>
  Schema.decodeUnknownEffect(Schema.fromJsonString(ExplainConfig))(text, {
    errors: "all",
    onExcessProperty: "error",
  }).pipe(
    Effect.mapError(
      (error) =>
        new InvalidConfig({
          diagnostics: SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map(
            (issue) => ({
              file: configFileName,
              line: 1,
              column: 1,
              message:
                issue.path === undefined || issue.path.length === 0
                  ? issue.message
                  : `${issue.path.map((segment) => (typeof segment === "object" ? segment.key : String(segment))).join(".")}: ${issue.message}`,
            }),
          ),
        }),
    ),
  );

export const loadConfig = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  return yield* decodeConfig(yield* fs.readFileString(path.join(root, configFileName)));
});
