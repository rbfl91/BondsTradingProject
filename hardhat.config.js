import hardhatToolboxViem from "@nomicfoundation/hardhat-toolbox-viem";

/**
 * Hardhat 3 configuration (replaces truffle-config.js).
 *
 * - Tests run on the built-in `hardhat` network (in-process, deterministic
 *   accounts, time manipulation available via networkHelpers).
 * - `development` targets a local node on 8545 (started with `npx hardhat node`)
 *   for deploys: `npm run deploy`.
 */
export default {
  plugins: [hardhatToolboxViem],
  solidity: {
    version: "0.8.21", // must match pragma in contracts/*.sol
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      type: "edr-simulated",
    },
    development: {
      type: "http",
      url: process.env.WEB3_PROVIDER ?? "http://127.0.0.1:8545",
    },
  },
};
