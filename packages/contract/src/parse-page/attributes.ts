import { type ParseContext, report } from "./context.ts";
import { type JsxElement, positionOf } from "./markdown.ts";

type AttributeSpec = Readonly<Record<string, "required" | "optional">>;

export const attributes = (
  ctx: ParseContext,
  element: JsxElement,
  spec: AttributeSpec,
): Record<string, string> | undefined => {
  const at = positionOf(element);
  const values: Record<string, string> = {};
  const errorCount = ctx.errors.length;
  for (const attribute of element.attributes) {
    if (attribute.type === "mdxJsxExpressionAttribute") {
      report(ctx, at, `<${element.name}> attributes must be string literals`);
      continue;
    }
    const attributeAt = attribute.position === undefined ? at : positionOf(attribute);
    if (typeof attribute.value !== "string") {
      report(ctx, attributeAt, `attribute "${attribute.name}" must be a string literal`);
      continue;
    }
    if (!Object.hasOwn(spec, attribute.name)) {
      report(ctx, attributeAt, `<${element.name}> has no attribute "${attribute.name}"`);
      continue;
    }
    if (Object.hasOwn(values, attribute.name)) {
      report(ctx, attributeAt, `attribute "${attribute.name}" is repeated`);
      continue;
    }
    values[attribute.name] = attribute.value;
  }
  for (const [name, presence] of Object.entries(spec)) {
    if (presence === "required" && !Object.hasOwn(values, name)) {
      report(ctx, at, `<${element.name}> requires attribute "${name}"`);
    }
  }
  return ctx.errors.length === errorCount ? values : undefined;
};
