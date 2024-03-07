'use client'

import Image from "next/image";
import React, {useState} from "react";
import * as webauthn from "@passwordless-id/webauthn";
import base64url from 'base64url';
import { toBigInt } from "ethers";
import { ECDSASigValue } from '@peculiar/asn1-ecc';
import { AsnParser } from '@peculiar/asn1-schema';
import * as ethers from 'ethers';

async function parsePublicKeyBytes(publicKeyBytes: string): Promise<[BigInt, BigInt]> {
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
      toBigInt(base64url.toBuffer(jwk.x)),
      toBigInt(base64url.toBuffer(jwk.y))
    ];
  }
  throw new Error('Invalid public key');
};

function shouldRemoveLeadingZero(bytes: Uint8Array): boolean {
    return bytes[0] === 0x0 && (bytes[1] & (1 << 7)) !== 0;
};

function parseAuthSignature(authSignature: string): [BigInt, BigInt] {
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

  return [toBigInt(rBytes), toBigInt(sBytes)];
}

export default function Home() {
  const [username, setUsername] = useState("");
  const [pubKey, setPubKey] = useState("");

  const register = async () => {
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
    setPubKey(parsed.credential.publicKey);
  };

  const sign = async () => {
    // TODO: 署名させたいメッセージのハッシュ値 (をさらに Base64URL エンコードしたもの)
    const payload = ethers.keccak256(ethers.toUtf8Bytes("hello"));
    const challenge = webauthn.utils.toBase64url(ethers.getBytes(payload)).replace(/=/g, '');
    const authData = await webauthn.client.authenticate(
      [], // TODO: Contract に登録されている credentialId を入れる
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

    // TODO:
    //  これらの結果が secp256r1 形式で署名検証できるかどうか確かめる
    //  それができれば、Contract 側で署名検証ロジックを再現できる
    webauthn.server.verifySignature({
      algorithm: 'ES256',
      publicKey: pubKey,
      authenticatorData: authData.authenticatorData,
      clientData: authData.clientData,
      signature: authData.signature,
      verbose: true,
    });
    console.debug('verified');

    const authDataBytes = new Uint8Array(webauthn.utils.parseBase64url(authData.authenticatorData));
    const clientData = new TextDecoder().decode(webauthn.utils.parseBase64url(authData.clientData));
    const challengePos = clientData.indexOf(challenge);
    const challengePrefix = clientData.substring(0, challengePos);
    const challengeSuffix = clientData.substring(challengePos + challenge.length);

    const encodedSignature = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint", "uint", "bytes", "string", "string"],
      [signature[0], signature[1], authDataBytes, challengePrefix, challengeSuffix]
    );
    console.debug({
      payload,
      encodedSignature,
    });
  };


  return (
    <main>
      <h1>Passkey on contract</h1>
      
      <label>Username</label>
      <input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} />

      <button onClick={register}>Register</button>
      <button onClick={sign}>Sign</button>

      {/* TODO: contract address */}

      {/* TODO: register passkey */}

      {/* TODO: sign and verify */}

    </main>
  );
}
