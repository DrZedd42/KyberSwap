import { fork, call, join, race, cancel } from 'redux-saga/effects'
import { delay } from 'redux-saga'
import * as constants from "../services/constants"
import * as converters from "../utils/converter"
import { store } from '../store'
import { hexToNumber } from "../utils/converter";

export function* handleRequest(sendRequest, ...args) {

    //check how much connection
    var state = store.getState()
    var ethereum = state.connection.ethereum
    var numProvider = ethereum.getNumProvider()    

	const task = yield fork(sendRequest, ...args)

	const { res, timeout } = yield race({
		res: join(task),
		timeout: call(delay, numProvider * constants.CONNECTION_TIMEOUT)
    })
        
	if (timeout) {     
        //console.log("timeout")
        yield cancel(task)
        return {status: "timeout"}   
    }

    if (res.status === "success"){
        return { status: "success", data: res.res }    
    }else{
        return { status: "fail", data: res.err }    
    }
}

export function* getSourceAmount(sourceTokenSymbol, sourceAmount, defaultRate) {
  var state = store.getState()
  var tokens = state.tokens.tokens
  var sourceAmountHex = "0x0";
  
  if (tokens[sourceTokenSymbol]) {
    var decimals = tokens[sourceTokenSymbol].decimals
    var rateSell = tokens[sourceTokenSymbol].rate
    if (rateSell == 0 || rateSell == "0" || rateSell == "" || rateSell == null) {
      rateSell = defaultRate
    }
    sourceAmountHex = converters.calculateMinSource(sourceTokenSymbol, sourceAmount, decimals, rateSell)
  } else {
    sourceAmountHex = converters.stringToHex(sourceAmount, 18)
  }
  
  return sourceAmountHex
}

export function getSourceAmountZero(sourceTokenSymbol, defaultRate) {
  var state = store.getState()
  var tokens = state.tokens.tokens
  var sourceAmountHex = "0x0"
  
  if (tokens[sourceTokenSymbol]) {
    var decimals = tokens[sourceTokenSymbol].decimals
    var rateSell = tokens[sourceTokenSymbol].rate
    if (rateSell == 0 || rateSell == "0" || rateSell == "" || rateSell == null) {
      rateSell = defaultRate
    }
    sourceAmountHex = converters.toHex(converters.getSourceAmountZero(sourceTokenSymbol, decimals, rateSell))
  }
  
  return sourceAmountHex
}

export function* checkTxMined(ethereum, txHash, latestBlock, tradeTopic) {
  try {
    const receipt = yield call([ethereum, ethereum.call], 'txMined', txHash);
    if (!receipt) return false;

    const logs = receipt.logs;
    const blockNumber = receipt.blockNumber;
    let isTopicValid = false;

    if (!blockNumber || blockNumber > latestBlock) return false;

    if (!logs.length) return false;

    for (var i = 0; i < logs.length; ++i) {
      if (logs[i].topics[0].toLowerCase() === tradeTopic.toLowerCase()) {
        isTopicValid = true;
        break;
      }
    }
    return isTopicValid;
  } catch (e) {
    console.log(e);
    return false;
  }
}

export function* getExpectedRateAndZeroRate(isProceeding, ethereum, tokens, srcTokenAddress, destTokenAddress, srcAmount, srcTokenSymbol) {
  if (!ethereum) return;
  
  let defaultRate = 0;
  
  if(tokens[srcTokenSymbol].rate == 0) {
    if (["ETH", "WETH"].includes(srcTokenSymbol)) {
      defaultRate = converters.toTWei(1)
    } else {
      defaultRate = yield call([ethereum, ethereum.call], "getTokenPrice", srcTokenSymbol)
    }
  }
  
  let refinedSrcAmount = 0;
  if (srcAmount !== false) refinedSrcAmount = yield call(getSourceAmount, srcTokenSymbol, srcAmount, defaultRate);
  let zeroSrcAmount = yield call(getSourceAmountZero, srcTokenSymbol, defaultRate);
  let rate, rateZero;
  let rateFunctionName = 'getRateAtLatestBlock';

  if (!isProceeding) {
    rateFunctionName = 'getExpectedRate';

    const mask = converters.maskNumber();
    refinedSrcAmount = converters.sumOfTwoNumber(refinedSrcAmount, mask);
    zeroSrcAmount = converters.sumOfTwoNumber(zeroSrcAmount, mask);
  }

  try {
    if (srcAmount !== false) {
      rate = yield call([ethereum, ethereum.call], rateFunctionName, srcTokenAddress, destTokenAddress, refinedSrcAmount);
    }
    
    rateZero = yield call([ethereum, ethereum.call], rateFunctionName, srcTokenAddress, destTokenAddress, zeroSrcAmount);
  } catch (e) {
    if (srcAmount !== false) {
      rate = yield call([ethereum, ethereum.call], 'getRateAtLatestBlock', srcTokenAddress, destTokenAddress, refinedSrcAmount);
    }
    
    rateZero = yield call([ethereum, ethereum.call], 'getRateAtLatestBlock', srcTokenAddress, destTokenAddress, zeroSrcAmount);
  }
  
  return { rate, rateZero }
}
