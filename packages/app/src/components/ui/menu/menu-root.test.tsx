/**
 * @vitest-environment jsdom
 */
import React, { createRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { Text, type View } from "react-native";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MenuRoot, MenuTrigger } from "./menu-root";
import { RetainedPanelActivity } from "@/components/retained-panel";

beforeEach(() => vi.stubGlobal("React", React));

describe("MenuTrigger", () => {
  it("requires another press after its panel is hidden and reopened", () => {
    const menu = (active: boolean) => (
      <RetainedPanelActivity active={active}>
        <MenuRoot compactMode="sheet">
          <MenuTrigger accessibilityRole="button" accessibilityLabel="Project actions">
            <Text>Actions</Text>
          </MenuTrigger>
        </MenuRoot>
      </RetainedPanelActivity>
    );
    const view = render(menu(true));
    const trigger = view.getByRole("button", { name: "Project actions" });

    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    view.rerender(menu(false));
    view.rerender(menu(true));
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("forwards its rendered trigger to callers", () => {
    const triggerRef = createRef<View>();

    render(
      <MenuRoot>
        <MenuTrigger ref={triggerRef} accessibilityLabel="Open menu">
          <Text>Open</Text>
        </MenuTrigger>
      </MenuRoot>,
    );

    expect(triggerRef.current).not.toBeNull();
  });

  it("asks the owner to close a controlled menu when its panel is hidden", () => {
    const onOpenChange = vi.fn();
    const menu = (active: boolean) => (
      <RetainedPanelActivity active={active}>
        <MenuRoot open onOpenChange={onOpenChange} />
      </RetainedPanelActivity>
    );
    const view = render(menu(true));
    expect(onOpenChange).not.toHaveBeenCalled();

    view.rerender(menu(false));
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
  });
});
