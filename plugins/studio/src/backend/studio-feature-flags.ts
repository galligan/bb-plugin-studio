export interface StudioFeatureFlags {
  readonly enrolledHostDiscovery: boolean;
}

/**
 * Product-scope switches owned by Plugin Studio.
 *
 * Enrolled-host discovery stays off until Studio can consume a bounded public
 * bb host API. Turning the flag on only brings remote projects into the
 * inventory contract; it must never make their paths eligible for the local
 * filesystem scanner.
 */
export const STUDIO_FEATURE_FLAGS: StudioFeatureFlags = Object.freeze({
  enrolledHostDiscovery: false,
});
