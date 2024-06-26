'use client'

import React, {useEffect, useState} from "react";
import * as webauthn from "@passwordless-id/webauthn";
import base64url from 'base64url';
import { BigNumber } from "ethers";
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { AsnParser } from '@peculiar/asn1-schema';
import * as ethers from 'ethers';
import {SmartContract, Transaction, ConnectWallet, useSDK, useChainId, en} from "@thirdweb-dev/react";
import {PasskeyAccountABI} from "@/app/abi";

const DemoCollectionAddress = process.env.NEXT_PUBLIC_COLLECTION_ADDRESS!;
const PasskeyMinterAddress = process.env.NEXT_PUBLIC_MINTER_ADDRESS!;

async function parsePublicKeyBytes(publicKeyBytes: string): Promise<[BigNumber, BigNumber]> {
  const cap = {
    name: 'ECDSA',
    namedCurve: 'P-256',
    hash: 'SHA-256',
  };
  const pkeyBytes = base64url.toBuffer(publicKeyBytes);
  let pkey = await crypto.subtle.importKey('spki', pkeyBytes, cap, true, ['verify']);
  let jwk = await crypto.subtle.exportKey('jwk', pkey);
  if (jwk.x && jwk.y) {
    return [
      BigNumber.from(base64url.toBuffer(jwk.x)),
      BigNumber.from(base64url.toBuffer(jwk.y))
    ];
  }
  throw new Error('Invalid public key');
}

function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
    return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
}

function parseAuthSignature(authSignature: string): [BigNumber, BigNumber] {
  const parsed = AsnParser.parse(
    base64url.toBuffer(authSignature),
    ECDSASigValue
  );

  let rBytes = new Uint8Array(parsed.r);
  let sBytes = new Uint8Array(parsed.s);

  if (shouldRemoveLeadingZero(rBytes)) {
    rBytes = rBytes.slice(1);
  }
  if (shouldRemoveLeadingZero(sBytes)) {
    sBytes = sBytes.slice(1);
  }

  return [BigNumber.from(rBytes), BigNumber.from(sBytes)];
}

type PasskeyAccountInfo = {
  credentialId: string;
  pubX: BigNumber;
  pubY: BigNumber;
};

export default function Home() {
  const username = "Passkeys Mint Demo";

  const sdk = useSDK();
  const [minter, setMinter] = useState<SmartContract | undefined>();
  const [paInfo, setPaInfo] = useState<PasskeyAccountInfo>({
    credentialId: "", pubX: BigNumber.from(0), pubY: BigNumber.from(0)
  });

  const [receiveAddress, setReceiveAddress] = useState("");

  useEffect(() => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    (async () => {
      const minter = await sdk.getContract(PasskeyMinterAddress, PasskeyAccountABI);
      setMinter(minter);
    })();
  }, [sdk]);

  const handleSignIn = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    if (!minter) {
      console.warn("PasskeyMinter not ready");
      return;
    }

    const challenge = window.crypto.randomUUID();
    const authData = await webauthn.client.authenticate(
      [],
      challenge,
      {authenticatorType: 'auto'},
    );
    console.debug('webauthn.client.authenticate():', authData);

    const parsed = webauthn.parsers.parseAuthentication(authData);
    console.debug('webauthn.parsers.parseAuthentication():', parsed);

    const [credentialId, posX, posY]: [string, BigNumber, BigNumber] = await minter.call("publicKey", [parsed.credentialId]);
    console.debug({credentialId, posX, posY});
    if (posX.eq(0) && posY.eq(0)) {
      console.error("credential is not registered");
      return;
    }

    setPaInfo({credentialId: credentialId, pubX: posX, pubY: posY});
  }

  const handleRegister = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    if (!minter) {
      console.warn("PasskeyMinter not ready");
      return;
    }

    /*
     Passkey をユーザの端末に追加
     */
    const encodedRegistration = await webauthn.client.register(
      username,
      window.crypto.randomUUID(),
      {authenticatorType: 'auto'},
    );
    console.debug(encodedRegistration);
    const parsedRegistration = webauthn.parsers.parseRegistration(encodedRegistration);
    console.debug(parsedRegistration);
    const credentialId = parsedRegistration.credential.id;
    const pubKeyPos = await parsePublicKeyBytes(parsedRegistration.credential.publicKey);
    console.debug({
      credentialId,
      pubKeyPos
    });

    await new Promise(resolve => setTimeout(resolve, 3000));

    /*
     PasskeyMinter に公開鍵を登録
     */
    const randomString = window.crypto.randomUUID();
    const signTarget = ethers.utils.solidityPack(
      ["uint256", "uint256", "string"],
      [pubKeyPos[0], pubKeyPos[1], randomString],
    )
    console.debug({signTarget});
    const payload = ethers.utils.keccak256(signTarget);
    console.debug({payload});
    const challenge = webauthn.utils.toBase64url(ethers.utils.arrayify(payload)).replace(/=/g, '');
    const encodedAuth = await webauthn.client.authenticate(
      [credentialId],
      challenge,
      {authenticatorType: 'auto'},
    );
    console.debug('webauthn.client.authenticate():', encodedAuth);
    const parsedAuth = webauthn.parsers.parseAuthentication(encodedAuth);
    console.debug('webauthn.parsers.parseAuthentication():', parsedAuth);

    const signature = parseAuthSignature(parsedAuth.signature);
    console.debug({challenge, signature});

    const authDataBytes = new Uint8Array(webauthn.utils.parseBase64url(encodedAuth.authenticatorData));
    const clientData = new TextDecoder().decode(webauthn.utils.parseBase64url(encodedAuth.clientData));
    const challengePos = clientData.indexOf(challenge);
    const challengePrefix = clientData.substring(0, challengePos);
    const challengeSuffix = clientData.substring(challengePos + challenge.length);

    const encodedSignature = ethers.utils.defaultAbiCoder.encode(
      ["uint", "uint", "bytes", "string", "string"],
      [signature[0], signature[1], authDataBytes, challengePrefix, challengeSuffix]
    );
    console.debug({
      payload,
      encodedSignature,
    });

    // PasskeyMinter に公開鍵を登録
    const tx: Transaction = await minter.call(
      "setPublicKey",
      [credentialId, pubKeyPos[0], pubKeyPos[1], randomString, encodedSignature],
    );
    console.debug({tx});
  }

  const handleMint = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    if (!minter) {
      console.warn("PasskeyMinter not ready");
      return;
    }

    // 署名させたい Call data
    const callData = ethers.utils.solidityPack(
      ["address"],
      [receiveAddress]
    )
    console.debug({callData});
    const payload = ethers.utils.keccak256(callData);
    console.debug({payload});

    const challenge = webauthn.utils.toBase64url(ethers.utils.arrayify(payload)).replace(/=/g, '');
    const authData = await webauthn.client.authenticate(
      [paInfo.credentialId],
      challenge,
      {authenticatorType: 'auto'},
    );
    console.debug('webauthn.client.authenticate():', authData);

    const parsed = webauthn.parsers.parseAuthentication(authData);
    console.debug('webauthn.parsers.parseAuthentication():', parsed);

    const signature = parseAuthSignature(parsed.signature);
    console.debug({
      challenge,
      signature
    });

    const authDataBytes = new Uint8Array(webauthn.utils.parseBase64url(authData.authenticatorData));
    const clientData = new TextDecoder().decode(webauthn.utils.parseBase64url(authData.clientData));
    const challengePos = clientData.indexOf(challenge);
    const challengePrefix = clientData.substring(0, challengePos);
    const challengeSuffix = clientData.substring(challengePos + challenge.length);

    const encodedSignature = ethers.utils.defaultAbiCoder.encode(
      ["uint", "uint", "bytes", "string", "string"],
      [signature[0], signature[1], authDataBytes, challengePrefix, challengeSuffix]
    );
    console.debug({
      payload,
      encodedSignature,
    });

    const tx = await minter.call(
      "mint",
      [
        paInfo.credentialId,
        receiveAddress,
        encodedSignature
      ]);
    console.debug({tx});
  }

  return (
    <main>
      <header className="bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex flex-1">
            <div className="hidden lg:flex lg:gap-x-12">
              <h1 className="text-4xl font-semibold leading-6 text-gray-900">MINT BY PASSKEYS</h1>
            </div>
          </div>
          <div className="flex flex-1 justify-end">
            <ConnectWallet/>
          </div>
        </nav>
      </header>

      <div className="px-4 sm:px-6 lg:px-8 py-2">
        <div className="mt-8 flow-root">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <table className="min-w-full divide-y divide-gray-300">
                <thead>
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-3">
                    Contract
                  </th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                    Address
                  </th>
                </tr>
                </thead>
                <tbody className="bg-white">
                <tr className="even:bg-gray-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-3">
                    NFT Collection
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{DemoCollectionAddress}</td>
                </tr>
                <tr className="even:bg-gray-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-3">
                    Passkeys Minter
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{PasskeyMinterAddress}</td>
                </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {paInfo.credentialId ? (
        <div className="mx-8">
          <div className="overflow-hidden bg-white shadow sm:rounded-lg">
            <div className="px-4 py-6 sm:px-6">
              <h2 className="text-xl font-semibold leading-7 text-gray-900">Registered Passkey</h2>
            </div>
            <div className="border-t border-gray-100">
              <dl className="divide-y divide-gray-100">
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium text-gray-900">Credential ID</dt>
                  <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{paInfo.credentialId}</dd>
                </div>
                <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                  <dt className="text-sm font-medium leading-6 text-gray-900">Public Key</dt>
                  <dd className="mt-2 text-sm text-gray-900 sm:col-span-2 sm:mt-0">
                    <ul role="list" className="divide-y divide-gray-100 rounded-md border border-gray-200">
                      <li className="flex items-center justify-between py-4 pl-4 pr-5 text-sm leading-6">
                        <div className="flex w-0 flex-1 items-center">
                          <div className="ml-4 flex min-w-0 flex-1 gap-2">
                            <span className="truncate font-medium">X</span>
                            <span className="flex-shrink-0 text-gray-400">{paInfo.pubX.toString()}</span>
                          </div>
                        </div>
                      </li>
                      <li className="flex items-center justify-between py-4 pl-4 pr-5 text-sm leading-6">
                        <div className="flex w-0 flex-1 items-center">
                          <div className="ml-4 flex min-w-0 flex-1 gap-2">
                            <span className="truncate font-medium">Y</span>
                            <span className="flex-shrink-0 text-gray-400">{paInfo.pubY.toString()}</span>
                          </div>
                        </div>
                      </li>
                    </ul>
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          <div className="mt-12 mr-10 grid grid-cols-1 place-items-end">
            <form className="w-full max-w-lg">
              <div className="md:flex md:items-center mb-6">
                <div className="md:w-2/6">
                  <label className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
                         htmlFor="inline-target-address">
                    Receive Address
                  </label>
                </div>
                <div className="md:w-3/6">
                  <input
                    className="bg-gray-200 appearance-none border-2 border-gray-200 rounded w-full py-2 px-4 text-gray-700 leading-tight focus:outline-none focus:bg-white focus:border-purple-500"
                    id="inline-target-address" type="text" value={receiveAddress}
                    onChange={e => setReceiveAddress(e.target.value)}/>
                </div>
                <div className="md:w-1/6">
                  <button
                    className="shadow bg-purple-500 hover:bg-purple-400 focus:shadow-outline focus:outline-none text-white font-bold py-2 px-4 rounded ml-2"
                    type="button"
                    onClick={handleMint}
                  >
                    MINT
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div className="mx-10 my-4">
          <button
            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            onClick={handleSignIn}>
            Sign In
          </button>
          <button
            className="bg-transparent hover:bg-blue-500 text-blue-700 font-semibold hover:text-white py-2 px-4 border border-blue-500 hover:border-transparent rounded ml-4"
            onClick={handleRegister}>
            Register
          </button>
        </div>
      )}
    </main>
  );
}
