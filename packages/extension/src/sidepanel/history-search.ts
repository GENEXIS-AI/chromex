export function createConfirmedHistorySearchRequest(query: string) {
  return {
    type: "context.history.search" as const,
    query,
    confirmed: true,
  };
}
