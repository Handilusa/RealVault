const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SignedNavOracleAdapter", function () {
  let adapter;
  let owner;
  let publisher;
  let nonAuthorized;
  let user;
  
  const ASSET_ID_RCREDIT = ethers.keccak256(ethers.toUtf8Bytes("rCREDIT"));
  const ASSET_ID_RUSTB = ethers.keccak256(ethers.toUtf8Bytes("rUSTB"));
  const NAV_E8 = 1023000000n; // $10.23 in 8 decimals
  const NAV_E8_UPDATED = 1025000000n; // $10.25 in 8 decimals

  beforeEach(async function () {
    [owner, publisher, nonAuthorized, user] = await ethers.getSigners();

    // Deploy SignedNavOracleAdapter
    const SignedNavOracleAdapter = await ethers.getContractFactory("SignedNavOracleAdapter");
    adapter = await SignedNavOracleAdapter.deploy(owner.address);
    await adapter.waitForDeployment();
  });

  /**
   * Helper function to create ECDSA signature for NAV submission
   * Implements the signature scheme from the contract:
   * messageHash = keccak256(abi.encodePacked(assetId, navE8, publishedAt, validUntil, nonce))
   * ethSignedMessageHash = "\x19Ethereum Signed Message:\n32" + messageHash
   * signature = sign(ethSignedMessageHash)
   */
  async function signNavSubmission(signer, assetId, navE8, publishedAt, validUntil, nonce) {
    // Create message hash using abi.encodePacked equivalent
    const messageHash = ethers.solidityPackedKeccak256(
      ["bytes32", "uint256", "uint256", "uint256", "uint256"],
      [assetId, navE8, publishedAt, validUntil, nonce]
    );

    // Sign the message hash (ethers.js automatically adds Ethereum signed message prefix)
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    
    return signature;
  }

  describe("Deployment", function () {
    it("should set the correct owner", async function () {
      expect(await adapter.owner()).to.equal(owner.address);
    });
  });

  describe("setAuthorizedPublisher (Task 4.1 - Requirement 5.1)", function () {
    it("should allow owner to set authorized publisher", async function () {
      await expect(
        adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address)
      )
        .to.emit(adapter, "PublisherConfigured")
        .withArgs(ASSET_ID_RCREDIT, publisher.address);

      expect(await adapter.getAuthorizedPublisher(ASSET_ID_RCREDIT)).to.equal(publisher.address);
    });

    it("should revert when non-owner tries to set publisher", async function () {
      await expect(
        adapter.connect(nonAuthorized).setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address)
      ).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    });

    it("should revert when publisher address is zero", async function () {
      await expect(
        adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(adapter, "InvalidPublisherAddress");
    });

    it("should allow updating existing publisher", async function () {
      // Set initial publisher
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);
      
      // Update to new publisher
      await expect(
        adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, nonAuthorized.address)
      )
        .to.emit(adapter, "PublisherConfigured")
        .withArgs(ASSET_ID_RCREDIT, nonAuthorized.address);

      expect(await adapter.getAuthorizedPublisher(ASSET_ID_RCREDIT)).to.equal(nonAuthorized.address);
    });
  });

  describe("submitNav - Valid Submission (Task 4.2 - Requirements 5.4, 5.5)", function () {
    let publishedAt;
    let validUntil;
    const nonce = 1n;

    beforeEach(async function () {
      // Configure publisher
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);
      
      // Set time window
      publishedAt = await time.latest();
      validUntil = publishedAt + 86400; // Valid for 24 hours
    });

    it("should accept valid signed NAV submission", async function () {
      // Create valid signature
      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        nonce
      );

      // Submit NAV
      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, signature)
      )
        .to.emit(adapter, "NavSubmitted")
        .withArgs(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, publisher.address);

      // Verify storage updates
      const latestNav = await adapter.getLatestNav(ASSET_ID_RCREDIT);
      expect(latestNav.navE8).to.equal(NAV_E8);
      expect(latestNav.publishedAt).to.equal(publishedAt);
      expect(latestNav.validUntil).to.equal(validUntil);
      expect(latestNav.nonce).to.equal(nonce);
      expect(latestNav.signature).to.equal(signature);

      expect(await adapter.getLastNonce(ASSET_ID_RCREDIT)).to.equal(nonce);
    });

    it("should accept multiple submissions with increasing nonces", async function () {
      // First submission (nonce = 1)
      let signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature);

      // Second submission (nonce = 2)
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8_UPDATED,
        publishedAt,
        validUntil,
        2n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8_UPDATED, publishedAt, validUntil, 2n, signature);

      // Verify latest NAV is updated
      const latestNav = await adapter.getLatestNav(ASSET_ID_RCREDIT);
      expect(latestNav.navE8).to.equal(NAV_E8_UPDATED);
      expect(latestNav.nonce).to.equal(2n);
      expect(await adapter.getLastNonce(ASSET_ID_RCREDIT)).to.equal(2n);
    });

    it("should allow non-consecutive nonces", async function () {
      // First submission (nonce = 1)
      let signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature);

      // Second submission (nonce = 5, skipping 2, 3, 4)
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8_UPDATED,
        publishedAt,
        validUntil,
        5n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8_UPDATED, publishedAt, validUntil, 5n, signature);

      expect(await adapter.getLastNonce(ASSET_ID_RCREDIT)).to.equal(5n);
    });
  });

  describe("submitNav - Invalid Submissions (Task 4.2 - Requirements 5.4, 5.5)", function () {
    let publishedAt;
    let validUntil;

    beforeEach(async function () {
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);
      publishedAt = await time.latest();
      validUntil = publishedAt + 86400;
    });

    it("should revert when publisher not configured", async function () {
      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RUSTB, // Different asset with no publisher
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );

      await expect(
        adapter.submitNav(ASSET_ID_RUSTB, NAV_E8, publishedAt, validUntil, 1n, signature)
      ).to.be.revertedWithCustomError(adapter, "PublisherNotConfigured");
    });

    it("should revert when nonce is not greater than lastNonce", async function () {
      // Submit first NAV with nonce = 5
      let signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        5n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 5n, signature);

      // Try to submit with nonce = 3 (less than last nonce)
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        3n
      );

      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 3n, signature)
      ).to.be.revertedWithCustomError(adapter, "InvalidNonce");
    });

    it("should revert when nonce equals lastNonce", async function () {
      // Submit first NAV with nonce = 1
      let signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature);

      // Try to submit again with nonce = 1 (equal to last nonce)
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );

      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature)
      ).to.be.revertedWithCustomError(adapter, "InvalidNonce");
    });

    it("should revert when signature is from unauthorized signer", async function () {
      // Sign with non-authorized account instead of publisher
      const signature = await signNavSubmission(
        nonAuthorized,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );

      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature)
      ).to.be.revertedWithCustomError(adapter, "InvalidSignature");
    });

    it("should revert when signature is invalid", async function () {
      // Create valid signature
      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );

      // Tamper with the NAV value (signature won't match)
      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8_UPDATED, publishedAt, validUntil, 1n, signature)
      ).to.be.revertedWithCustomError(adapter, "InvalidSignature");
    });
  });

  describe("latestPrice - Time Window Validation (Task 4.3 - Requirements 5.2, 5.3)", function () {
    const nonce = 1n;

    beforeEach(async function () {
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);
    });

    it("should return settlementEnabled=true when within time window", async function () {
      const publishedAt = await time.latest();
      const validUntil = publishedAt + 3600; // Valid for 1 hour

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        nonce
      );

      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, signature);

      // Advance time to middle of validity window
      await time.increaseTo(publishedAt + 1800);

      const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RCREDIT);
      expect(priceE8).to.equal(NAV_E8);
      expect(settlementEnabled).to.be.true;
    });

    it("should return settlementEnabled=false when before publishedAt", async function () {
      const currentTime = await time.latest();
      const publishedAt = currentTime + 3600; // Publish in 1 hour
      const validUntil = publishedAt + 3600;

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        nonce
      );

      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, signature);

      // Current time is before publishedAt
      const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RCREDIT);
      expect(priceE8).to.equal(NAV_E8);
      expect(settlementEnabled).to.be.false;
    });

    it("should return settlementEnabled=false when after validUntil", async function () {
      const publishedAt = await time.latest();
      const validUntil = publishedAt + 3600;

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        nonce
      );

      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, signature);

      // Advance time past validUntil
      await time.increaseTo(validUntil + 1);

      const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RCREDIT);
      expect(priceE8).to.equal(NAV_E8);
      expect(settlementEnabled).to.be.false;
    });

    it("should return settlementEnabled=true at exact validUntil boundary", async function () {
      const publishedAt = await time.latest();
      const validUntil = publishedAt + 3600;

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        nonce
      );

      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, nonce, signature);

      // Advance time to exact validUntil
      await time.increaseTo(validUntil);

      const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RCREDIT);
      expect(priceE8).to.equal(NAV_E8);
      expect(settlementEnabled).to.be.true;
    });

    it("should return default values when no NAV submitted", async function () {
      const [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RCREDIT);
      expect(priceE8).to.equal(0);
      expect(settlementEnabled).to.be.false;
    });
  });

  describe("Edge Cases", function () {
    let publishedAt;
    let validUntil;

    beforeEach(async function () {
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);
      await adapter.setAuthorizedPublisher(ASSET_ID_RUSTB, publisher.address);
      publishedAt = await time.latest();
      validUntil = publishedAt + 86400;
    });

    it("should handle very large NAV values", async function () {
      const largeNav = ethers.parseUnits("999999999", 8); // Very large NAV

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        largeNav,
        publishedAt,
        validUntil,
        1n
      );

      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, largeNav, publishedAt, validUntil, 1n, signature)
      )
        .to.emit(adapter, "NavSubmitted")
        .withArgs(ASSET_ID_RCREDIT, largeNav, publishedAt, validUntil, 1n, publisher.address);

      const latestNav = await adapter.getLatestNav(ASSET_ID_RCREDIT);
      expect(latestNav.navE8).to.equal(largeNav);
    });

    it("should handle very large nonce values", async function () {
      const largeNonce = 2n ** 200n; // Very large nonce

      const signature = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        largeNonce
      );

      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, largeNonce, signature)
      )
        .to.emit(adapter, "NavSubmitted")
        .withArgs(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, largeNonce, publisher.address);

      expect(await adapter.getLastNonce(ASSET_ID_RCREDIT)).to.equal(largeNonce);
    });

    it("should handle multiple assets with different publishers", async function () {
      // Configure different publisher for RUSTB
      await adapter.setAuthorizedPublisher(ASSET_ID_RUSTB, nonAuthorized.address);

      // Submit NAV for rCREDIT with publisher
      const signature1 = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature1);

      // Submit NAV for rUSTB with nonAuthorized
      const signature2 = await signNavSubmission(
        nonAuthorized,
        ASSET_ID_RUSTB,
        NAV_E8_UPDATED,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RUSTB, NAV_E8_UPDATED, publishedAt, validUntil, 1n, signature2);

      // Verify both assets have correct NAVs
      const nav1 = await adapter.getLatestNav(ASSET_ID_RCREDIT);
      expect(nav1.navE8).to.equal(NAV_E8);

      const nav2 = await adapter.getLatestNav(ASSET_ID_RUSTB);
      expect(nav2.navE8).to.equal(NAV_E8_UPDATED);
    });
  });

  describe("Integration Scenarios", function () {
    it("should simulate realistic rUSTB NAV update flow", async function () {
      // Configure publisher for rUSTB
      await adapter.setAuthorizedPublisher(ASSET_ID_RUSTB, publisher.address);

      // Day 1: Initial NAV submission
      let publishedAt = await time.latest();
      let validUntil = publishedAt + 86400; // 24 hours
      let signature = await signNavSubmission(
        publisher,
        ASSET_ID_RUSTB,
        100000000n, // $1.00
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RUSTB, 100000000n, publishedAt, validUntil, 1n, signature);

      // Verify settlement is enabled
      let [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RUSTB);
      expect(priceE8).to.equal(100000000n);
      expect(settlementEnabled).to.be.true;

      // Day 2: NAV increases
      await time.increase(86400); // Advance 24 hours
      publishedAt = await time.latest();
      validUntil = publishedAt + 86400;
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RUSTB,
        101000000n, // $1.01 (1% increase)
        publishedAt,
        validUntil,
        2n
      );
      await adapter.submitNav(ASSET_ID_RUSTB, 101000000n, publishedAt, validUntil, 2n, signature);

      [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RUSTB);
      expect(priceE8).to.equal(101000000n);
      expect(settlementEnabled).to.be.true;

      // Day 3: NAV continues to increase
      await time.increase(86400);
      publishedAt = await time.latest();
      validUntil = publishedAt + 86400;
      signature = await signNavSubmission(
        publisher,
        ASSET_ID_RUSTB,
        102000000n, // $1.02
        publishedAt,
        validUntil,
        3n
      );
      await adapter.submitNav(ASSET_ID_RUSTB, 102000000n, publishedAt, validUntil, 3n, signature);

      [priceE8, updatedAt, sourceId, confidence, settlementEnabled] = await adapter.latestPrice(ASSET_ID_RUSTB);
      expect(priceE8).to.equal(102000000n);
      expect(settlementEnabled).to.be.true;
      expect(await adapter.getLastNonce(ASSET_ID_RUSTB)).to.equal(3n);
    });

    it("should prevent replay attack via nonce", async function () {
      await adapter.setAuthorizedPublisher(ASSET_ID_RCREDIT, publisher.address);

      const publishedAt = await time.latest();
      const validUntil = publishedAt + 86400;

      // Submit first NAV with nonce = 1
      const signature1 = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8,
        publishedAt,
        validUntil,
        1n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature1);

      // Submit second NAV with nonce = 2
      const signature2 = await signNavSubmission(
        publisher,
        ASSET_ID_RCREDIT,
        NAV_E8_UPDATED,
        publishedAt,
        validUntil,
        2n
      );
      await adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8_UPDATED, publishedAt, validUntil, 2n, signature2);

      // Attempt to replay first submission (nonce = 1)
      await expect(
        adapter.submitNav(ASSET_ID_RCREDIT, NAV_E8, publishedAt, validUntil, 1n, signature1)
      ).to.be.revertedWithCustomError(adapter, "InvalidNonce");

      // Verify latest NAV is still the second submission
      const latestNav = await adapter.getLatestNav(ASSET_ID_RCREDIT);
      expect(latestNav.navE8).to.equal(NAV_E8_UPDATED);
      expect(latestNav.nonce).to.equal(2n);
    });
  });
});
