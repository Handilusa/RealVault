const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConfidentialPiggyBank (Phase 0 Sanity Test)", function () {
  it("Should deploy and set the correct owner", async function () {
    const [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ConfidentialPiggyBank");
    const piggyBank = await Factory.deploy();
    await piggyBank.waitForDeployment();

    expect(await piggyBank.owner()).to.equal(owner.address);
  });
});
