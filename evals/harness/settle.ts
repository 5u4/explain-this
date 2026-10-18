export async function settleAll<T>(promises: Iterable<Promise<T>>): Promise<T[]> {
  const values: T[] = [];
  for (const result of await Promise.allSettled(promises)) {
    if (result.status === "rejected") throw result.reason;
    values.push(result.value);
  }
  return values;
}
