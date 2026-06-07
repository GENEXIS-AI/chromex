/**
 * Purpose: structural dependency-direction rules for the external/chromex pilot.
 * Dependencies: dependency-cruiser via npm script.
 * Owner: codex
 */

module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "shared-no-app-layer",
      severity: "error",
      from: { path: "^packages/shared/src" },
      to: { path: "^packages/(bridge|extension|native-host)/src" },
    },
    {
      name: "bridge-no-extension-or-native-host",
      severity: "error",
      from: { path: "^packages/bridge/src" },
      to: { path: "^packages/(extension|native-host)/src" },
    },
    {
      name: "extension-no-bridge-or-native-host",
      severity: "error",
      from: { path: "^packages/extension/src" },
      to: { path: "^packages/(bridge|native-host)/src" },
    },
    {
      name: "native-host-no-extension",
      severity: "error",
      from: { path: "^packages/native-host/src" },
      to: { path: "^packages/extension/src" },
    },
    {
      name: "src-no-test-imports",
      severity: "error",
      from: { path: "^packages/.+/src" },
      to: { path: "^packages/.+/test" },
    },
  ],
  options: {
    doNotFollow: {
      path: "(^|/)node_modules/",
    },
    exclude: {
      path: "(^|/)(dist|coverage|output)/",
    },
    tsConfig: {
      fileName: "tsconfig.base.json",
    },
  },
};
