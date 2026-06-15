import type { ExecutionDto } from "../../types/execution.types.js";

export * from "./artifacts.js";
export * from "./browser.js";
export * from "./common.js";
export * from "./detailView.js";
export * from "./inputFields.js";
export * from "./listHelpers.js";
export * from "./listView.js";
export * from "./phase.js";
export * from "./result.js";
export * from "./runtimeSession.js";

export const sortExecutionsByRecent = (executions: ExecutionDto[]): ExecutionDto[] => (
  [...executions].sort(
    (left, right) =>
      new Date(right.startedAt || right.createdAt).getTime()
      - new Date(left.startedAt || left.createdAt).getTime(),
  )
);
