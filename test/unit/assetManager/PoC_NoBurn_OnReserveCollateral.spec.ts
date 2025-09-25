import { expect } from "chai";
import { artifacts, web3 } from "hardhat";
import {
  newAssetManager, deployAssetManagerFacets,
} from "../../../lib/test-utils/fasset/CreateAssetManager";
import {
  createTestContracts, createTestCollaterals, createTestSettings,
  createTestAgentSettings, whitelistAgentOwner, TestSettingsContracts,
  TestSettingOptions,
} from "../../../lib/test-utils/test-settings";
import { testChainInfo as ci } from "../../../lib/test-utils/actors/TestChainInfo";
import { web3DeepNormalize, toBNExp } from "../../../lib/utils/helpers";
import { IAssetManagerInstance } from "../../../typechain-truffle";

contract("PoC (mitigation): reserveCollateral refunds overpay when executor==0 (no burn)", (accounts) => {
  const governance = accounts[0];
  const agentOwner = accounts[1];
  const user       = accounts[2];
  const underlyingAgent = "agent-underlying-address-1";

  let contracts: TestSettingsContracts;
  let assetManager: IAssetManagerInstance;

  beforeEach(async () => {
    contracts = await createTestContracts(governance);

    // IMPORTANT: pass ci (TestChainInfo) as 2nd arg, options as 3rd
    const opts: Partial<TestSettingOptions> = {
      // these are numeric STRINGS where applicable
      // you can omit most since createTestSettings has sane defaults, but being explicit is fine
      collateralReservationFeeBIPS: "100",   // 1%
      mintingCapAMG: "0",                    // disabled (default), keep explicit
    };
    const settings = await createTestSettings(contracts, { ...ci }, opts);

    const collaterals = await createTestCollaterals(contracts, ci);

    const [diamondCuts, assetManagerInit] = await deployAssetManagerFacets();
    const meta = { name: "Wrapped XRP", symbol: "FXRP", decimals: ci.decimals, assetName: ci.assetName, assetSymbol: ci.symbol };
    [assetManager] = await newAssetManager(
      governance,
      contracts.assetManagerController.address,
      meta.name, meta.symbol, meta.decimals,
      settings, collaterals, meta.assetName, meta.assetSymbol
    );

    // whitelist & create a publicly available agent so user can reserve
    await whitelistAgentOwner(settings.agentOwnerRegistry, agentOwner);
    const agentSettings = await createTestAgentSettings(contracts, {
      vaultCollateralToken: collaterals[0].token, // WNat pool collateral
      publiclyAvailable: true,
      poolFeeShareBIPS:  "1000", // 10%
      feeBIPS:           "100",  // 1%
      agentMinCollateralRatioBIPS: "20000"
    });
    const addressValidityProof = { account: underlyingAgent, proof: "0x00" };
    await assetManager.createAgentVault(
      web3DeepNormalize(addressValidityProof),
      web3DeepNormalize(agentSettings),
      { from: agentOwner }
    );
  });

  it("refunds (msg.value - fee) back to msg.sender when executor == 0", async () => {
    const crFacet = await (artifacts.require("CollateralReservationsFacet")).at(assetManager.address) as any;

    const lots = web3.utils.toBN(1);
    const feeWei = await crFacet.collateralReservationFee(lots);

    const overpay = toBNExp(1, 14); // 1e14 wei
    const value = feeWei.add(overpay);

    const list = await assetManager.getAvailableAgentsList(0, 10);
    const agents: string[] = (list as any)[0] ?? (list as any).agents;
    expect(agents && agents.length > 0, "no available agents").to.eq(true);
    const agentVault = agents[0];

    const preBal = web3.utils.toBN(await web3.eth.getBalance(user));

    const tx = await crFacet.reserveCollateral(
      agentVault,
      lots,
      10000, // maxMintingFeeBIPS
      "0x0000000000000000000000000000000000000000",
      { from: user, value }
    );

    const receipt  = await web3.eth.getTransactionReceipt(tx.tx);
    const sent     = await web3.eth.getTransaction(tx.tx);
    const gasUsed  = web3.utils.toBN(receipt.gasUsed);
    const gasPrice = web3.utils.toBN(sent.gasPrice || "0");
    const gasCost  = gasUsed.mul(gasPrice);

    const postBal = web3.utils.toBN(await web3.eth.getBalance(user));
    const paid    = preBal.sub(postBal);

    const expected  = feeWei.add(gasCost);
    const tolerance = toBNExp(1, 12); // dust
    const diff      = paid.sub(expected);
    const abs       = diff.isNeg() ? diff.neg() : diff;

    expect(abs.lte(tolerance),
      `paid=${paid.toString()} expected≈${expected.toString()} diff=${diff.toString()}`
    ).to.eq(true);
  });
});
