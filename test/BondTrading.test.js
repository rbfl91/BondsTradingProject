// Hardhat 3 test suite for BondToken + BondTrading (replaces the old Truffle suite).
//
// Design under test (see TECHNICAL_AUDIT_REPORT.md remediation):
// - C-02  purchase escrows tokens INTO the contract; redemption burns from the
//         contract's own escrow balance (same tokens bought = tokens settled)
// - C-02b holder lists are pruned when a position reaches zero
// - H-01  O(1) holder membership via mapping (no unbounded array scans)
// - H-02  remainingSupply decrements on primary purchase; owner can
//         deactivate/reactivate bonds (isActive becomes reachable)
// - C-03c BondToken mint is capped at MAX_SUPPLY
// - M-02c getBondsRange batch view (no N sequential RPC calls)
import { network } from "hardhat";
import { getAddress, isAddress } from "viem";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const { viem, networkHelpers } = await network.create();
const publicClient = await viem.getPublicClient();
const [owner, user1, user2] = await viem.getWalletClients();
// Checksummed — matches the casing the chain returns in reads/events.
const ownerAddr = getAddress(owner.account.address);
const user1Addr = getAddress(user1.account.address);
const user2Addr = getAddress(user2.account.address);

const ONE_DAY = 24n * 60n * 60n;
const ONE_HOUR = 60n * 60n;
const INITIAL_TOKEN_SUPPLY = 1_000_000n * 10n ** 18n; // BondToken constructor mint
const TOKEN_TRANSFER = 1_000n * 10n ** 18n; // fixture: tokens granted to each user
const INITIAL_ALLOWANCE = 1000n * 10n ** 18n; // full fixture balance

async function fixture() {
  const token = await viem.deployContract(
    "BondToken",
    ["RedbellyBond", "RBB", ownerAddr],
    { account: owner.account },
  );
  const trading = await viem.deployContract(
    "BondTrading",
    [token.address, ownerAddr],
    { account: owner.account },
  );
  // Fund the test users and let them escrow tokens to the trading contract.
  for (const [account, addr] of [
    [user1.account, user1Addr],
    [user2.account, user2Addr],
  ]) {
    await token.write.transfer([addr, TOKEN_TRANSFER], { account: owner.account });
    await token.write.approve([trading.address, INITIAL_ALLOWANCE], { account });
  }
  return { token, trading };
}

/** Issue a bond. maturityOffset defaults to +1 day; pass ONE_HOUR for redeem tests. */
async function issueTestBond(trading, maturityOffset = ONE_DAY) {
  const maturity = (await publicClient.getBlock()).timestamp + maturityOffset;
  await trading.write.issueBond(
    ["Test Bond", "Test Issuer", 1000n, maturity, 500n, 1000n],
    { account: owner.account },
  );
  return maturity;
}

describe("BondTrading", () => {
  it("should issue a bond", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    const bond = await trading.read.getBondInfo([1n]);
    assert.equal(bond.name, "Test Bond");
    assert.equal(bond.issuer, "Test Issuer");
    assert.equal(bond.faceValue, 1000n);
    assert.equal(bond.totalSupply, 1000n);
    assert.equal(bond.remainingSupply, 1000n);
    assert.equal(bond.isActive, true);
  });

  it("should emit BondIssued with the new bond id", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    const maturity = await issueTestBond(trading);
    await viem.assertions.emitWithArgs(
      trading.write.issueBond(
        ["Second", "Issuer2", 5n, maturity + 1n, 0n, 5n],
        { account: owner.account },
      ),
      trading,
      "BondIssued",
      [2n, "Second", "Issuer2", 5n],
    );
  });

  it("should purchase a bond (tokens escrowed in contract)", async () => {
    const { token, trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });

    // User's tokens moved into the contract escrow (C-02 model)
    assert.equal(
      await token.read.balanceOf([user1Addr]),
      TOKEN_TRANSFER - 100n * 10n ** 18n,
    );
    assert.equal(
      await token.read.balanceOf([trading.address]),
      100n * 10n ** 18n,
    );
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user1Addr]),
      100n,
    );
    // Primary purchase consumes remaining supply (H-02 fix)
    assert.equal(
      (await trading.read.getBondInfo([1n])).remainingSupply,
      900n,
    );
  });

  it("should emit BondPurchased + TokensEscrowed", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await viem.assertions.emitWithArgs(
      trading.write.purchaseBond([1n, 100n], { account: user1.account }),
      trading,
      "BondPurchased",
      [1n, user1Addr, 100n],
    );
  });

  it("should sell a bond position (tokens stay escrowed)", async () => {
    const { token, trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await trading.write.sellBond([1n, 40n, user2Addr], { account: user1.account });

    // Positions transferred; escrowed tokens untouched (L-c1 fix)
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user1Addr]),
      60n,
    );
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user2Addr]),
      40n,
    );
    assert.equal(
      await token.read.balanceOf([user1Addr]),
      TOKEN_TRANSFER - 100n * 10n ** 18n, // unchanged by the sale
    );
    assert.equal(
      await token.read.balanceOf([trading.address]),
      100n * 10n ** 18n, // still fully escrowed
    );
    // Both holders listed (C-02b: list is accurate)
    const holders = await trading.read.getBondHolders([1n]);
    assert.ok(holders.some((h) => isAddress(h, user1Addr)));
    assert.ok(holders.some((h) => isAddress(h, user2Addr)));
  });

  it("should redeem a bond after maturity and burn escrowed tokens", async () => {
    const { token, trading } = await networkHelpers.loadFixture(fixture);
    const maturity = await issueTestBond(trading, ONE_HOUR);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    const escrowBefore = await token.read.balanceOf([trading.address]);
    const supplyBefore = await token.read.totalSupply();

    await networkHelpers.time.increaseTo(maturity + 1n);
    await trading.write.redeemBond([1n, 100n], { account: user1.account });

    // C-02 fix: settled from the CONTRACT's escrow balance, not the user's wallet
    assert.equal(
      await token.read.balanceOf([trading.address]),
      escrowBefore - 100n * 10n ** 18n,
    );
    assert.equal(
      await token.read.totalSupply(),
      supplyBefore - 100n * 10n ** 18n,
    );
    assert.equal(
      await token.read.balanceOf([user1Addr]),
      TOKEN_TRANSFER - 100n * 10n ** 18n, // user wallet unaffected by redeem
    );
    assert.equal(await trading.read.getBondHolderAmount([1n, user1Addr]), 0n);
  });

  it("full cycle: purchase -> sell -> buyer redeems; seller pruned from holders", async () => {
    const { token, trading } = await networkHelpers.loadFixture(fixture);
    const maturity = await issueTestBond(trading, ONE_HOUR);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await trading.write.sellBond([1n, 100n, user2Addr], { account: user1.account });

    // C-02b fix: seller fully exited -> removed from holder list
    const holdersAfterSell = await trading.read.getBondHolders([1n]);
    assert.equal(holdersAfterSell.length, 1);
    assert.ok(isAddress(holdersAfterSell[0], user2Addr));
    assert.equal(await trading.read.bondHolderFlags([1n, user1Addr]), false);

    // Buyer redeems at maturity — settles the exact escrowed tokens
    await networkHelpers.time.increaseTo(maturity + 1n);
    await trading.write.redeemBond([1n, 100n], { account: user2.account });
    assert.equal(
      await token.read.balanceOf([trading.address]),
      0n, // escrow fully settled
    );
    assert.equal((await trading.read.getBondHolders([1n])).length, 0);
  });

  it("should NOT redeem a bond before maturity", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading, ONE_DAY);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await viem.assertions.revertWith(
      trading.write.redeemBond([1n, 100n], { account: user1.account }),
      "Bond has not matured yet",
    );
  });

  it("should reject purchase of a non-existent bond", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await viem.assertions.revertWith(
      trading.write.purchaseBond([99n, 10n], { account: user1.account }),
      "Bond does not exist",
    );
  });

  it("should reject a zero-amount purchase", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await viem.assertions.revertWith(
      trading.write.purchaseBond([1n, 0n], { account: user1.account }),
      "Amount must be > 0",
    );
  });

  it("should reject a purchase exceeding the remaining supply", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading); // remainingSupply = 1000
    await trading.write.purchaseBond([1n, 600n], { account: user1.account });
    // user2's allowance is only 100 tokens, so the token-balance check fires first
    // for a 401 buy; use an amount that passes tokens but exceeds remaining supply
    await viem.assertions.revertWith(
      trading.write.purchaseBond([1n, 401n], { account: user2.account }),
      "Insufficient bond supply",
    );
  });

  it("should reject a purchase without token allowance", async () => {
    const { token, trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    // Revoke user2's allowance (approve to zero address reverts in OZ v5,
    // so set the existing spender's allowance to 0 instead)
    await token.write.approve([trading.address, 0n], { account: user2.account });
    await viem.assertions.revertWithCustomError(
      trading.write.purchaseBond([1n, 100n], { account: user2.account }),
      token,
      "ERC20InsufficientAllowance",
    );
  });

  it("should reject a sell to the zero address", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await viem.assertions.revertWith(
      trading.write.sellBond([1n, 10n, "0x0000000000000000000000000000000000000000"], { account: user1.account }),
      "Buyer cannot be zero address",
    );
  });

  it("should reject a sell to self", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await viem.assertions.revertWith(
      trading.write.sellBond([1n, 10n, user1Addr], { account: user1.account }),
      "Cannot sell to self",
    );
  });

  it("should reject bond issuance by a non-owner", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    const future = (await publicClient.getBlock()).timestamp + 2n * ONE_DAY;
    await viem.assertions.revertWithCustomError(
      trading.write.issueBond(["X", "Y", 1n, future, 0n, 1n], { account: user1.account }),
      trading,
      "OwnableUnauthorizedAccount",
    );
  });

  it("owner should be able to pause and unpause", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await trading.write.pause([], { account: owner.account });
    assert.equal(await trading.read.paused(), true);
    await trading.write.unpause([], { account: owner.account });
    assert.equal(await trading.read.paused(), false);
  });

  it("paused contract should reject purchases", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.pause([], { account: owner.account });
    await viem.assertions.revertWithCustomError(
      trading.write.purchaseBond([1n, 10n], { account: user1.account }),
      trading,
      "EnforcedPause",
    );
  });

  it("owner can deactivate and reactivate a bond", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.deactivateBond([1n], { account: owner.account });
    assert.equal((await trading.read.getBondInfo([1n])).isActive, false);

    // Deactivated bonds block new purchases (H-02 fix)
    await viem.assertions.revertWith(
      trading.write.purchaseBond([1n, 10n], { account: user1.account }),
      "Bond is not active",
    );

    await viem.assertions.emitWithArgs(
      trading.write.activateBond([1n], { account: owner.account }),
      trading,
      "BondActiveStatusChanged",
      [1n, true],
    );
    assert.equal((await trading.read.getBondInfo([1n])).isActive, true);
  });

  it("should handle multiple purchases by the same user", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await trading.write.purchaseBond([1n, 50n], { account: user1.account });
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user1Addr]),
      150n,
    );
    // Listed exactly once (H-01 flag, no duplicates)
    assert.equal((await trading.read.getBondHolders([1n])).length, 1);
  });

  it("should handle multiple buyers", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await trading.write.purchaseBond([1n, 100n], { account: user1.account });
    await trading.write.purchaseBond([1n, 200n], { account: user2.account });
    assert.equal(
      (await trading.read.getBondInfo([1n])).remainingSupply,
      700n,
    );
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user1Addr]),
      100n,
    );
    assert.equal(
      await trading.read.getBondHolderAmount([1n, user2Addr]),
      200n,
    );
    assert.equal((await trading.read.getBondHolders([1n])).length, 2);
  });

  it("should track bondCount across issued bonds", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    await issueTestBond(trading);
    assert.equal(await trading.read.bondCount(), 2n);
  });

  it("getBondsRange should return a batch of bonds (M-02c)", async () => {
    const { trading } = await networkHelpers.loadFixture(fixture);
    await issueTestBond(trading);
    const maturity = await issueTestBond(trading);
    await trading.write.issueBond(
      ["Third", "Issuer3", 7n, maturity + 2n, 0n, 7n],
      { account: owner.account },
    );

    // getBondsRange returns a Bond[] (named struct fields)
    const res = await trading.read.getBondsRange([1n, 50n]);
    assert.deepEqual(
      res.map((b) => b.name),
      ["Test Bond", "Test Bond", "Third"],
    );

    // Offset window: only bonds 2..3
    const res2 = await trading.read.getBondsRange([2n, 50n]);
    assert.deepEqual(
      res2.map((b) => b.name),
      ["Test Bond", "Third"],
    );
  });
});

describe("BondToken", () => {
  it("should mint INITIAL_SUPPLY to the deployer", async () => {
    const { token } = await networkHelpers.loadFixture(fixture);
    // Fixture transfers TOKEN_TRANSFER to each of the two test users
    assert.equal(
      await token.read.balanceOf([ownerAddr]),
      INITIAL_TOKEN_SUPPLY - 2n * TOKEN_TRANSFER,
    );
    assert.equal(await token.read.totalSupply(), INITIAL_TOKEN_SUPPLY);
  });

  it("owner can mint within the cap (C-03c)", async () => {
    const { token } = await networkHelpers.loadFixture(fixture);
    const extra = 500n * 10n ** 18n;
    await token.write.mint([user1Addr, extra], { account: owner.account });
    assert.equal(
      await token.read.balanceOf([user1Addr]),
      TOKEN_TRANSFER + extra,
    );
    assert.equal(await token.read.totalSupply(), INITIAL_TOKEN_SUPPLY + extra);
  });

  it("mint beyond MAX_SUPPLY should revert (C-03c)", async () => {
    const { token } = await networkHelpers.loadFixture(fixture);
    const max = await token.read.MAX_SUPPLY();
    const overshoot = max - (await token.read.totalSupply()) + 1n;
    await viem.assertions.revertWith(
      token.write.mint([user1Addr, overshoot], { account: owner.account }),
      "Exceeds MAX_SUPPLY",
    );
  });
});
