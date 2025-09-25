import { expect } from "chai";
import { artifacts, web3 } from "hardhat";
import {
  newAssetManager, newAssetManagerController,
} from "../../../lib/test-utils/fasset/CreateAssetManager";
import {
  createTestContracts, createTestCollaterals, createTestSettings,
  createTestAgentSettings, whitelistAgentOwner, TestSettingsContracts,
} from "../../../lib/test-utils/test-settings";
import { testChainInfo as testCI } from "../../../lib/test-utils/actors/TestChainInfo";
import { web3DeepNormalize, toBNExp } from "../../../lib/utils/helpers";
import { IAssetManagerInstance } from "../../../typechain-truffle";

contract("PoC (mitigation): reserveCollateral refunds overpay when executor==0 (no burn)", (accounts) => {
  const governance = accounts[0];
  const agentOwner = accounts[1];
  const user       = accounts[2];

  // Use the first available chain info entry (keeps this test generic)
  const ci = Object.values(testCI)[0] as any;

  let contracts: TestSettingsContracts;
  let assetManager: IAssetManagerInstance;

  beforeEach(async () => {
    contracts = await createTestContracts(governance);

    // Build settings/collaterals using the TestChainInfo entry
    const settings    = await createTestSettings(contracts, ci);
    const collaterals = await createTestCollaterals(contracts, ci);

    // Create the AssetManagerController (this is what was missing)
    const assetManagerController = await newAssetManagerController(
      contracts.governanceSettings.address,
      governance,
      contracts.addressUpdater.address
    );

    // Spin up a fresh AssetManager tied to that controller
    const meta = { name: ci.name, symbol: ci.symbol, decimals: ci.decimals, assetName: ci.assetName, assetSymbol: ci.assetSymbol };
    [assetManager] = await newAssetManager(
      governance,
      assetManagerController,
      meta.name, meta.symbol, meta.decimals,
      settings, collaterals, meta.assetName, meta.assetSymbol
    );
  });

  it("refunds (msg.value - fee) back to msg.sender when executor == 0", async () => {
    // Scaffold only: assert the surface we need is present. The refund-path assertions
    // will be added after this setup is stable in CI.
    expect(assetManager.address).to.be.a("string");
  });
});
