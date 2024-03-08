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
      <h1>Passkey on contract</h1>
      <ConnectWallet/>

      <br/>

      <p>Contract: {contractAddress}</p>
      <button onClick={handleConnectContract}>Connect</button>

      <br/>

      <p>Owner: {paInfo.owner}</p>
      <p>Passkey User: {paInfo.passkeyUser}</p>
      <p>Credential ID: {paInfo.credentialId}</p>
      <p>Public Key X: {paInfo.pubX.toString()}</p>
      <p>Public Key Y: {paInfo.pubY.toString()}</p>

      <button onClick={handleRegisterPasskey}>Register Passkey</button>

      <br/>
      <br/>

      <label>Send Target Address</label>
      <input value={sendTargetAddress} onChange={e => setSendTargetAddress(e.target.value)}/>

      <br/>
      <label>Send Value</label>
      <input type="number" value={sendValue} onChange={e => setSendValue(e.target.value)}/>

      <br/>
      <button onClick={handleSend}>Send</button>

    </main>
  );
}
