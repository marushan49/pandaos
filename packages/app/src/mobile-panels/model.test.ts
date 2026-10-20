import { describe, expect, it } from "vitest";
import type { MobilePanelView } from "@/stores/panel-store";
import {
  canBeginMobilePanelGesture,
  createMobilePanelMotionState,
  getMobilePanelFrame,
  isMobilePanelActive,
  isMobilePanelGestureCurrent,
  transitionMobilePanel,
  type MobilePanelCommit,
  type MobilePanelEvent,
  type MobilePanelMotionState,
} from "./model";

class MobilePanelsScenario {
  private nextRevision = 0;
  private startedRevision = -1;
  private state: MobilePanelMotionState;
  readonly commits: MobilePanelCommit[] = [];

  constructor(target: MobilePanelView = "agent") {
    this.state = createMobilePanelMotionState({ target, revision: this.nextRevision });
  }

  command(target: MobilePanelView) {
    this.nextRevision += 1;
    this.dispatch({ type: "command", selection: { target, revision: this.nextRevision } });
    return this;
  }

  beginGesture(origin: MobilePanelView) {
    this.dispatch({ type: "gesture.begin", origin });
    this.startedRevision = this.state.gesture?.startedRevision ?? -1;
    return this;
  }

  finishGesture(target: MobilePanelView) {
    this.dispatch({
      type: "gesture.finish",
      startedRevision: this.startedRevision,
      success: true,
      target,
    });
    return this;
  }

  cancelGesture() {
    this.dispatch({
      type: "gesture.finish",
      startedRevision: this.startedRevision,
      success: false,
      target: this.state.target,
    });
    return this;
  }

  settleAt(position: number) {
    this.dispatch({ type: "position.changed", position });
    return this;
  }

  snapshot() {
    return {
      motionTarget: this.state.motionTarget,
      revision: this.state.revision,
      settledTarget: this.state.settledTarget,
      target: this.state.target,
    };
  }

  private dispatch(event: MobilePanelEvent) {
    const transition = transitionMobilePanel(this.state, event);
    this.state = transition.state;
    if (transition.commit) {
      this.commits.push(transition.commit);
    }
  }
}

describe("mobile panel ownership", () => {
  it("opens from a native tap while the JavaScript acknowledgement is delayed", () => {
    const initial = createMobilePanelMotionState({ target: "agent", revision: 0 });
    const tapped = transitionMobilePanel(initial, { type: "sidebar.open" });
    expect(tapped.animationTarget).toBe("agent-list");
    expect(tapped.commit).toEqual({ startedRevision: 0, target: "agent-list" });
    expect(tapped.state.target).toBe("agent");

    const reached = transitionMobilePanel(tapped.state, {
      type: "position.changed",
      position: -1,
    }).state;
    expect(isMobilePanelActive(reached, "agent-list")).toBe(false);
    const accepted = transitionMobilePanel(reached, {
      type: "command",
      selection: { target: "agent-list", revision: 1 },
    });
    expect(accepted.animationTarget).toBeUndefined();
    expect(
      isMobilePanelActive(
        transitionMobilePanel(accepted.state, { type: "position.changed", position: -1 }).state,
        "agent-list",
      ),
    ).toBe(true);
  });

  it("reopens immediately when a native tap interrupts closing to the workspace", () => {
    const closing = transitionMobilePanel(
      createMobilePanelMotionState({ target: "agent-list", revision: 7 }),
      { type: "command", selection: { target: "agent", revision: 8 } },
    ).state;
    const tapped = transitionMobilePanel(closing, { type: "sidebar.open" });
    expect(tapped.animationTarget).toBe("agent-list");
    expect(tapped.commit).toEqual({ startedRevision: 8, target: "agent-list" });
    expect(
      transitionMobilePanel(tapped.state, {
        type: "command",
        selection: { target: "agent-list", revision: 9 },
      }).animationTarget,
    ).toBeUndefined();
  });

  it("does not duplicate a pending tap and lets a newer command take over", () => {
    const tapped = transitionMobilePanel(
      createMobilePanelMotionState({ target: "agent", revision: 0 }),
      { type: "sidebar.open" },
    ).state;
    expect(transitionMobilePanel(tapped, { type: "sidebar.open" })).toEqual({ state: tapped });
    const explorer = transitionMobilePanel(tapped, {
      type: "command",
      selection: { target: "file-explorer", revision: 1 },
    });
    expect(explorer.animationTarget).toBe("file-explorer");
    expect(explorer.state.target).toBe("file-explorer");
  });

  it("leaves an active swipe in control when a native tap is requested", () => {
    const dragging = transitionMobilePanel(
      createMobilePanelMotionState({ target: "agent", revision: 0 }),
      { type: "gesture.begin", origin: "agent" },
    ).state;
    expect(transitionMobilePanel(dragging, { type: "sidebar.open" })).toEqual({ state: dragging });
  });

  it("publishes activity only after motion settles", () => {
    const initial = createMobilePanelMotionState({ target: "agent", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "agent",
    }).state;
    const released = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: true,
      target: "agent-list",
    }).state;
    const commandTransition = transitionMobilePanel(released, {
      type: "command",
      selection: { target: "agent-list", revision: 1 },
    });
    const commanded = commandTransition.state;

    expect(isMobilePanelActive(dragging, "agent-list")).toBe(false);
    expect(isMobilePanelActive(released, "agent-list")).toBe(false);
    expect(isMobilePanelActive(commanded, "agent-list")).toBe(false);
    expect(commandTransition.animationTarget).toBeUndefined();

    const settled = transitionMobilePanel(commanded, {
      type: "position.changed",
      position: -1,
    }).state;
    expect(isMobilePanelActive(settled, "agent-list")).toBe(true);
  });

  it("activates immediately when the command arrives after position settles", () => {
    const initial = createMobilePanelMotionState({ target: "agent", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "agent",
    }).state;
    const released = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: true,
      target: "agent-list",
    }).state;
    const reachedAnchor = transitionMobilePanel(released, {
      type: "position.changed",
      position: -1,
    }).state;

    expect(isMobilePanelActive(reachedAnchor, "agent-list")).toBe(false);

    const commanded = transitionMobilePanel(reachedAnchor, {
      type: "command",
      selection: { target: "agent-list", revision: 1 },
    });
    expect(commanded.animationTarget).toBeUndefined();

    const settled = transitionMobilePanel(commanded.state, {
      type: "position.changed",
      position: -1,
    }).state;
    expect(isMobilePanelActive(settled, "agent-list")).toBe(true);
  });

  it("does not change activity for a cancelled preview", () => {
    const initial = createMobilePanelMotionState({ target: "agent", revision: 0 });
    const dragging = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "agent",
    }).state;
    const cancelled = transitionMobilePanel(dragging, {
      type: "gesture.finish",
      startedRevision: 0,
      success: false,
      target: "agent-list",
    }).state;

    expect(isMobilePanelActive(dragging, "agent")).toBe(true);
    expect(isMobilePanelActive(cancelled, "agent")).toBe(true);
    expect(isMobilePanelActive(cancelled, "agent-list")).toBe(false);
  });

  it("keeps the visible panel active until its closing motion settles", () => {
    const initial = createMobilePanelMotionState({ target: "agent-list", revision: 0 });
    const closing = transitionMobilePanel(initial, {
      type: "command",
      selection: { target: "agent", revision: 1 },
    }).state;

    expect(isMobilePanelActive(closing, "agent-list")).toBe(true);

    const settled = transitionMobilePanel(closing, {
      type: "position.changed",
      position: 0,
    }).state;
    expect(isMobilePanelActive(settled, "agent-list")).toBe(false);
    expect(isMobilePanelActive(settled, "agent")).toBe(true);
  });

  it("follows programmatic commands through left, center, and right", () => {
    const panels = new MobilePanelsScenario();

    panels.command("agent-list").settleAt(-1);
    expect(panels.snapshot()).toEqual({
      target: "agent-list",
      motionTarget: "agent-list",
      settledTarget: "agent-list",
      revision: 1,
    });

    panels.command("agent").command("file-explorer").settleAt(1);
    expect(panels.snapshot()).toEqual({
      target: "file-explorer",
      motionTarget: "file-explorer",
      settledTarget: "file-explorer",
      revision: 3,
    });
  });

  it("turns a completed drag into one semantic commit", () => {
    const panels = new MobilePanelsScenario();

    panels.beginGesture("agent").finishGesture("agent-list");

    expect(panels.snapshot()).toEqual({
      target: "agent",
      motionTarget: "agent-list",
      settledTarget: "agent",
      revision: 0,
    });
    expect(panels.commits).toEqual([{ target: "agent-list", startedRevision: 0 }]);
  });

  it("returns a canceled drag to the latest canonical target", () => {
    const panels = new MobilePanelsScenario("agent-list");

    panels.beginGesture("agent-list").cancelGesture();

    expect(panels.snapshot()).toEqual({
      target: "agent-list",
      motionTarget: "agent-list",
      settledTarget: "agent-list",
      revision: 0,
    });
    expect(panels.commits).toEqual([]);
  });

  it("makes a command during a drag invalidate the stale gesture finish", () => {
    const panels = new MobilePanelsScenario();

    panels.beginGesture("agent").command("file-explorer").finishGesture("agent-list");

    expect(panels.snapshot()).toEqual({
      target: "file-explorer",
      motionTarget: "file-explorer",
      settledTarget: "agent",
      revision: 1,
    });
    expect(panels.commits).toEqual([]);
  });

  it("keeps the latest rapid command when position reaches a stale anchor", () => {
    const panels = new MobilePanelsScenario();

    panels.command("agent-list");
    panels.command("agent").command("file-explorer");
    panels.settleAt(-1);

    expect(panels.snapshot()).toEqual({
      target: "file-explorer",
      motionTarget: "file-explorer",
      settledTarget: "agent",
      revision: 3,
    });
  });

  it("keeps an activated drag current while blocking a second drag", () => {
    const initial = createMobilePanelMotionState({ target: "agent", revision: 7 });
    const active = transitionMobilePanel(initial, {
      type: "gesture.begin",
      origin: "agent",
    }).state;

    expect(isMobilePanelGestureCurrent(active, 7)).toBe(true);
    expect(canBeginMobilePanelGesture(active, "agent", 0)).toBe(false);
  });

  it("derives both transforms and both backdrops from one normalized position", () => {
    expect(getMobilePanelFrame(0.25, 400)).toEqual({
      leftBackdropOpacity: 0,
      leftTranslateX: -400,
      rightBackdropOpacity: 0.25,
      rightTranslateX: 300,
    });
    expect(getMobilePanelFrame(0.25, 800)).toEqual({
      leftBackdropOpacity: 0,
      leftTranslateX: -800,
      rightBackdropOpacity: 0.25,
      rightTranslateX: 600,
    });
  });
});
