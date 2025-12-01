const BondTrading = artifacts.require("BondTrading");
const BondToken = artifacts.require("BondToken");

module.exports = function (deployer) {
  // Deploy BondToken contract first
  deployer.deploy(BondToken, "RedbellyBond", "RBB", "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1").then(function() {
    // Get the deployed BondToken instance
    return BondToken.deployed();
  }).then(function(bondTokenInstance) {
    // Deploy BondTrading contract with the BondToken address and initial owner
    return deployer.deploy(BondTrading, bondTokenInstance.address, "0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1");
  });
};
