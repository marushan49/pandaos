// @vitest-environment jsdom
import React, { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BottomSheetScope } from "@/components/ui/bottom-sheet-scope";
import { EditingTextInput } from "./text-input.native";
import { EditingTextInput as EditingTextInputWeb } from "./text-input.web";
import type { EditingTextInputHandle } from "./types";

const bottomSheetTextInputRender = vi.hoisted(() => vi.fn());

vi.mock("@gorhom/bottom-sheet", async () => {
  const ReactModule = await import("react");
  return {
    BottomSheetTextInput: ReactModule.forwardRef<HTMLInputElement, Record<string, unknown>>(
      (props, ref) => {
        bottomSheetTextInputRender(props);
        return ReactModule.createElement("input", {
          ...props,
          ref,
          "data-bottom-sheet-input": true,
        });
      },
    ),
  };
});

vi.mock("@mattermost/react-native-paste-input", async () => {
  const ReactModule = await import("react");
  return {
    default: ReactModule.forwardRef<HTMLInputElement, Record<string, unknown>>((props, ref) =>
      ReactModule.createElement("input", { ...props, ref }),
    ),
  };
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  bottomSheetTextInputRender.mockClear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root && container) {
    act(() => {
      root?.unmount();
    });
    container.remove();
  }
  root = null;
  container = null;
});

function noop() {}

describe.each([
  ["native", EditingTextInput],
  ["web", EditingTextInputWeb],
] as const)("%s input user focus", (_platform, Input) => {
  it("ignores autofocus and imperative focus but reports explicit keyboard focus and touches", () => {
    const onUserFocus = vi.fn();
    const handle = createRef<EditingTextInputHandle>();
    act(() => {
      root?.render(<Input ref={handle} autoFocus onUserFocus={onUserFocus} />);
    });
    expect(onUserFocus).not.toHaveBeenCalled();
    act(() => {
      handle.current?.blur();
      handle.current?.focus();
    });
    expect(onUserFocus).not.toHaveBeenCalled();
    const input = container?.querySelector("input");
    if (!input) throw new Error("Input not rendered");
    act(() => {
      input.blur();
      input.focus();
    });
    expect(onUserFocus).toHaveBeenCalledOnce();
    act(() => input.dispatchEvent(new Event("touchstart", { bubbles: true })));
    expect(onUserFocus).toHaveBeenCalledTimes(2);
  });
});

function createHandleRecorder() {
  const handleRef = createRef<EditingTextInputHandle>();
  const received: (EditingTextInputHandle | null)[] = [];
  function assignHandle(handle: EditingTextInputHandle | null) {
    received.push(handle);
    handleRef.current = handle;
  }
  return { handleRef, received, assignHandle };
}

describe("EditingTextInputNative", () => {
  it("uses the bottom-sheet input only inside a bottom sheet", () => {
    act(() => {
      root?.render(
        <>
          <EditingTextInput testID="outside" />
          <BottomSheetScope>
            <EditingTextInput testID="inside" />
          </BottomSheetScope>
        </>,
      );
    });

    expect(
      container?.querySelector('[data-testid="outside"]')?.getAttribute("data-bottom-sheet-input"),
    ).toBeNull();
    expect(bottomSheetTextInputRender).toHaveBeenCalledOnce();
    expect(bottomSheetTextInputRender.mock.calls[0]?.[0]).toMatchObject({ testID: "inside" });
  });

  it("keeps its editing handle and selection when native editing rerenders the leaf", () => {
    const { handleRef, received, assignHandle } = createHandleRecorder();
    act(() =>
      root?.render(<EditingTextInput ref={assignHandle} initialValue="initial" multiline />),
    );
    const input = container?.querySelector("textarea");
    if (!input) throw new Error("Expected native editing surface");
    const handle = handleRef.current;
    act(() => {
      handle?.focus();
      const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      if (!setValue) throw new Error("Expected input value setter");
      setValue.call(input, "native edit");
      input.setSelectionRange(2, 5);
      input.dispatchEvent(new InputEvent("input", { bubbles: true, data: "native edit" }));
    });
    expect(handleRef.current).toBe(handle);
    expect(received).toEqual([handle]);
    expect(handle?.getText()).toBe("native edit");
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(document.activeElement).toBe(input);
    act(() => root?.unmount());
    root = null;
    expect(received).toEqual([handle, null]);
  });

  it("clears text via clear() when replaceText receives an empty string", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(<EditingTextInput ref={handleRef} initialValue="initial" onChangeText={noop} />);
    });

    expect(handleRef.current?.getText()).toBe("initial");

    act(() => {
      handleRef.current?.replaceText("");
    });

    expect(handleRef.current?.getText()).toBe("");
  });

  it("clears forwarded keystrokes after native change handling so repeated letters arrive once", () => {
    const handleRef = createRef<EditingTextInputHandle>();
    const forwarded: string[] = [];
    let handlingChange = false;
    const forwardText = vi.fn((text: string) => {
      handlingChange = true;
      forwarded.push(text);
      handleRef.current?.replaceText("");
      handlingChange = false;
    });
    act(() => {
      root?.render(<EditingTextInput ref={handleRef} onChangeText={forwardText} />);
    });
    const input = container?.querySelector("input");
    if (!input) throw new Error("Expected native input");
    Object.assign(input, {
      clear: () => {
        if (!handlingChange) input.value = "";
      },
    });
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setValue) throw new Error("Expected input value setter");
    for (const letter of ["a", "a", "b"]) {
      act(() => {
        setValue.call(input, input.value + letter);
        input.dispatchEvent(new InputEvent("input", { bubbles: true, data: letter }));
      });
      expect(input.value).toBe("");
      expect(handleRef.current?.getText()).toBe("");
    }
    expect(forwarded).toEqual(["a", "a", "b"]);
  });

  it("replaces the native input when resetting the editor", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(
        <EditingTextInput
          ref={handleRef}
          initialValue="line one\nline two\nline three"
          onChangeText={noop}
        />,
      );
    });
    const grownInput = container?.querySelector("input");
    const handle = handleRef.current;

    act(() => {
      handleRef.current?.reset();
    });

    expect(container?.querySelector("input")).not.toBe(grownInput);
    expect(handleRef.current).toBe(handle);
  });

  it("discards a queued replacement when the editor is reset in the same update", () => {
    const handleRef = createRef<EditingTextInputHandle>();
    act(() => root?.render(<EditingTextInput ref={handleRef} initialValue="initial" />));
    act(() => {
      handleRef.current?.replaceText("replacement");
      handleRef.current?.reset();
    });
    expect(handleRef.current?.getText()).toBe("");
    expect(container?.querySelector("input")?.value).toBe("");
  });

  it("restores focus after replacing a reset native input", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(<EditingTextInput ref={handleRef} initialValue="message" />);
    });
    const originalInput = container?.querySelector("input");
    if (!originalInput) throw new Error("Expected native input");
    Object.assign(originalInput, { isFocused: () => true });
    originalInput.focus();

    act(() => {
      handleRef.current?.reset();
    });

    expect(document.activeElement).toBe(container?.querySelector("input"));
  });

  it("focuses the replacement input when focus is requested before an editor reset remounts", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(<EditingTextInput ref={handleRef} initialValue="stale" />);
    });
    const originalInput = container?.querySelector("input");
    if (!originalInput) throw new Error("Expected native input");
    const originalFocus = vi.spyOn(originalInput, "focus");

    act(() => {
      handleRef.current?.reset();
      handleRef.current?.focus();
    });

    const replacementInput = container?.querySelector("input");
    expect(replacementInput).not.toBe(originalInput);
    expect(originalFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(replacementInput);
  });

  it("drops a pending focus restore when blur is requested before an editor reset remounts", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(<EditingTextInput ref={handleRef} initialValue="stale" />);
    });
    const originalInput = container?.querySelector("input");
    if (!originalInput) throw new Error("Expected native input");
    Object.assign(originalInput, { isFocused: () => true });
    originalInput.focus();

    act(() => {
      handleRef.current?.reset();
      handleRef.current?.blur();
    });

    expect(document.activeElement).not.toBe(container?.querySelector("input"));
  });

  it("updates textRef and text when replaceText receives non-empty text", () => {
    const handleRef = createRef<EditingTextInputHandle>();

    act(() => {
      root?.render(<EditingTextInput ref={handleRef} initialValue="hello" />);
    });

    expect(handleRef.current?.getText()).toBe("hello");

    act(() => {
      handleRef.current?.replaceText("world", { start: 0, end: 5 });
    });

    expect(handleRef.current?.getText()).toBe("world");
  });
});
