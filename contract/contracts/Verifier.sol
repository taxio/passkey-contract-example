// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "./Base64.sol";

contract Verifier {
    constructor() {}

    function echo(string calldata _msg) external pure returns (string memory) {
        return _msg;
    }

    function verify(
        string calldata credentialId,
        uint256 pubX,
        uint256 pubY,
        bytes32 msgHash,
        bytes memory signature
    ) external view returns (int) {
        bytes32 dataHash = keccak256(
            abi.encodePacked(credentialId, pubX, pubY)
        );
        int ret = 0;
        if (_validateSignature(pubX, pubY, dataHash, signature)) {
            ret += 1;
        }
        if (_validateSignature(pubX, pubY, msgHash, signature)) {
            ret += 10;
        }
        return ret;
    }

    function _validateSignature(
        uint256 pubKeyX,
        uint256 pubKeyY,
        bytes32 msgHash,
        bytes memory signature
    ) internal view returns (bool) {
        require(
            pubKeyX != 0 && pubKeyY != 0,
            "PasskeyMinter: public key not set"
        );

        (
            uint r,
            uint s,
            bytes memory authData,
            string memory clientDataPre,
            string memory clientDataPost
        ) = abi.decode(signature, (uint, uint, bytes, string, string));

        string memory opHashBase64 = Base64.encodeURL(bytes.concat(msgHash));
        string memory clientData = string.concat(
            clientDataPre,
            opHashBase64,
            clientDataPost
        );
        bytes32 clientHash = sha256(bytes(clientData));
        bytes32 message = sha256(bytes.concat(authData, clientHash));

        return
            p256verify(uint(message), r, s, pubKeyX, pubKeyY) ==
            bytes32(uint256(1));
    }

    function p256verify(
        uint256 m,
        uint256 r,
        uint256 s,
        uint256 x,
        uint256 y
    ) public view returns (bytes32) {
        bytes memory callData = abi.encodePacked(m, r, s, x, y);
        (bool success, bytes memory data) = address(0x100).staticcall(callData);
        require(success, "PasskeyAccount: precompiled call failed");
        bytes32 ret = abi.decode(data, (bytes32));
        return ret;
    }
}
