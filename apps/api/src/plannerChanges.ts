export type PlannerChanges = {
  current: () => number;
  bump: () => number;
};

export function createPlannerChanges(): PlannerChanges {
  let version = 0;

  return {
    current: () => version,
    bump: () => {
      version += 1;
      return version;
    }
  };
}
