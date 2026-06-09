/**
 * DI token for the IndexQueue port (interfaces have no runtime identity in NestJS).
 * Kept free of the BullMQ import so services/tests can depend on the port without
 * pulling the native msgpackr addon (which crashes under Bun — see bull-index-queue.ts).
 */
export const INDEX_QUEUE_PORT = Symbol('INDEX_QUEUE_PORT');
