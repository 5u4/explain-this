import {
  type KeyboardEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { type BlockOf, Blocks } from "./blocks.tsx";

export function TabsView({ block }: { readonly block: BlockOf<"tabs"> }): ReactNode {
  const id = useId();
  const [selected, setSelected] = useState(0);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const ink = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const button = buttons.current[selected];
    if (button === null || button === undefined || ink.current === null) return;
    ink.current.style.transform = `translateX(${button.offsetLeft}px)`;
    ink.current.style.width = `${button.offsetWidth}px`;
  }, [selected]);
  const onKeyDown = (event: KeyboardEvent) => {
    const count = block.tabs.length;
    const active = document.activeElement;
    const current = active instanceof HTMLButtonElement ? buttons.current.indexOf(active) : -1;
    const next =
      event.key === "ArrowRight"
        ? current + 1
        : event.key === "ArrowLeft"
          ? current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? count - 1
              : undefined;
    if (next === undefined) return;
    event.preventDefault();
    const index = (next + count) % count;
    setSelected(index);
    buttons.current[index]?.focus();
  };
  return (
    <div className="tabs">
      <div className="tab-bar" role="tablist" onKeyDown={onKeyDown}>
        {block.tabs.map((tab, index) => (
          <button
            key={index}
            ref={(button) => {
              buttons.current[index] = button;
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel-${index}`}
            aria-selected={index === selected}
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {tab.label}
          </button>
        ))}
        <span className="tab-ink" ref={ink} aria-hidden="true" />
      </div>
      {block.tabs.map((tab, index) => (
        <section
          key={index}
          className="tab-panel"
          role="tabpanel"
          id={`${id}-panel-${index}`}
          aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0}
          hidden={index !== selected}
        >
          <Blocks blocks={tab.children} />
        </section>
      ))}
    </div>
  );
}
