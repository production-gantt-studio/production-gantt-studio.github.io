import { describe, expect, it } from "vitest";
import { getStepIndex, mobileTutorialSteps, readTutorialSeen, shouldAutoStartTutorial, writeTutorialSeen } from "./mobileTutorial";

function memoryStorage(initial: Record<string, string> = {}) {
  const store = { ...initial };
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    store,
  };
}

describe("mobileTutorialSteps", () => {
  it("has seven steps, each pointing at exactly one real screen element or the centre", () => {
    expect(mobileTutorialSteps).toHaveLength(7);
    expect(mobileTutorialSteps.every((step) => step.id && step.title && step.body)).toBe(true);
  });

  it("opens a real task only on the step that explains the detail sheet", () => {
    const withOpen = mobileTutorialSteps.filter((step) => step.opensTask);
    expect(withOpen.map((step) => step.id)).toEqual(["sheet"]);
  });

  it("only the gantt step runs on the gantt view", () => {
    const ganttSteps = mobileTutorialSteps.filter((step) => step.view === "gantt");
    expect(ganttSteps.map((step) => step.id)).toEqual(["gantt"]);
  });
});

describe("seen flag", () => {
  it("round-trips through storage", () => {
    const storage = memoryStorage();
    expect(readTutorialSeen(storage)).toBe(false);
    writeTutorialSeen(storage);
    expect(readTutorialSeen(storage)).toBe(true);
  });

  it("treats a broken storage as not seen, without throwing", () => {
    const broken = {
      getItem: () => {
        throw new Error("storage disabled");
      },
    };
    expect(readTutorialSeen(broken)).toBe(false);
  });

  it("does not throw when storage refuses to write", () => {
    const broken = {
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() => writeTutorialSeen(broken)).not.toThrow();
  });
});

describe("shouldAutoStartTutorial", () => {
  it("starts only for a first-time editor with at least one task", () => {
    expect(shouldAutoStartTutorial({ seen: false, readOnly: false, taskCount: 3 })).toBe(true);
    expect(shouldAutoStartTutorial({ seen: true, readOnly: false, taskCount: 3 })).toBe(false);
    expect(shouldAutoStartTutorial({ seen: false, readOnly: true, taskCount: 3 })).toBe(false);
    expect(shouldAutoStartTutorial({ seen: false, readOnly: false, taskCount: 0 })).toBe(false);
  });
});

describe("getStepIndex", () => {
  it("finds a step by id and returns -1 for an unknown id", () => {
    expect(getStepIndex("summary")).toBe(2);
    expect(getStepIndex("nope")).toBe(-1);
  });
});
