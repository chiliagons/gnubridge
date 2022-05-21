import { BigNumber, providers, utils, Wallet } from "ethers";
import Sinon, { restore, reset, createStubInstance, SinonStubbedInstance, SinonStub } from "sinon";
import {
  getRandomAddress,
  getRandomBytes32,
  mkAddress,
  RequestContext,
  expect,
  Logger,
  mock,
  chainDataToMap,
} from "@connext/nxtp-utils";

import { cachedPriceMap, ChainReader } from "../src/chainreader";
import { RpcProviderAggregator } from "../src/aggregator";
import { ChainNotSupported, ConfigurationError, ProviderNotConfigured, RpcError } from "../src/shared";
import * as ContractFns from "../src/shared/contracts";
import {
  TEST_SENDER_CHAIN_ID,
  TEST_TX,
  TEST_READ_TX,
  TEST_TX_RECEIPT,
  makeChaiReadable,
  TEST_RECEIVER_CHAIN_ID,
} from "./utils";
import { parseEther, parseUnits } from "ethers/lib/utils";

const logger = new Logger({
  level: process.env.LOG_LEVEL ?? "silent",
  name: "ChainReaderTest",
});

let signer: SinonStubbedInstance<Wallet>;
let chainReader: ChainReader;
let provider: SinonStubbedInstance<RpcProviderAggregator>;
let context: RequestContext = {
  id: "",
  origin: "",
};
const { requestContext: requestContextMock } = mock.loggingContext();

const mockChainData = chainDataToMap([
  {
    name: "Ethereum Testnet Rinkeby",
    chainId: 4,
    domainId: "2000",
    type: "testnet",
    confirmations: 1,
    shortName: "rin",
    network: "rinkeby",
    assetId: {},
  },
  {
    name: "Ethereum Testnet Kovan",
    chainId: 42,
    domainId: "3000",
    type: "testnet",
    confirmations: 1,
    shortName: "kov",
    chain: "ETH",
    network: "kovan",
    networkId: 42,
    assetId: {},
  },
  {
    name: "Local Testnet 1337",
    chainId: 1337,
    domainId: "1337",
    type: "testnet",
    confirmations: 1,
    shortName: "lt-1337",
    network: "lt-1337",
    assetId: {},
  },
  {
    name: "Local Testnet 1338",
    chainId: 1338,
    domainId: "1338",
    type: "testnet",
    confirmations: 1,
    shortName: "lt-1338",
    network: "lt-1338",
    assetId: {},
  },
  {
    name: "Optimistic Ethereum",
    chainId: 10,
    domainId: "10",
    type: "mainnet",
    confirmations: 1,
    shortName: "optimism",
    network: "optimism",
    assetId: {},
  },
]);

/// In these tests, we are testing the outer shell of chainreader - the interface, not the core functionality.
/// For core functionality tests, see dispatch.spec.ts and provider.spec.ts.
describe("ChainReader", () => {
  beforeEach(() => {
    provider = createStubInstance(RpcProviderAggregator);
    signer = createStubInstance(Wallet);
    signer.connect.resolves(true);

    const chains = {
      [TEST_SENDER_CHAIN_ID.toString()]: {
        providers: [{ url: "https://-------------" }],
        confirmations: 1,
        gasStations: [],
      },
    };

    chainReader = new ChainReader(logger, { chains }, signer);
    Sinon.stub(chainReader as any, "getProvider").callsFake((chainId: number) => {
      // NOTE: We check to make sure we are only getting the one chainId we expect
      // to get in these unit tests.
      expect(chainId).to.be.eq(TEST_SENDER_CHAIN_ID);
      return provider;
    });
    context.id = getRandomBytes32();
    context.origin = "ChainReaderTest";
  });

  afterEach(() => {
    restore();
    reset();
  });

  describe("#readTx", () => {
    it("happy: returns exactly what it reads", async () => {
      const fakeData = getRandomBytes32();
      provider.readContract.resolves(fakeData);

      const data = await chainReader.readTx(TEST_READ_TX);

      expect(data).to.deep.eq(fakeData);
      expect(provider.readContract.callCount).to.equal(1);
      expect(provider.readContract.args[0][0]).to.deep.eq(TEST_READ_TX);
    });

    it("should throw if provider fails", async () => {
      provider.readContract.rejects(new RpcError("fail"));

      await expect(chainReader.readTx(TEST_READ_TX)).to.be.rejectedWith("fail");
    });
  });

  describe("#getBalance", () => {
    it("happy", async () => {
      const testBalance = utils.parseUnits("42", "ether");
      const testAddress = getRandomAddress();
      provider.getBalance.resolves(testBalance);

      const balance = await chainReader.getBalance(TEST_SENDER_CHAIN_ID, testAddress);

      expect(balance.eq(testBalance)).to.be.true;
      expect(provider.getBalance.callCount).to.equal(1);
      expect(provider.getBalance.getCall(0).args[0]).to.deep.eq(testAddress);
    });

    it("should throw if provider fails", async () => {
      provider.getBalance.rejects(new RpcError("fail"));

      await expect(chainReader.getBalance(TEST_SENDER_CHAIN_ID, mkAddress("0xaaa"))).to.be.rejectedWith("fail");
    });
  });

  describe("#getGasPrice", () => {
    it("happy", async () => {
      const testGasPrice = utils.parseUnits("5", "gwei");
      provider.getGasPrice.resolves(testGasPrice);

      const gasPrice = await chainReader.getGasPrice(TEST_SENDER_CHAIN_ID, requestContextMock);

      expect(gasPrice.eq(testGasPrice)).to.be.true;
      expect(provider.getGasPrice.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getGasPrice.rejects(new RpcError("fail"));

      await expect(chainReader.getGasPrice(TEST_SENDER_CHAIN_ID, requestContextMock)).to.be.rejectedWith("fail");
    });
  });

  describe("#getDecimalsForAsset", () => {
    it("happy", async () => {
      const decimals = 18;
      const assetId = mkAddress("0xaaa");
      provider.getDecimalsForAsset.resolves(decimals);

      const retrieved = await chainReader.getDecimalsForAsset(TEST_SENDER_CHAIN_ID, assetId);

      expect(retrieved).to.be.eq(decimals);
      expect(provider.getDecimalsForAsset.callCount).to.equal(1);
      expect(provider.getDecimalsForAsset.getCall(0).args[0]).to.deep.eq(assetId);
    });

    it("should throw if provider fails", async () => {
      provider.getDecimalsForAsset.rejects(new RpcError("fail"));

      await expect(chainReader.getDecimalsForAsset(TEST_SENDER_CHAIN_ID, mkAddress("0xaaa"))).to.be.rejectedWith(
        "fail",
      );
    });
  });

  describe("#getBlock", () => {
    it("happy", async () => {
      const mockBlock = { transactions: [getRandomBytes32()] } as providers.Block;
      provider.getBlock.resolves(mockBlock);

      const block = await chainReader.getBlock(TEST_SENDER_CHAIN_ID, "block");

      expect(block).to.be.eq(mockBlock);
      expect(provider.getBlock.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getBlock.rejects(new RpcError("fail"));

      await expect(chainReader.getBlock(TEST_SENDER_CHAIN_ID, "block")).to.be.rejectedWith("fail");
    });
  });

  describe("#getBlockTime", () => {
    it("happy", async () => {
      const time = Math.floor(Date.now() / 1000);
      provider.getBlockTime.resolves(time);

      const blockTime = await chainReader.getBlockTime(TEST_SENDER_CHAIN_ID);

      expect(blockTime).to.be.eq(time);
      expect(provider.getBlockTime.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getBlockTime.rejects(new RpcError("fail"));

      await expect(chainReader.getBlockTime(TEST_SENDER_CHAIN_ID)).to.be.rejectedWith("fail");
    });
  });

  describe("#getBlockNumber", () => {
    it("happy", async () => {
      const testBlockNumber = 42;
      provider.getBlockNumber.resolves(testBlockNumber);

      const blockNumber = await chainReader.getBlockNumber(TEST_SENDER_CHAIN_ID);

      expect(blockNumber).to.be.eq(testBlockNumber);
      expect(provider.getBlockNumber.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getBlockNumber.rejects(new RpcError("fail"));

      await expect(chainReader.getBlockNumber(TEST_SENDER_CHAIN_ID)).to.be.rejectedWith("fail");
    });
  });

  describe("#getTransactionReceipt", () => {
    it("happy", async () => {
      provider.getTransactionReceipt.resolves(TEST_TX_RECEIPT);

      const receipt = await chainReader.getTransactionReceipt(TEST_SENDER_CHAIN_ID, TEST_TX_RECEIPT.transactionHash);

      expect(makeChaiReadable(receipt)).to.deep.eq(makeChaiReadable(TEST_TX_RECEIPT));
      expect(provider.getTransactionReceipt.callCount).to.be.eq(1);
    });

    it("should throw if provider fails", async () => {
      provider.getTransactionReceipt.rejects(new RpcError("fail"));

      await expect(
        chainReader.getTransactionReceipt(TEST_SENDER_CHAIN_ID, TEST_TX_RECEIPT.transactionHash),
      ).to.be.rejectedWith("fail");
    });
  });

  describe("#getCode", () => {
    it("happy", async () => {
      const code = "0x12345789";
      provider.getCode.resolves(code);

      const result = await chainReader.getCode(TEST_SENDER_CHAIN_ID, mkAddress("0xa1"));

      expect(result).to.be.eq(code);
      expect(provider.getCode.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getCode.rejects(new RpcError("fail"));

      await expect(chainReader.getCode(TEST_SENDER_CHAIN_ID, mkAddress("0xa1"))).to.be.rejectedWith("fail");
    });
  });

  describe("#getGasEstimate", () => {
    it("happy", async () => {
      const mockGasEstimation = parseUnits("1", 9);
      provider.getGasEstimate.resolves(mockGasEstimation);

      const gasEstimation = await chainReader.getGasEstimate(TEST_SENDER_CHAIN_ID, null);

      expect(gasEstimation).to.be.eq(mockGasEstimation);
      expect(provider.getGasEstimate.callCount).to.equal(1);
    });

    it("should throw if provider fails", async () => {
      provider.getGasEstimate.rejects(new RpcError("fail"));

      await expect(chainReader.getGasEstimate(TEST_SENDER_CHAIN_ID, null)).to.be.rejectedWith("fail");
    });
  });

  describe("#getTokenPrice", () => {
    const priceOracleContractFakeAddr = mkAddress("0x7f");
    let getDeployedPriceOracleContractStub: SinonStub;
    let getPriceOracleInterfaceStub: SinonStub;
    let getTokenPriceFromOnChainStub: SinonStub;
    let readTxStub: SinonStub;
    let interfaceStub: SinonStubbedInstance<utils.Interface>;
    beforeEach(() => {
      interfaceStub = createStubInstance(utils.Interface);
      getPriceOracleInterfaceStub = Sinon.stub(ContractFns, "getPriceOracleInterface");
      getPriceOracleInterfaceStub.returns(interfaceStub);
      getDeployedPriceOracleContractStub = Sinon.stub(ContractFns, "getDeployedPriceOracleContract");
      getDeployedPriceOracleContractStub.returns({
        address: priceOracleContractFakeAddr,
        abi: ["fakeAbi()"],
      });
      readTxStub = Sinon.stub(chainReader, "readTx");
    });

    it("happy", async () => {
      const assetId = mkAddress("0xc3");
      const data = "0x123456789";
      const tokenPrice = "5812471953821";
      interfaceStub.encodeFunctionData.returns(data);
      readTxStub.resolves(tokenPrice);

      const result = await chainReader.getTokenPrice(TEST_SENDER_CHAIN_ID, assetId);

      expect(result.toString()).to.be.eq(tokenPrice);
      expect(getDeployedPriceOracleContractStub.getCall(0).args).to.deep.eq([TEST_SENDER_CHAIN_ID]);
      expect(interfaceStub.encodeFunctionData.getCall(0).args).to.deep.eq(["getTokenPrice", [assetId]]);
      expect(readTxStub.getCall(0).args[0]).to.deep.eq({
        chainId: TEST_SENDER_CHAIN_ID,
        to: priceOracleContractFakeAddr,
        data,
      });
    });

    it("should throw ChainNotSupported if chain not supported for token pricing", async () => {
      getDeployedPriceOracleContractStub.returns(undefined);
      await expect(chainReader.getTokenPrice(TEST_SENDER_CHAIN_ID, mkAddress("0xa1"))).to.be.rejectedWith(
        ChainNotSupported,
      );
    });

    it("should return cached price if updated timestamp less than 1 min", async () => {
      getTokenPriceFromOnChainStub = Sinon.stub(chainReader, "getTokenPriceFromOnChain");
      const assetId = mkAddress("0xc3");
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const tokenPrice = BigNumber.from("5812471953821");
      const cachedPriceKey = TEST_SENDER_CHAIN_ID.toString().concat("-").concat(assetId);
      cachedPriceMap.set(cachedPriceKey, {
        timestamp: currentTimestamp - 30,
        price: tokenPrice,
      });

      getTokenPriceFromOnChainStub.returns(BigNumber.from("581247195382112121212"));
      expect((await chainReader.getTokenPrice(TEST_SENDER_CHAIN_ID, assetId)).toString()).to.be.eq(
        tokenPrice.toString(),
      );
    });

    it("should return real price if updated timestamp more than 1 min", async () => {
      getTokenPriceFromOnChainStub = Sinon.stub(chainReader, "getTokenPriceFromOnChain");
      const assetId = mkAddress("0xc3");
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const tokenPrice = BigNumber.from("5812471953821");
      const cachedPriceKey = TEST_SENDER_CHAIN_ID.toString().concat("-").concat(assetId).concat("latest");

      cachedPriceMap.set(cachedPriceKey, {
        timestamp: currentTimestamp - 61,
        price: tokenPrice,
      });
      getTokenPriceFromOnChainStub.returns(BigNumber.from("581247195382112121212"));
      expect((await chainReader.getTokenPrice(TEST_SENDER_CHAIN_ID, assetId)).toString()).to.be.eq(
        "581247195382112121212",
      );
    });
  });

  describe("#getTokenPriceFromOnChain", () => {
    const priceOracleContractFakeAddr = mkAddress("0x7f");
    let getDeployedPriceOracleContractStub: SinonStub;
    let getPriceOracleInterfaceStub: SinonStub;
    let readTxStub: SinonStub;
    let interfaceStub: SinonStubbedInstance<utils.Interface>;
    beforeEach(() => {
      interfaceStub = createStubInstance(utils.Interface);
      getPriceOracleInterfaceStub = Sinon.stub(ContractFns, "getPriceOracleInterface");
      getPriceOracleInterfaceStub.returns(interfaceStub);
      getDeployedPriceOracleContractStub = Sinon.stub(ContractFns, "getDeployedPriceOracleContract");
      getDeployedPriceOracleContractStub.returns({
        address: priceOracleContractFakeAddr,
        abi: ["fakeAbi()"],
      });
      readTxStub = Sinon.stub(chainReader, "readTx");
    });

    it("happy", async () => {
      const assetId = mkAddress("0xc3");
      const data = "0x123456789";
      const tokenPrice = "5812471953821";
      interfaceStub.encodeFunctionData.returns(data);
      readTxStub.resolves(tokenPrice);

      const result = await chainReader.getTokenPriceFromOnChain(TEST_SENDER_CHAIN_ID, assetId);

      expect(result.toString()).to.be.eq(tokenPrice);
      expect(getDeployedPriceOracleContractStub.getCall(0).args).to.deep.eq([TEST_SENDER_CHAIN_ID]);
      expect(interfaceStub.encodeFunctionData.getCall(0).args).to.deep.eq(["getTokenPrice", [assetId]]);
      expect(readTxStub.getCall(0).args[0]).to.deep.eq({
        chainId: TEST_SENDER_CHAIN_ID,
        to: priceOracleContractFakeAddr,
        data,
      });
    });

    it("should throw ChainNotSupported if chain not supported for token pricing", async () => {
      getDeployedPriceOracleContractStub.returns(undefined);
      await expect(chainReader.getTokenPriceFromOnChain(TEST_SENDER_CHAIN_ID, mkAddress("0xa1"))).to.be.rejectedWith(
        ChainNotSupported,
      );
    });
  });

  describe("#calculateGasFeeInReceivingToken", () => {
    let calculateGasFeeStub: SinonStub;
    beforeEach(() => {
      calculateGasFeeStub = Sinon.stub(chainReader as any, "calculateGasFee");
    });

    it("happy: should return sum of both chains calculations'", async () => {
      const gasFeeSenderFulfill = BigNumber.from(124098148);
      const gasFeeReceiverPrepare = BigNumber.from(1151259044);
      const expectedTotal = gasFeeReceiverPrepare.add(gasFeeSenderFulfill);
      const sendingAssetId = mkAddress("0xa1");
      const receivingAssetId = mkAddress("0xb2");
      calculateGasFeeStub.onFirstCall().resolves(gasFeeSenderFulfill);
      calculateGasFeeStub.onSecondCall().resolves(gasFeeReceiverPrepare);
      const result = await chainReader.calculateGasFeeInReceivingToken(
        TEST_SENDER_CHAIN_ID,
        sendingAssetId,
        TEST_RECEIVER_CHAIN_ID,
        receivingAssetId,
        18,
        undefined,
        requestContextMock,
      );
      expect(result.toNumber()).to.eq(expectedTotal.toNumber());
      // Calls are made with an async Promise.all so we don't know which order they'll actually be made in.
      expect(calculateGasFeeStub).to.have.been.calledWithExactly(
        TEST_SENDER_CHAIN_ID,
        sendingAssetId,
        18,
        "xcall",
        undefined,
        undefined,
        requestContextMock,
      );
      expect(calculateGasFeeStub).to.have.been.calledWithExactly(
        TEST_RECEIVER_CHAIN_ID,
        receivingAssetId,
        18,
        "execute",
        undefined,
        undefined,
        requestContextMock,
      );
    });
  });

  describe("#calculateGasFeeInReceivingToken", () => {
    let calculateGasFeeStub: SinonStub;
    beforeEach(() => {
      calculateGasFeeStub = Sinon.stub(chainReader as any, "calculateGasFee");
    });

    it("happy: should call calculateGasFee for fulfill", async () => {
      const gasFee = BigNumber.from(71221304);
      const assetId = mkAddress("0xb2");
      calculateGasFeeStub.onFirstCall().resolves(gasFee);
      const result = await chainReader.calculateGasFeeInReceivingTokenForFulfill(
        TEST_RECEIVER_CHAIN_ID,
        assetId,
        18,
        undefined,
        requestContextMock,
      );
      expect(result.toNumber()).to.eq(gasFee.toNumber());
      expect(calculateGasFeeStub.getCall(0).args.slice(0, 5)).to.deep.eq([
        TEST_RECEIVER_CHAIN_ID,
        assetId,
        18,
        "execute",
        undefined,
      ]);
    });
  });

  describe("#calculateGasFee", () => {
    const testEthPrice = utils.parseEther("31");
    const testTokenPrice = utils.parseEther("7");
    const testGasPrice = utils.parseUnits("5", "gwei");
    let chainsPriceOraclesStub: SinonStub;
    let tokenPriceStub: SinonStub;
    let gasPriceStub: SinonStub;
    beforeEach(() => {
      chainsPriceOraclesStub = Sinon.stub(ContractFns, "CHAINS_WITH_PRICE_ORACLES").value([1, 10, 1337]);
      tokenPriceStub = Sinon.stub(chainReader, "getTokenPrice");
      gasPriceStub = Sinon.stub(chainReader, "getGasPrice");
      tokenPriceStub.onFirstCall().resolves(BigNumber.from(testEthPrice));
      tokenPriceStub.onSecondCall().resolves(BigNumber.from(testTokenPrice));
      gasPriceStub.onFirstCall().resolves(BigNumber.from(testGasPrice));
    });

    it("happy: should calculate for xcall if chain included and xcall specified", async () => {
      const result = await chainReader.calculateGasFee(
        1,
        mkAddress("0x0"),
        18,
        "xcall",
        undefined,
        undefined,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(4207142857142857);
    });

    it("happy: should calculate for execute if chain included and execute specified", async () => {
      const result = await chainReader.calculateGasFee(
        1,
        mkAddress("0x0"),
        18,
        "execute",
        undefined,
        undefined,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(4428571428571428);
    });

    it("should return zero if price oracle isn't configured for that chain", async () => {
      const result = await chainReader.calculateGasFee(
        TEST_RECEIVER_CHAIN_ID,
        mkAddress("0x0"),
        18,
        "xcall",
        undefined,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(0);
    });

    it("special case for chainId 10 xcall", async () => {
      chainsPriceOraclesStub.value([1, 10]);
      gasPriceStub.resolves(testGasPrice);
      const result = await chainReader.calculateGasFee(
        10,
        mkAddress("0x0"),
        18,
        "xcall",
        undefined,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(4663795000000000);
    });

    it("special case for chainId 10 execute", async () => {
      chainsPriceOraclesStub.value([1, 10]);
      gasPriceStub.resolves(testGasPrice);
      const result = await chainReader.calculateGasFee(
        10,
        mkAddress("0x0"),
        18,
        "execute",
        undefined,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(4737796428571428);
    });

    it("happy: should calculate for prepare with default data", async () => {
      const result = await chainReader.calculateGasFee(
        1337,
        mkAddress("0x0"),
        18,
        "xcall",
        undefined,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(4207142857142857);
    });

    it("happy: should add callDataGas for execute with default data", async () => {
      const callDataParams = { callData: "0x", callTo: mkAddress("0xaaa"), callDataGas: "100000" };
      const result = await chainReader.calculateGasFee(
        1337,
        mkAddress("0x0"),
        18,
        "execute",
        callDataParams,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(6642857142857142);
    });

    it("happy: should calculate callDataGas with callData and callTo", async () => {
      const mockGasEstimation = BigNumber.from("100000");
      provider.getGasEstimate.resolves(mockGasEstimation);
      const callDataParams = { callData: "0xaaa", callTo: mkAddress("0xaaa") };
      const result = await chainReader.calculateGasFee(
        1337,
        mkAddress("0x0"),
        18,
        "execute",
        callDataParams,
        mockChainData,
        requestContextMock,
      );
      expect(result.toNumber()).to.be.eq(6642857142857142);
    });
  });

  describe("#isSupportedChain", () => {
    it("should return false for unsupported chain", async () => {
      expect(chainReader.isSupportedChain(111111)).to.be.false;
    });
  });

  describe("#getProvider", () => {
    it("errors if cannot get provider", async () => {
      // Replacing this method with the original fn not working.
      (chainReader as any).getProvider.restore();
      await expect(chainReader.readTx({ ...TEST_TX, chainId: 9999 })).to.be.rejectedWith(ProviderNotConfigured);
    });
  });

  describe("#setupProviders", () => {
    it("throws if not a single provider config is provided for a chainId", async () => {
      (chainReader as any).config = {
        [TEST_SENDER_CHAIN_ID.toString()]: {
          // Providers list here should never be empty.
          providers: [],
          confirmations: 1,
          gasStations: [],
        },
      };
      expect(() => (chainReader as any).setupProviders(context, signer)).to.throw(ConfigurationError);
    });
  });
});
