import type { PermissionRequestPlan } from "../permission-plans.js";

export function shouldShowPermissionStatusBanner(plan: PermissionRequestPlan): boolean {
  if (plan.origins?.length || plan.permissions?.length) {
    return false;
  }

  return false;
}
