// MCP mode placeholder. The Remote MCP server authenticates through the editor host
// (OAuth in Claude Code), so a browser app cannot call it directly. A real MCP mode
// would run server-side through an MCP client with the user's authorization, use
// read operations only by default, and require explicit confirmation for writes.
// Until that exists, every method fails clearly instead of pretending to work.

import type { RemoteClient } from "./remote-client";

const notConnected = () =>
  Promise.reject(new Error("MCP mode is not connected in this runtime. Relay is running in Demo mode with simulated data."));

export class McpRemoteClient implements RemoteClient {
  readonly mode = "mcp" as const;
  getCurrentUser = notConnected;
  listEmployments = notConnected;
  getEmployment = notConnected;
  createEmployment = notConnected;
  updateEmployment = notConnected;
  listLegalEntities = notConnected;
  listCountries = notConnected;
  createIncentive = notConnected;
  listReports = notConnected;
}
