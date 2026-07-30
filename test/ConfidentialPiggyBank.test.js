const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ConfidentialPiggyBank (Phase 0 Multi-User Test)", function () {
  it("Should deploy cleanly", async function () {
    const Factory = await ethers.getContractFactory("ConfidentialPiggyBank");
    const piggyBank = await Factory.deploy();
    await piggyBank.waitForDeployment();
    expect(await piggyBank.getAddress()).to.be.properAddress;
  });
});

