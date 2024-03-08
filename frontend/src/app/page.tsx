'use client'

import React, {useState} from "react";
import * as webauthn from "@passwordless-id/webauthn";
import base64url from 'base64url';
import { BigNumber } from "ethers";
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { AsnParser } from '@peculiar/asn1-schema';
import * as ethers from 'ethers';
import { SmartContract, Transaction, ConnectWallet, useSDK, useChainId } from "@thirdweb-dev/react";
import {PasskeyAccountABI} from "@/app/abi";

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
};

function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
    return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
};

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
  owner: string;
  passkeyUser: string;
  credentialId: string;
  pubX: BigNumber;
  pubY: BigNumber;
};

export default function Home() {
  const username = "demo_user";
  const contractAddress = "0x526e5726050C6722c21786b799B5808B2240fCC0"

  const sdk = useSDK();
  const [passkeyAccount, setPasskeyAccount] = useState<SmartContract | undefined>();
  const [paInfo, setPaInfo] = useState<PasskeyAccountInfo>({
    credentialId: "", owner: "", passkeyUser: "", pubX: BigNumber.from(0), pubY: BigNumber.from(0)
  });

  const [sendTargetAddress, setSendTargetAddress] = useState("");
  const [sendValue, setSendValue] = useState("0");

  const handleRegisterPasskey = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    if (!passkeyAccount) {
      console.warn("PasskeyAccount not ready");
      return;
    }

    const res = await webauthn.client.register(
      username,
      window.crypto.randomUUID(),
      {authenticatorType: 'auto'},
    );
    console.debug(res);

    const parsed = webauthn.parsers.parseRegistration(res);
    console.debug(parsed);

    const credentialId = parsed.credential.id;
    const pubKeyPos = await parsePublicKeyBytes(parsed.credential.publicKey);
    console.debug({
      credentialId,
      pubKeyPos
    });

    const tx: Transaction = await passkeyAccount.call("setPubKey", [credentialId, pubKeyPos[0], pubKeyPos[1]]);
    console.debug({tx});
  };

  const handleSend = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    if (!passkeyAccount) {
      console.warn("PasskeyAccount not ready");
      return;
    }

    // 署名させたい Call data
    const callData = ethers.utils.solidityPack(
        ["address", "uint256", "bytes"],
        [sendTargetAddress, ethers.utils.parseEther(sendValue), "0x"]
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

    const tx = await passkeyAccount.call(
      "exec",
      [
        {
          target: sendTargetAddress,
          value: ethers.utils.parseEther(sendValue),
          data: "0x"
        },
        encodedSignature
      ]);
    console.debug({tx});
  };


  const handleConnectContract = async () => {
    if (!sdk) {
      console.warn("SDK not ready");
      return;
    }
    const contract = await sdk.getContract(contractAddress, PasskeyAccountABI);
    setPasskeyAccount(contract);

    const owner: string = await contract.call("owner");
    const passkeyUser: string = await contract.call("passkeyUser");
    const [credentialId, pubX, pubY]: [string, BigNumber, BigNumber] = await contract.call("pubKey");

    const paInfo: PasskeyAccountInfo = {owner, passkeyUser, credentialId, pubX, pubY};
    console.debug({passkeyAccountInfo: paInfo});
    setPaInfo(paInfo);
  };

  return (
    <main>
      <header className="bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between p-6 lg:px-8" aria-label="Global">
          <div className="flex flex-1">
            <div className="hidden lg:flex lg:gap-x-12">
              <h1 className="text-4xl font-semibold leading-6 text-gray-900">PASSKEY ON CONTRACT</h1>
            </div>
          </div>
          <div className="flex flex-1 justify-end">
            <ConnectWallet/>
          </div>
        </nav>
      </header>

      <div className="mx-8">
        <div className="overflow-hidden bg-white shadow sm:rounded-lg">
          <div className="px-4 py-6 sm:px-6">
            <h2 className="text-xl font-semibold leading-7 text-gray-900">Passkey Account</h2>
            <div className="py-4 flex flex-shrink-0 space-x-4">
              <button
                type="button"
                className="rounded-md bg-white font-medium text-indigo-600 hover:text-indigo-500"
                onClick={handleConnectContract}
              >
                Connect
              </button>
              <span className="text-gray-200" aria-hidden="true">|</span>
              <button
                type="button"
                className="rounded-md bg-white font-medium text-amber-600 hover:text-gray-800"
                onClick={handleRegisterPasskey}
              >
                Register Passkey
              </button>
            </div>
          </div>
          <div className="border-t border-gray-100">
            <dl className="divide-y divide-gray-100">
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Address</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{contractAddress}</dd>
              </div>
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Owner</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{paInfo.owner}</dd>
              </div>
              <div className="px-4 py-6 sm:grid sm:grid-cols-3 sm:gap-4 sm:px-6">
                <dt className="text-sm font-medium text-gray-900">Passkey User</dt>
                <dd className="mt-1 text-sm leading-6 text-gray-700 sm:col-span-2 sm:mt-0">{paInfo.passkeyUser}</dd>
              </div>
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
              <div className="md:w-1/3">
                <label className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
                       htmlFor="inline-target-address">
                  Target Address
                </label>
              </div>
              <div className="md:w-2/3">
                <input
                  className="bg-gray-200 appearance-none border-2 border-gray-200 rounded w-full py-2 px-4 text-gray-700 leading-tight focus:outline-none focus:bg-white focus:border-purple-500"
                  id="inline-target-address" type="text" value={sendTargetAddress}
                  onChange={e => setSendTargetAddress(e.target.value)}/>
              </div>
            </div>
            <div className="md:flex md:items-center mb-6">
              <div className="md:w-1/3">
                <label className="block text-gray-500 font-bold md:text-right mb-1 md:mb-0 pr-4"
                       htmlFor="inline-send-value">
                  Send Value
                </label>
              </div>
              <div className="md:w-2/3">
                <input
                  className="bg-gray-200 appearance-none border-2 border-gray-200 rounded w-full py-2 px-4 text-gray-700 leading-tight focus:outline-none focus:bg-white focus:border-purple-500"
                  id="inline-send-value" type="number" value={sendValue} onChange={e => setSendValue(e.target.value)}
                  placeholder="0.1"/>
              </div>
            </div>
            <div className="grid grid-cols-1 place-items-end">
              <button
                className="shadow bg-purple-500 hover:bg-purple-400 focus:shadow-outline focus:outline-none text-white font-bold py-2 px-4 rounded"
                type="button"
                onClick={handleSend}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}
