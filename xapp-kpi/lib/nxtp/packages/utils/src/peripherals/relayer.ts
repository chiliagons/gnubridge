import axios from "axios";
import { BigNumber } from "ethers";

import { Logger } from "../logging";
import {
  jsonifyError,
  GelatoApiTaskRequestParams,
  RelayerApiPostTaskRequestParams,
  NxtpError,
  RelayerApiPostTaskResponse,
} from "../types";

/// MARK - Gelato Relay API
const GELATO_SERVER = "https://relay.gelato.digital";

export const gelatoSend = async (
  chainId: number,
  params: GelatoApiTaskRequestParams,
  logger?: Logger,
): Promise<any> => {
  let output;
  try {
    const res = await axios.post(`${GELATO_SERVER}/relays/${chainId}`, params);
    output = res.data;
  } catch (error: unknown) {
    if (logger)
      logger.error("Error sending request to Gelato Relay", undefined, undefined, jsonifyError(error as Error));
    throw new NxtpError("Error sending request to Gelato Relay", { error: jsonifyError(error as Error) });
  }
  return output;
};

export const isChainSupportedByGelato = async (chainId: number): Promise<boolean> => {
  const chainsSupportedByGelato = await getGelatoRelayChains();
  return chainsSupportedByGelato.includes(chainId.toString());
};

export const getGelatoRelayerAddress = async (chainId: number, logger?: Logger): Promise<string> => {
  let result = [];
  try {
    const res = await axios.get(`${GELATO_SERVER}/relays/${chainId}/address`);
    result = res.data.address;
  } catch (error: unknown) {
    if (logger) logger.error("Error in getGelatoRelayerAddress", undefined, undefined, jsonifyError(error as Error));
    throw new Error("Error in getGelatoRelayerAddress");
  }

  return result;
};

export const getGelatoRelayChains = async (logger?: Logger): Promise<string[]> => {
  let result = [];
  try {
    const res = await axios.get(`${GELATO_SERVER}/relays/`);
    result = res.data.relays;
  } catch (error: unknown) {
    if (logger) logger.error("Error in getGelatoRelayChains", undefined, undefined, jsonifyError(error as Error));
  }

  return result;
};

export const getEstimatedFee = async (
  chainId: number,
  paymentToken: string,
  gasLimit: number,
  isHighPriority: boolean,
  logger?: Logger,
): Promise<BigNumber> => {
  let result = BigNumber.from("0");
  const params = { paymentToken, gasLimit, isHighPriority };

  try {
    const res = await axios.get(`${GELATO_SERVER}/oracles/${chainId}/estimate`, { params });
    result = BigNumber.from(res.data.estimatedFee);
  } catch (error: unknown) {
    if (logger) logger.error("Error in getEstimatedFee", undefined, undefined, jsonifyError(error as Error));
  }
  return result;
};

export const isOracleActive = async (chainId: number): Promise<boolean> => {
  const oracles = await getGelatoOracles();
  return oracles.includes(chainId.toString());
};

export const getGelatoOracles = async (logger?: Logger): Promise<string[]> => {
  let result = [];
  try {
    const res = await axios.get(`${GELATO_SERVER}/oracles/`);
    result = res.data.oracles;
  } catch (error: unknown) {
    if (logger) logger.error("Error in getGelatoOracles", undefined, undefined, jsonifyError(error as Error));
  }

  return result;
};

export const isPaymentTokenSupported = async (chainId: number, token: string): Promise<boolean> => {
  const paymentTokens = await getPaymentTokens(chainId);
  const lowerPaymentTokens = paymentTokens.map((address) => {
    return address.toLowerCase();
  });
  return lowerPaymentTokens.includes(token.toString().toLowerCase());
};

export const getPaymentTokens = async (chainId: number, logger?: Logger): Promise<string[]> => {
  let result = [];
  try {
    const res = await axios.get(`${GELATO_SERVER}/oracles/${chainId}/paymentTokens/`);
    result = res.data.paymentTokens;
  } catch (error: unknown) {
    if (logger) logger.error("Error in getPaymentTokens", undefined, undefined, jsonifyError(error as Error));
  }

  return result;
};

/// MARK - Connext Relayer
export const connextRelayerSend = async (
  url: string,
  chainId: number,
  params: RelayerApiPostTaskRequestParams,
): Promise<RelayerApiPostTaskResponse> => {
  let output;
  try {
    const res = await axios.post(`${url}/relays/${chainId}`, params);
    output = res.data as RelayerApiPostTaskResponse;
  } catch (error: unknown) {
    throw new NxtpError("Error sending request to Connext Relayer", { error: jsonifyError(error as Error) });
  }
  return output;
};
