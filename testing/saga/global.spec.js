'use strict';
import { call, put, take } from 'redux-saga/effects';
import { expectSaga, testSaga } from 'redux-saga-test-plan';
import { getLatestBlock, updateAllRate } from "../../src/js/sagas/globalActions"

import * as BLOCKCHAIN_INFO from "../../env"
import constants from "../../src/js/services/constants"
import Account from "../../src/js/services/account"
import { Rate, updateAllRatePromise } from "../../src/js/services/rate"

import EthereumService from "../instance/ethereum/ethereum.fake"
let ethereum = new EthereumService({ default: 'http' })

let tokens = []
Object.keys(BLOCKCHAIN_INFO.tokens).forEach((key, index) => {
  tokens[index] = BLOCKCHAIN_INFO.tokens[key]
  tokens[index].rate = 0
  tokens[index].rateEth = 0
  tokens[index].balance = 0    
}) 

const account = new Account(
  "0x52249ee04a2860c42704c0bbc74bd82cb9b56e98", 
  "keystore",
  '"{"version":3,"id":"34ae5306-f3bf-42d3-bb0e-ce2e0fe1821b","address":"52249ee04a2860c42704c0bbc74bd82cb9b56e98","crypto":{"ciphertext":"aa638616d99f6f7a11ba205cd8b6dc09f064511d92361736718ba86c61b50c9d","cipherparams":{"iv":"d6fc865281ac8ed91af38cf933e8b916"},"cipher":"aes-128-ctr","kdf":"pbkdf2","kdfparams":{"dklen":32,"salt":"d5358f4e1403c7c47f86b48f134b9e0fce57b3dd6eac726f0eed9e54d12735fe","c":10240,"prf":"hmac-sha256"},"mac":"086cab9258c953081d0d6f3ed077beca7ae6342229526a3fc8e3614d91e71636"}}"'
  );


it('handle new block include pending', () => {
  return expectSaga(getLatestBlock, {payload : ethereum})
    .run(100000)
    .then((result) => {
      const { effects, allEffects } = result;

      expect(effects.call).toHaveLength(1);
      expect(effects.put).toHaveLength(1);

      expect(effects.put[0].PUT.action.type).toEqual(
        'GLOBAL.NEW_BLOCK_INCLUDED_FULFILLED')

        expect(JSON.stringify(effects.call[0])).toEqual(JSON.stringify((call(ethereum.call("getLatestBlock")))));
    })
})


it('handle global rate update all pending', () => {
  return expectSaga(updateAllRate, {
    payload : {
      ethereum: ethereum, 
      tokens: tokens, 
      reserve: constants.RESERVES[0],
      ownerAddr: account.address
    }
  })
    .run(100000)
    .then((result) => {
      const { effects, allEffects } = result;

      expect(effects.call).toHaveLength(1);
      expect(effects.put).toHaveLength(1);
      expect(effects.put[0].PUT.action.type).toEqual(
        'GLOBAL.ALL_RATE_UPDATED_FULFILLED')
        expect(
          effects.call[0]
        ).toEqual(
          call(updateAllRatePromise, ethereum, tokens, constants.RESERVES[0], account.address)
        );
    })
})