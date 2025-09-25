import { artifacts, ethers } from "hardhat";
import { expect } from "chai";

/**
 * ABI-surface scaffold: proves Hardhat + Ethers bindings are alive
 * and the CollateralReservationsFacet exposes the functions we need.
 * This avoids requiring hardhat-deploy / live instances.
 */
describe("Sanity: ABI surface for reserveCollateral flow", function () {
  it("exposes reserveCollateral & collateralReservationFee on CollateralReservationsFacet", async function () {
    // Prove ethers bindings work
    const signers = await ethers.getSigners();
    expect(signers.length).to.be.greaterThan(0);

    // Load ABIs directly from artifacts
    const crArtifact = await artifacts.readArtifact("CollateralReservationsFacet");
    const amArtifact = await artifacts.readArtifact("IAssetManager"); // interface is enough for ABI names

    // Extract function names from ABIs
    const crAbiNames = new Set(crArtifact.abi.map((e: any) => e?.name).filter(Boolean));
    const amAbiNames = new Set(amArtifact.abi.map((e: any) => e?.name).filter(Boolean));

    // Check the exact symbols we’ll use in the PoC
    expect(crAbiNames.has("reserveCollateral")).to.eq(true);
    expect(crAbiNames.has("collateralReservationFee")).to.eq(true);

    // We'll eventually need agent info via the AssetManager interface
    expect(amAbiNames.has("collateralReservationInfo")).to.eq(true);
  });
});
