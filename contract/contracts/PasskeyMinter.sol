// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./Base64.sol";
import "./DemoCollection.sol";

contract PasskeyMinter {
    struct PubKey {
        uint256 x;
        uint256 y;
    }

    DemoCollection public immutable collection;

    constructor(address _collection) {
        require(
            block.chainid == 137 ||
                block.chainid == 80001 ||
                block.chainid == 80002,
            "PasskeyMinter: unsupported chain"
        );
        collection = DemoCollection(_collection);
    }

    mapping(string => PubKey) pubKeys;

    function publicKey(
        string calldata credentialId
    ) public view returns (string memory, uint256, uint256) {
        PubKey memory pubKey = pubKeys[credentialId];
        return (credentialId, pubKey.x, pubKey.y);
    }

    function setPublicKey(
        string calldata credentialId,
        uint256 x,
        uint256 y,
        string calldata randomString,
        bytes memory signature
    ) public {
        bytes memory encodedData = abi.encodePacked(x, y, randomString);
        bytes32 dataHash = keccak256(encodedData);
        require(
            _validateSignature(x, y, dataHash, signature),
            "PasskeyMinter: invalid signature"
        );
        pubKeys[credentialId] = PubKey(x, y);
    }

    function mint(
        string calldata credentialId,
        address account,
        bytes memory signature
    ) external {
        PubKey memory pubKey = pubKeys[credentialId];
        bytes memory encodedData = abi.encodePacked(account);
        bytes32 dataHash = keccak256(encodedData);
        require(
            _validateSignature(pubKey.x, pubKey.y, dataHash, signature),
            "PasskeyMinter: invalid signature"
        );
        collection.mint(account);
    }

    function validSignature(
        string calldata credentialId,
        bytes32 msgHash,
        bytes memory signature
    ) public view returns (bool) {
        PubKey memory pubKey = pubKeys[credentialId];
        return _validateSignature(pubKey.x, pubKey.y, msgHash, signature);
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
