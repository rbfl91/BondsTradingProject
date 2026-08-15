/**
 * Deploys BondToken, then BondTrading (replaces Truffle migration
 * migrations/2_deploy_contracts.js).
 *
 * Usage:
 *   Built-in Hardhat network (throwaway):  npx hardhat run scripts/deploy.js
 *   Local node on 8545 (`npx hardhat node`):
 *       npx hardhat run scripts/deploy.js --network development
 *     Requires PRIVATE_KEY of an account on that node, e.g. the
 *     deterministic first account of `npx hardhat node`:
 *       PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
 *
 * Prints the BondTrading address for the API's .env (CONTRACT_ADDRESS).
 */
import { network } from "hardhat";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";

const { viem } = await network.create();

// Signer: first provisioned wallet client (built-in network) or the
// PRIVATE_KEY env var (external nodes where the node owns the keys).
const [wallet] = await viem.getWalletClients();
const from =
  wallet?.account ??
  (process.env.PRIVATE_KEY
    ? privateKeyToAccount(process.env.PRIVATE_KEY)
    : undefined);

if (!from) {
  console.error(
    "No deployer account available. Start a local node (npx hardhat node) " +
      "and set PRIVATE_KEY, or run on the built-in network.",
  );
  process.exit(1);
}
const ownerAddr = from.address;

const bondToken = await viem.deployContract(
  "BondToken",
  ["RedbellyBond", "RBB", ownerAddr],
  { account: from },
);
// Checksummed so values can be pasted straight into .env (web3 v7
// rejects non-checksummed addresses)
console.log(`BondToken:  ${getAddress(bondToken.address)}`);

const bondTrading = await viem.deployContract(
  "BondTrading",
  [bondToken.address, ownerAddr],
  { account: from },
);
console.log(`BondTrading: ${getAddress(bondTrading.address)}`);

console.log("\nAdd to .env:");
console.log(`CONTRACT_ADDRESS=${getAddress(bondTrading.address)}`);
