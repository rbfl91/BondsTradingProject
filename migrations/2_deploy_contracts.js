const BondTrading = artifacts.require("BondTrading");
const BondToken = artifacts.require("BondToken");

module.exports = async function (deployer, network, accounts) {
  // Use the first account from the current network as the owner
  const owner = accounts[0];

  // Deploy BondToken contract first
  await deployer.deploy(BondToken, "RedbellyBond", "RBB", owner);
  const bondTokenInstance = await BondToken.deployed();

  // Deploy BondTrading contract with the BondToken address and initial owner
  await deployer.deploy(BondTrading, bondTokenInstance.address, owner);
};
