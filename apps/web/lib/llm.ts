import { createPlanner, type Provider } from "@people/shared";

export function getPlanner(provider: Provider) {
  return createPlanner(provider);
}

export type { Provider };
