/** Time source as an injectable port — keeps domain logic deterministic in tests. */
export interface Clock {
  now(): Date;
}

export const SystemClock: Clock = {
  now: () => new Date(),
};
