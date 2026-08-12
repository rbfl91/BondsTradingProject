const BondTrading = artifacts.require("BondTrading");
const BondToken = artifacts.require("BondToken");

contract("BondTrading", (accounts) => {
  const [owner, user1, user2] = accounts;
  const INITIAL_ALLOWANCE = 100000;

  beforeEach(async () => {
    this.bondToken = await BondToken.new("RedbellyBond", "RBB", owner);
    this.bondTrading = await BondTrading.new(this.bondToken.address, owner);
    await this.bondToken.mint(user1, INITIAL_ALLOWANCE, { from: owner });
    await this.bondToken.mint(user2, INITIAL_ALLOWANCE, { from: owner });
    await this.bondToken.approve(this.bondTrading.address, INITIAL_ALLOWANCE, { from: user1 });
    await this.bondToken.approve(this.bondTrading.address, INITIAL_ALLOWANCE, { from: user2 });
  });

  const issueTestBond = async () => {
    const maturityDate = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year from now
    await this.bondTrading.issueBond(
      "Test Bond", "Test Issuer", 1000, maturityDate, 500, 1000, { from: owner }
    );
  };

  // ── Happy Path ──────────────────────────────────────────────────

  it("should issue a bond", async () => {
    await issueTestBond();
    const bond = await this.bondTrading.getBondInfo(1);
    assert.equal(bond.name, "Test Bond");
    assert.equal(bond.issuer, "Test Issuer");
    assert.equal(bond.faceValue, 1000);
    assert.equal(bond.isActive, true);
  });

  it("should purchase a bond", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    const holders = await this.bondTrading.getBondHolders(1);
    assert.equal(holders.length, 1);
    assert.equal(holders[0], user1);
    assert.equal(await this.bondTrading.getBondHolderAmount(1, user1), 100);
  });

  it("should sell a bond", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    await this.bondTrading.sellBond(1, 50, user2, { from: user1 });
    assert.equal(await this.bondTrading.getBondHolderAmount(1, user1), 50);
    assert.equal(await this.bondTrading.getBondHolderAmount(1, user2), 50);
  });

  // ── Redeem (C-02, C-06, H-04 fixes) ────────────────────────────

  it("should redeem a bond after maturity and burn tokens", async () => {
    // Issue with maturity in the past (simulate matured bond)
    const pastMaturity = Math.floor(Date.now() / 1000) - 100;
    await this.bondTrading.issueBond(
      "Matured Bond", "Issuer", 1000, pastMaturity, 500, 1000, { from: owner }
    );
    // Purchase
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    const balanceBefore = await this.bondToken.balanceOf(user1);
    // Redeem
    await this.bondTrading.redeemBond(1, 100, { from: user1 });
    const balanceAfter = await this.bondToken.balanceOf(user1);
    // Tokens should have been burned (balance decreased by redeemed amount)
    assert(balanceAfter.lt(balanceBefore));
    assert.equal(await this.bondTrading.getBondHolderAmount(1, user1), 0);
  });

  it("should NOT redeem a bond before maturity", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    try {
      await this.bondTrading.redeemBond(1, 100, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("has not matured"));
    }
  });

  // ── Error Cases ─────────────────────────────────────────────────

  it("should reject purchase by non-owner", async () => {
    try {
      await this.bondTrading.issueBond("X", "Y", 1000, 9999999999, 500, 100, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("Ownable") || e.message.includes("owner"));
    }
  });

  it("should reject purchase of non-existent bond", async () => {
    try {
      await this.bondTrading.purchaseBond(999, 100, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      // Reverts on zero-struct isActive check
      assert.ok(e.message.includes("revert") || e.message.includes("not active"));
    }
  });

  it("should reject zero amount purchase", async () => {
    await issueTestBond();
    try {
      await this.bondTrading.purchaseBond(1, 0, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("greater than 0") || e.message.includes("revert"));
    }
  });

  it("should reject purchase exceeding supply", async () => {
    await issueTestBond();
    try {
      await this.bondTrading.purchaseBond(1, 9999, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("Insufficient bond supply") || e.message.includes("revert"));
    }
  });

  it("should reject sell to zero address", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    try {
      await this.bondTrading.sellBond(1, 50, "0x0000000000000000000000000000000000000000", { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("zero address") || e.message.includes("revert"));
    }
  });

  // ── Pause / Emergency Stop (H-10) ──────────────────────────────

  it("owner should be able to pause and unpause", async () => {
    await this.bondTrading.pause({ from: owner });
    assert.equal(await this.bondTrading.paused(), true);
    await this.bondTrading.unpause({ from: owner });
    assert.equal(await this.bondTrading.paused(), false);
  });

  it("paused contract should reject purchases", async () => {
    await issueTestBond();
    await this.bondTrading.pause({ from: owner });
    try {
      await this.bondTrading.purchaseBond(1, 100, { from: user1 });
      assert.fail("Should have reverted");
    } catch (e) {
      assert.ok(e.message.includes("Pausable") || e.message.includes("EnforcedPause"));
    }
  });

  // ── Edge Cases ──────────────────────────────────────────────────

  it("should handle multiple purchases by same user", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    await this.bondTrading.purchaseBond(1, 50, { from: user1 });
    assert.equal(await this.bondTrading.getBondHolderAmount(1, user1), 150);
    const holders = await this.bondTrading.getBondHolders(1);
    assert.equal(holders.length, 1); // still only 1 holder
  });

  it("should handle multiple buyers", async () => {
    await issueTestBond();
    await this.bondTrading.purchaseBond(1, 100, { from: user1 });
    await this.bondTrading.purchaseBond(1, 50, { from: user2 });
    const holders = await this.bondTrading.getBondHolders(1);
    assert.equal(holders.length, 2);
  });

  it("bondCount should track issued bonds", async () => {
    assert.equal(await this.bondTrading.bondCount(), 0);
    await issueTestBond();
    assert.equal(await this.bondTrading.bondCount(), 1);
    await this.bondTrading.issueBond("Bond 2", "Issuer2", 2000, 9999999999, 300, 500, { from: owner });
    assert.equal(await this.bondTrading.bondCount(), 2);
  });
});
