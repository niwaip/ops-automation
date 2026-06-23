import { sortExecutionsByRecent, type ExecutionDto } from '@ops/user-core';

const sampleExecutions: ExecutionDto[] = [];

export function ExecutionListExample() {
  const items = sortExecutionsByRecent(sampleExecutions);

  return (
    <section>
      <h2>Execution List Example</h2>
      <p>Loaded items: {items.length}</p>
    </section>
  );
}
