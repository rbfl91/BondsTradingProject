const BondTrading = artifacts.require("BondTrading");
const BondToken = artifacts.require("BondToken");

contract("BondTrading", (accounts) => {
  const [owner, user1, user2] = accounts;

  beforeEach(async () => {
    // Deploy the BondToken contract first
    this.bondToken = await BondToken.new("RedbellyBond", "RBB", owner);
    
    // Deploy the BondTrading contract with the BondToken address and owner
    this.bondTrading = await BondTrading.new(this.bondToken.address, owner);
    
    // Mint additional tokens to users so they can purchase bonds
    await this.bondToken.mint(user1, 10000, { from: owner });
    await this.bondToken.mint(user2, 10000, { from: owner });
    
    // Approve the BondTrading contract to spend tokens on behalf of users
    await this.bondToken.approve(this.bondTrading.address, 10000, { from: user1 });
    await this.bondToken.approve(this.bondTrading.address, 10000, { from: user2 });
  });

  it("should issue a new bond", async () => {
    const name = "Test Bond";
    const issuer = "Test Issuer";
    const faceValue = 1000;
    const maturityDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
    const interestRate = 500; // 5%
    const supply = 1000;

    await this.bondTrading.issueBond(name, issuer, faceValue, maturityDate, interestRate, supply, { from: owner });

    const bond = await this.bondTrading.getBondInfo(1);
    assert.equal(bond.name, name);
    assert.equal(bond.issuer, issuer);
    assert.equal(bond.faceValue, faceValue);
    assert.equal(bond.interestRate, interestRate);
    assert.equal(bond.totalSupply, supply);
    assert.equal(bond.isActive, true);
  });

  it("should purchase a bond", async () => {
    const name = "Test Bond";
    const issuer = "Test Issuer";
    const faceValue = 1000;
    const maturityDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
    const interestRate = 500; // 5%
    const supply = 1000;

    await this.bondTrading.issueBond(name, issuer, faceValue, maturityDate, interestRate, supply, { from: owner });
    
    // Purchase the bond
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });

    const holders = await this.bondTrading.getBondHolders(1);
    assert.equal(holders.length, 1);
    assert.equal(holders[0], user1);
  });

  it("should sell a bond", async () => {
    const name = "Test Bond";
    const issuer = "Test Issuer";
    const faceValue = 1000;
    const maturityDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
    const interestRate = 500; // 5%
    const supply = 1000;

    await this.bondTrading.issueBond(name, issuer, faceValue, maturityDate, interestRate, supply, { from: owner });
    
    // Purchase the bond
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    
    // Sell the bond
    await this.bondTrading.sellBond(1, 50, user2, { from: user1 });

    const holders = await this.bondTrading.getBondHolders(1);
    assert.equal(holders.length, 2);
    assert.equal(holders[0], user1);
    assert.equal(holders[1], user2);
  });
});
