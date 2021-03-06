import BigNumber from 'bignumber.js'
import BN from 'bn.js'
import Web3 from 'web3'
import { publicKeyConvert, ecdsaSign, ecdsaRecover } from 'secp256k1'
import { stringToU8a, u8aToHex, u8aConcat } from '@hoprnet/hopr-utils'

const web3 = new Web3()

export const MAX_UINT256 = new BigNumber(2).pow(256).minus(1)

export const keccak256 = (...args: { type: string; value: any }[]): string => {
  return Web3.utils.soliditySha3(...((args as unknown) as any))
}

/**
 * Prefix message with our special message
 * @param message
 * @returns hashed message
 */
export const prefixMessage = (message: string): Uint8Array => {
  const messageWithHOPR = u8aConcat(stringToU8a(Web3.utils.toHex('HOPRnet')), stringToU8a(message))
  const messageWithHOPRHex = u8aToHex(messageWithHOPR)

  return stringToU8a(
    keccak256(
      {
        type: 'string',
        value: '\x19Ethereum Signed Message:\n'
      },
      {
        type: 'string',
        value: messageWithHOPR.length.toString()
      },
      { type: 'bytes', value: messageWithHOPRHex }
    )
  )
}

/**
 * Sign message using private key provided
 * @param message
 * @param privKey
 * @returns signature properties
 */
export const signMessage = (
  message: string,
  privKey: Uint8Array
): { signature: Uint8Array; r: Uint8Array; s: Uint8Array; v: number } => {
  const { signature, recid } = ecdsaSign(prefixMessage(message), privKey)

  return {
    signature: signature,
    r: signature.slice(0, 32),
    s: signature.slice(32, 64),
    v: recid
  }
}

/**
 * Recover the signer's address
 * @param signature
 * @param recid
 * @param message
 * @returns signer's address
 */
export const recoverSigner = (signature: Uint8Array, recid: number, message: string): string => {
  return pubKeyToAddress(ecdsaRecover(signature, recid, prefixMessage(message)))
}

/**
 * Convert a public key to an ethereum address
 * @param pubKey
 * @returns ethereum address
 */
export const pubKeyToAddress = (pubKey: Uint8Array): string => {
  return Web3.utils.toChecksumAddress(
    u8aToHex(
      stringToU8a(
        keccak256({
          type: 'bytes',
          value: u8aToHex(publicKeyConvert(pubKey, false).slice(1))
        })
      ).slice(12)
    )
  )
}

export const createChallenge = (a: string): string => {
  return keccak256({
    type: 'bytes',
    value: a
  })
}

export const isPartyA = (accountA: string, accountB: string) => {
  return new BN(accountA.slice(2), 16).lt(new BN(accountB.slice(2), 16))
}

export const getParties = (accountA: string, accountB: string) => {
  if (isPartyA(accountA, accountB)) {
    return {
      partyA: accountA,
      partyB: accountB
    }
  }

  return {
    partyA: accountB,
    partyB: accountA
  }
}

export const getChannelId = (partyA: string, partyB: string) => {
  if (isPartyA(partyA, partyB)) {
    return keccak256(
      {
        type: 'address',
        value: partyA
      },
      {
        type: 'address',
        value: partyB
      }
    )
  }

  return keccak256(
    {
      type: 'address',
      value: partyB
    },
    {
      type: 'address',
      value: partyA
    }
  )
}

export const encode = (items: { type: string; value: string }[]): string => {
  const { types, values } = items.reduce(
    (result, item) => {
      result.types.push(item.type)
      result.values.push(item.value)

      return result
    },
    {
      types: [],
      values: []
    }
  )

  return web3.eth.abi.encodeParameters(types, values)
}

export const getTopic0 = (event: string, pubKeyA: Uint8Array, pubKeyB: Uint8Array): string => {
  const compressedPubKeyA = publicKeyConvert(
    pubKeyA.length == 64 ? u8aConcat(Uint8Array.from([4]), pubKeyA) : pubKeyA,
    true
  )
  const compressedPubKeyB = publicKeyConvert(
    pubKeyB.length == 64 ? u8aConcat(Uint8Array.from([4]), pubKeyB) : pubKeyB,
    true
  )

  const u8aEvent = stringToU8a(
    keccak256({
      type: 'string',
      value: event
    })
  )

  u8aEvent[31] = ((u8aEvent[31] >> 2) << 2) | (compressedPubKeyA[0] % 2 << 1) | compressedPubKeyB[0] % 2

  return u8aToHex(u8aEvent)
}

export const checkEvent = (
  receipt: Truffle.TransactionResponse<any>['receipt'],
  event: string,
  pubKeyA: Uint8Array,
  pubKeyB: Uint8Array
) => {
  const compressedPubKeyA = publicKeyConvert(
    pubKeyA.length == 64 ? u8aConcat(Uint8Array.from([4]), pubKeyA) : pubKeyA,
    true
  )
  const compressedPubKeyB = publicKeyConvert(
    pubKeyB.length == 64 ? u8aConcat(Uint8Array.from([4]), pubKeyB) : pubKeyB,
    true
  )

  const topics = [
    getTopic0(event, pubKeyA, pubKeyB),
    u8aToHex(compressedPubKeyA.slice(1)),
    u8aToHex(compressedPubKeyB.slice(1))
  ].sort()

  return receipt.rawLogs.some((log: { topics: string[] }) => {
    const sortedTopics = log.topics.sort()

    let i = 0

    return topics.reduce((acc, current, index, array) => {
      for (; i < sortedTopics.length && sortedTopics[i] != current; i++) {}

      return acc && !(i++ >= sortedTopics.length && index != array.length)
    }, true)
  })
}

export const vmErrorMessage = (error: string) => {
  return `VM Exception while processing transaction: revert ${error}`
}
