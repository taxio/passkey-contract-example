// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC1271.sol";
import "./Base64.sol";
import "./Secp256r1.sol";

contract PasskeyAccount is Ownable, IERC1271 {
    struct Call {
        address target;
        uint256 value;
        bytes data;
    }

    constructor() Ownable(msg.sender) {}

    address _passkeyUser;
    string _credentialId;
    uint256 _pubKeyX;
    uint256 _pubKeyY;

    function pubKey() public view returns (string memory, uint256, uint256) {
        return (_credentialId, _pubKeyX, _pubKeyY);
    }

    function setPubKey(
        string calldata credId,
        uint256 x,
        uint256 y
    ) public onlyOwner {
        _credentialId = credId;
        _pubKeyX = x;
        _pubKeyY = y;
        _passkeyUser = address(
            uint160(uint256(keccak256(abi.encodePacked(x, y))))
        );
    }

    function passkeyUser() public view returns (address) {
        return _passkeyUser;
    }

    function exec(
        Call calldata data,
        bytes memory signature
    ) external returns (bytes memory) {
        require(
            _passkeyUser != address(0),
            "PasskeyAccount: public key not set"
        );

        bytes memory encodedData = abi.encodePacked(
            data.target,
            data.value,
            data.data
        );
        bytes32 dataHash = keccak256(encodedData);
        require(
            _validateSignature(dataHash, signature),
            "PasskeyAccount: invalid signature"
        );

        (bool success, bytes memory result) = data.target.call{
            value: data.value
        }(data.data);
        require(success, "PasskeyAccount: call failed");

        return result;
    }

    function isValidSignature(
        bytes32 msgHash,
        bytes memory signature
    ) public view override returns (bytes4) {
        if (_validateSignature(msgHash, signature)) {
            return IERC1271.isValidSignature.selector;
        }
        return 0xffffffff;
    }

    function _validateSignature(
        bytes32 msgHash,
        bytes memory signature
    ) internal view returns (bool) {
        require(_pubKeyX != 0 && _pubKeyY != 0, "Verifier: public key not set");

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
            Secp256r1.Verify(Passkey(_pubKeyX, _pubKeyY), r, s, uint(message));
    }

    receive() external payable {}
}