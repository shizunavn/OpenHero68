/**
 * Firmware 0323 host-facing distance scale.
 *
 * Hardware cross-readback against the official AULA driver confirmed that AP,
 * Rapid Trigger and dead-zone packet integers use 0.01 mm per wire unit.
 * Keep every encoder/decoder/telemetry path on this single constant: the old
 * 0.001 value caused an exact x10 write/read bug.
 */
export const HERO68_DISTANCE_UNIT_MM = 0.01 as const
